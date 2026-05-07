from __future__ import annotations

from typing import Optional

import optuna
from fastapi import APIRouter, HTTPException, Query

from app.config import settings
from app.models.domain import (
    MpcvdAppliedBound,
    MpcvdHistoryPoint,
    MpcvdImportanceOut,
    MpcvdRecommendation,
    MpcvdRecommendConstraint,
    MpcvdRecommendRequest,
    MpcvdStats,
    MpcvdStatusOut,
    MpcvdSubmitRequest,
    MpcvdTrialOut,
)

optuna.logging.set_verbosity(optuna.logging.WARNING)

router = APIRouter(prefix="/optimizer", tags=["optimizer"])

SUBSTRATE_CHOICES = ["4H SiC", "Diamond"]

DISTRIBUTIONS: dict[str, optuna.distributions.BaseDistribution] = {
    "substrate": optuna.distributions.CategoricalDistribution(SUBSTRATE_CHOICES),
    "power": optuna.distributions.FloatDistribution(0.6, 5.0),
    "pressure": optuna.distributions.FloatDistribution(0.0, 200.0),
    "h_flow": optuna.distributions.FloatDistribution(0.0, 1000.0),
    "ch4_flow": optuna.distributions.FloatDistribution(0.0, 100.0),
    "ch4_ratio": optuna.distributions.FloatDistribution(0.0, 20.0),
}

BOUND_PARAMETER_ALIASES = {
    "chamber_pressure": "pressure",
    "process_pressure": "pressure",
    "pressure": "pressure",
    "microwave_power": "power",
    "plasma_power": "power",
    "power": "power",
    "h2_flow": "h_flow",
    "hydrogen_flow": "h_flow",
    "h_flow": "h_flow",
    "ch4_flow": "ch4_flow",
    "methane_flow": "ch4_flow",
    "ch4_in_h2_fraction": "ch4_ratio",
    "ch4_fraction": "ch4_ratio",
    "ch4_ratio": "ch4_ratio",
    "ch4_h2_ratio": "ch4_ratio",
    "methane_ratio": "ch4_ratio",
}


def _canonical_bound_parameter(parameter: str) -> str | None:
    normalized = (
        parameter.strip()
        .lower()
        .replace("-", "_")
        .replace(" ", "_")
        .replace("/", "_")
        .replace("₂", "2")
        .replace("₄", "4")
    )
    return BOUND_PARAMETER_ALIASES.get(normalized)


def _storage_label(storage: str) -> str:
    normalized = storage.lower()
    if normalized.startswith("sqlite"):
        return "sqlite"
    if normalized.startswith("postgresql"):
        return "postgresql"
    return "configured"


def _build_safe_distributions(
    constraints: list[MpcvdRecommendConstraint],
) -> tuple[dict[str, optuna.distributions.BaseDistribution], list[MpcvdAppliedBound], list[str]]:
    distributions = dict(DISTRIBUTIONS)
    applied_bounds: list[MpcvdAppliedBound] = []
    safety_notes: list[str] = []

    for constraint in constraints:
        for bound in constraint.numeric_bounds:
            parameter = _canonical_bound_parameter(bound.parameter)
            if parameter is None:
                safety_notes.append(f"{constraint.constraint_id}:{bound.parameter}은 BO 파라미터와 직접 매핑되지 않아 추천 경계에서 제외했습니다.")
                continue

            distribution = distributions.get(parameter)
            if not isinstance(distribution, optuna.distributions.FloatDistribution):
                safety_notes.append(f"{constraint.constraint_id}:{bound.parameter}은 numeric BO 분포가 아니어서 추천 경계에서 제외했습니다.")
                continue

            lower = bound.min_value if bound.min_value is not None else bound.recommended_min
            upper = bound.max_value if bound.max_value is not None else bound.recommended_max
            if lower is None and upper is None:
                safety_notes.append(f"{constraint.constraint_id}:{bound.parameter}은 적용할 숫자 범위가 없어 추천 경계에서 제외했습니다.")
                continue

            next_low = max(distribution.low, lower) if lower is not None else distribution.low
            next_high = min(distribution.high, upper) if upper is not None else distribution.high
            if next_low > next_high:
                safety_notes.append(f"{constraint.constraint_id}:{bound.parameter}은 기존 BO 탐색공간과 겹치지 않아 추천 경계에서 제외했습니다.")
                continue

            distributions[parameter] = optuna.distributions.FloatDistribution(
                next_low,
                next_high,
                log=distribution.log,
                step=distribution.step,
            )
            applied_bounds.append(MpcvdAppliedBound(
                parameter=parameter,
                source_parameter=bound.parameter,
                source_constraint_id=constraint.constraint_id,
                unit=bound.unit,
                min_value=next_low,
                max_value=next_high,
                recommended_min=bound.recommended_min,
                recommended_max=bound.recommended_max,
                basis=bound.basis,
                source=bound.source,
                confidence=bound.confidence,
            ))

            if next_low != distribution.low or next_high != distribution.high:
                safety_notes.append(f"{parameter} 탐색 범위를 {next_low:g}–{next_high:g}{' ' + bound.unit if bound.unit else ''}로 제한했습니다.")

    if constraints and not applied_bounds:
        safety_notes.append("승인된 numeric bounds가 BO 파라미터와 매핑되지 않아 기본 탐색공간을 사용했습니다.")
    if not constraints:
        safety_notes.append("승인된 Research numeric bounds가 없어 기본 BO 탐색공간을 사용했습니다.")

    return distributions, applied_bounds, safety_notes


def _clamp_to_distribution(value: float, distribution: optuna.distributions.BaseDistribution | None) -> float:
    if not isinstance(distribution, optuna.distributions.FloatDistribution):
        return value
    return min(max(value, distribution.low), distribution.high)


def _make_recommendation(
    substrate: str,
    distributions: dict[str, optuna.distributions.BaseDistribution],
    applied_bounds: list[MpcvdAppliedBound] | None = None,
    safety_notes: list[str] | None = None,
) -> MpcvdRecommendation:
    study = _load_existing_study()
    study.enqueue_trial({"substrate": substrate})
    trial = study.ask(fixed_distributions=distributions)
    study.tell(trial, state=optuna.trial.TrialState.PRUNED)

    h = trial.params.get("h_flow", 480.0)
    ratio = trial.params.get("ch4_ratio")
    if ratio is None:
        c = trial.params.get("ch4_flow", 20.0)
        ratio = (c / h * 100) if h > 0 else 0.0
    else:
        c = (h * ratio / 100) if h > 0 else 0.0
        c = _clamp_to_distribution(c, distributions.get("ch4_flow"))
        ratio = (c / h * 100) if h > 0 else 0.0

    return MpcvdRecommendation(
        trial_number=trial.number,
        substrate=trial.params.get("substrate", substrate),
        power=round(trial.params.get("power", 5.0), 2),
        pressure=round(trial.params.get("pressure", 120.0), 1),
        h_flow=round(h, 1),
        ch4_flow=round(c, 1),
        ch4_ratio=round(ratio, 2),
        applied_bounds=applied_bounds or [],
        safety_notes=safety_notes or [],
    )


def _load_existing_study() -> optuna.Study:
    storage = settings.optuna_storage
    try:
        return optuna.load_study(study_name=settings.mpcvd_study_name, storage=storage)
    except KeyError:
        if storage.lower().startswith("sqlite"):
            return _create_study(storage)
        raise HTTPException(
            status_code=404,
            detail=f"BO study '{settings.mpcvd_study_name}' was not found.",
        )
    except Exception as exc:
        if storage.lower().startswith("sqlite"):
            try:
                return _create_study(storage)
            except Exception:
                pass
        raise HTTPException(
            status_code=503,
            detail="Failed to connect to BO study storage."
        ) from exc


def _create_study(storage: str) -> optuna.Study:
    sampler = optuna.samplers.TPESampler(
        multivariate=True, group=True, n_startup_trials=10
    )
    return optuna.create_study(
        study_name=settings.mpcvd_study_name,
        direction="maximize",
        sampler=sampler,
        storage=storage,
    )


def _load_or_create_study() -> optuna.Study:
    storage = settings.optuna_storage
    try:
        return optuna.load_study(study_name=settings.mpcvd_study_name, storage=storage)
    except KeyError:
        return _create_study(storage)
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Failed to connect to BO study storage."
        ) from exc


def _completed(study: optuna.Study, substrate: str | None = None) -> list[optuna.trial.FrozenTrial]:
    return [
        t for t in study.trials
        if t.state == optuna.trial.TrialState.COMPLETE
        and t.value is not None
        and (substrate is None or t.params.get("substrate") == substrate)
    ]


@router.get("/status", response_model=MpcvdStatusOut)
def get_status() -> MpcvdStatusOut:
    study = _load_existing_study()
    done = sorted(_completed(study), key=lambda item: item.number)
    last = done[-1] if done else None
    return MpcvdStatusOut(
        storage=_storage_label(settings.optuna_storage),
        study_name=settings.mpcvd_study_name,
        study_exists=True,
        total_trials=len(study.trials),
        completed_trials=len(done),
        last_completed_trial_number=last.number if last else None,
        last_completed_at=last.datetime_complete if last else None,
        source="real",
    )


@router.get("/stats", response_model=MpcvdStats)
def get_stats() -> MpcvdStats:
    study = _load_existing_study()
    done = _completed(study)
    best = max(done, key=lambda t: t.value, default=None)
    counts: dict[str, int] = {}
    for t in done:
        sub = t.params.get("substrate", "unknown")
        counts[sub] = counts.get(sub, 0) + 1
    return MpcvdStats(
        total_trials=len(done),
        best_growth_rate=best.value if best else None,
        best_trial_number=best.number if best else None,
        substrate_counts=counts,
    )


@router.get("/trials", response_model=list[MpcvdTrialOut])
def list_trials(substrate: Optional[str] = None) -> list[MpcvdTrialOut]:
    study = _load_existing_study()
    return [
        MpcvdTrialOut(
            trial_number=t.number,
            substrate=t.params.get("substrate", ""),
            power=t.params.get("power"),
            pressure=t.params.get("pressure"),
            h_flow=t.params.get("h_flow"),
            ch4_flow=t.params.get("ch4_flow"),
            ch4_ratio=t.params.get("ch4_ratio"),
            growth_rate=t.value,
            completed_at=t.datetime_complete,
        )
        for t in _completed(study, substrate)
    ]


@router.get("/history", response_model=list[MpcvdHistoryPoint])
def get_history(substrate: Optional[str] = None) -> list[MpcvdHistoryPoint]:
    study = _load_existing_study()
    results: list[MpcvdHistoryPoint] = []
    best: float | None = None
    for t in sorted(_completed(study, substrate), key=lambda x: x.number):
        if best is None or t.value > best:
            best = t.value
        results.append(MpcvdHistoryPoint(
            trial_number=t.number,
            value=round(t.value, 2),
            best_value=round(best, 2),
        ))
    return results


@router.get("/best", response_model=MpcvdTrialOut)
def get_best(substrate: Optional[str] = None) -> MpcvdTrialOut:
    study = _load_existing_study()
    done = _completed(study, substrate)
    if not done:
        raise HTTPException(status_code=404, detail="No completed trials.")
    best = max(done, key=lambda t: t.value)
    return MpcvdTrialOut(
        trial_number=best.number,
        substrate=best.params.get("substrate", ""),
        power=best.params.get("power"),
        pressure=best.params.get("pressure"),
        h_flow=best.params.get("h_flow"),
        ch4_flow=best.params.get("ch4_flow"),
        ch4_ratio=best.params.get("ch4_ratio"),
        growth_rate=best.value,
        completed_at=best.datetime_complete,
    )


@router.get("/recommend", response_model=MpcvdRecommendation)
def get_recommendation(substrate: str = Query(default="4H SiC", pattern="^(4H SiC|Diamond)$")) -> MpcvdRecommendation:
    return _make_recommendation(substrate, DISTRIBUTIONS)


@router.post("/recommend", response_model=MpcvdRecommendation)
def post_recommendation(payload: MpcvdRecommendRequest) -> MpcvdRecommendation:
    distributions, applied_bounds, safety_notes = _build_safe_distributions(payload.constraints)
    return _make_recommendation(payload.substrate, distributions, applied_bounds, safety_notes)


@router.post("/submit", response_model=MpcvdTrialOut)
def submit_trial(payload: MpcvdSubmitRequest) -> MpcvdTrialOut:
    study = _load_or_create_study()

    study.enqueue_trial({
        "substrate": payload.substrate,
        "power": payload.power,
        "pressure": payload.pressure,
        "h_flow": payload.h_flow,
        "ch4_flow": payload.ch4_flow,
        "ch4_ratio": payload.ch4_ratio,
    })

    def _objective(trial: optuna.Trial) -> float:
        trial.suggest_categorical("substrate", SUBSTRATE_CHOICES)
        trial.suggest_float("power", 0.6, 5.0)
        trial.suggest_float("pressure", 0.0, 200.0)
        trial.suggest_float("h_flow", 0.0, 1000.0)
        trial.suggest_float("ch4_flow", 0.0, 100.0)
        trial.suggest_float("ch4_ratio", 0.0, 20.0)
        return payload.growth_rate

    study.optimize(_objective, n_trials=1)

    done = _completed(study)
    latest = max(done, key=lambda t: t.number)
    return MpcvdTrialOut(
        trial_number=latest.number,
        substrate=latest.params.get("substrate", ""),
        power=latest.params.get("power"),
        pressure=latest.params.get("pressure"),
        h_flow=latest.params.get("h_flow"),
        ch4_flow=latest.params.get("ch4_flow"),
        ch4_ratio=latest.params.get("ch4_ratio"),
        growth_rate=latest.value,
        completed_at=latest.datetime_complete,
    )


@router.get("/importance", response_model=list[MpcvdImportanceOut])
def get_importance() -> list[MpcvdImportanceOut]:
    study = _load_existing_study()
    if len(_completed(study)) < 2:
        return []
    try:
        importance = optuna.importance.get_param_importances(study)
    except AssertionError:
        return []
    return [
        MpcvdImportanceOut(param=k, importance=round(v, 4))
        for k, v in sorted(importance.items(), key=lambda x: x[1], reverse=True)
    ]
