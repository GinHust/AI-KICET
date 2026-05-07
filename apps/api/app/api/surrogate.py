import shutil
import tempfile
from pathlib import Path
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.config import settings
from app.services.surrogate_spectroscopy import (
    SpectroscopyAnalyzeRequest,
    SpectroscopyAnalyzeResponse,
    analyze_spectroscopy as run_spectroscopy_analysis,
)

router = APIRouter(prefix="/surrogate", tags=["surrogate"])


class CanteraRunRequest(BaseModel):
    temperatureK: float = Field(ge=700, le=2200)
    pressureTorr: float = Field(ge=1, le=1000)
    hMoleFraction: float = Field(ge=0, le=0.05)
    h2FlowSccm: float = Field(gt=0, le=5000)
    ch4FlowSccm: float = Field(gt=0, le=500)
    nitrogenFlowSccm: float = Field(ge=0, le=10)
    activationFactor: float = Field(ge=0.1, le=5)
    residenceFactor: float = Field(ge=0.1, le=5)


class CanteraCoverage(BaseModel):
    species: str
    coverage: float


class CanteraRunResponse(BaseModel):
    status: Literal["ready", "unavailable", "failed"]
    message: str
    growthRateUmPerHour: float | None = None
    mechanism: str | None = None
    mechanismSource: Literal["repo", "cantera-package", "missing"] = "missing"
    canteraVersion: str | None = None
    gasPhase: str | None = None
    surfacePhase: str | None = None
    nitrogenApplied: bool = False
    surfaceCoverages: list[CanteraCoverage] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return min(max(value, minimum), maximum)


def _cantera_compatible_path(mechanism_path: Path) -> tuple[str, str, list[str]]:
    display_path = str(mechanism_path)
    if display_path.isascii():
        return display_path, display_path, []

    cache_dir = Path(tempfile.gettempdir()) / "kicetic_cantera"
    cache_dir.mkdir(parents=True, exist_ok=True)
    cached_path = cache_dir / mechanism_path.name
    shutil.copy2(mechanism_path, cached_path)
    return str(cached_path), display_path, ["repo mechanism 경로에 비 ASCII 문자가 있어 Cantera 실행용 ASCII 임시 경로를 사용했습니다."]


def _resolve_mechanism() -> tuple[str | None, str | None, Literal["repo", "cantera-package", "missing"], list[str]]:
    mechanism_path = Path(settings.cantera_mechanism_path).resolve()
    if mechanism_path.exists():
        solver_path, display_path, notes = _cantera_compatible_path(mechanism_path)
        return solver_path, display_path, "repo", notes
    return "diamond.yaml", "diamond.yaml", "cantera-package", []


def _build_gas_composition(payload: CanteraRunRequest, gas_species: list[str]) -> tuple[dict[str, float], bool, list[str]]:
    notes: list[str] = []
    total_flow = max(payload.h2FlowSccm + payload.ch4FlowSccm + payload.nitrogenFlowSccm, 1e-12)
    ch4_ratio = _clamp(payload.ch4FlowSccm / payload.h2FlowSccm, 1e-6, 0.3)
    nitrogen_ratio_ppm = _clamp(payload.nitrogenFlowSccm / payload.ch4FlowSccm * 1_000_000, 0, 10_000)
    h_fraction = _clamp(payload.hMoleFraction, 1e-9, 0.04)
    ch3_fraction = _clamp(ch4_ratio * h_fraction * payload.activationFactor * 0.6, 1e-10, 0.03)
    ch4_fraction = _clamp(payload.ch4FlowSccm / total_flow, 1e-8, 0.25)
    nitrogen_fraction = _clamp(payload.nitrogenFlowSccm / total_flow, 0, 0.05)

    composition: dict[str, float] = {}
    if "H" in gas_species:
        composition["H"] = h_fraction
    if "CH4" in gas_species:
        composition["CH4"] = ch4_fraction
    if "CH3" in gas_species:
        composition["CH3"] = ch3_fraction
    if "N2" in gas_species and nitrogen_fraction > 0:
        composition["N2"] = nitrogen_fraction
        nitrogen_applied = True
    else:
        nitrogen_applied = False
        if nitrogen_ratio_ppm > 0:
            notes.append("diamond.yaml gas phase에 N2 species가 없어 질소 입력은 Cantera solver에는 직접 반영되지 않았습니다.")
    if "H2" in gas_species:
        composition["H2"] = max(1 - sum(composition.values()), 1e-6)

    notes.append(f"입력 유량은 CH4/H2 {ch4_ratio * 100:.2f}%, N2/CH4 {nitrogen_ratio_ppm:.0f} ppm으로 환산해 Cantera gas composition에 반영했습니다.")
    return composition, nitrogen_applied, notes


def _run_cantera(payload: CanteraRunRequest) -> CanteraRunResponse:
    try:
        import cantera as ct
    except ImportError:
        return CanteraRunResponse(
            status="unavailable",
            message="Cantera Python package가 설치되어 있지 않습니다.",
            mechanismSource="missing",
            notes=["프론트의 proxy 예측은 계속 사용할 수 있습니다."],
        )

    try:
        mechanism, mechanism_display, mechanism_source, mechanism_notes = _resolve_mechanism()
    except Exception as exc:
        return CanteraRunResponse(
            status="unavailable",
            message=f"diamond.yaml mechanism 준비 중 오류가 발생했습니다: {exc}",
            mechanismSource="missing",
            canteraVersion=ct.__version__,
            notes=["프론트의 proxy 예측은 계속 사용할 수 있습니다."],
        )

    if mechanism is None:
        return CanteraRunResponse(
            status="unavailable",
            message="diamond.yaml mechanism을 찾지 못했습니다.",
            mechanismSource="missing",
            canteraVersion=ct.__version__,
        )

    try:
        gas = ct.Solution(mechanism, settings.cantera_gas_phase)
        bulk = ct.Solution(mechanism, settings.cantera_bulk_phase)
        surface = ct.Interface(mechanism, settings.cantera_surface_phase, [gas, bulk])
        pressure_pa = payload.pressureTorr * 133.322368
        composition, nitrogen_applied, composition_notes = _build_gas_composition(payload, gas.species_names)
        notes = [*mechanism_notes, *composition_notes]

        gas.TPX = payload.temperatureK, pressure_pa, composition
        surface.TP = payload.temperatureK, pressure_pa
        surface.coverages = "c6HH:0.9, c6H*:0.1"
        surface.advance_coverages(_clamp(10 * payload.residenceFactor, 0.5, 80))

        production_rates = surface.net_production_rates
        carbon_index = surface.kinetics_species_names.index("C(d)")
        carbon_rate = max(float(production_rates[carbon_index]), 0)
        growth_rate = carbon_rate / float(bulk.density_mole) * 3600 * 1_000_000
        coverages = sorted(
            [
                CanteraCoverage(species=species, coverage=round(float(coverage), 6))
                for species, coverage in zip(surface.species_names, surface.coverages)
                if float(coverage) > 1e-6
            ],
            key=lambda item: item.coverage,
            reverse=True,
        )[:6]
        notes.extend(
            [
                "CH₃ mole fraction은 CH₄/H₂, H mole fraction, activation factor에서 만든 conservative radical proxy입니다.",
                "residence factor는 surface coverage advance time에만 반영했습니다.",
            ]
        )

        return CanteraRunResponse(
            status="ready",
            message="Cantera diamond.yaml 실행이 완료되었습니다.",
            growthRateUmPerHour=round(growth_rate, 4),
            mechanism=mechanism_display,
            mechanismSource=mechanism_source,
            canteraVersion=ct.__version__,
            gasPhase=settings.cantera_gas_phase,
            surfacePhase=settings.cantera_surface_phase,
            nitrogenApplied=nitrogen_applied,
            surfaceCoverages=coverages,
            notes=notes,
        )
    except Exception as exc:
        return CanteraRunResponse(
            status="failed",
            message=f"Cantera 실행 중 오류가 발생했습니다: {exc}",
            mechanism=mechanism_display,
            mechanismSource=mechanism_source,
            canteraVersion=ct.__version__,
            gasPhase=settings.cantera_gas_phase,
            surfacePhase=settings.cantera_surface_phase,
            notes=[*mechanism_notes, "프론트의 proxy 예측은 계속 사용할 수 있습니다."],
        )


@router.post("/cantera/run", response_model=CanteraRunResponse)
def run_cantera(payload: CanteraRunRequest) -> CanteraRunResponse:
    return _run_cantera(payload)


@router.post("/spectroscopy/analyze", response_model=SpectroscopyAnalyzeResponse)
def analyze_surrogate_spectroscopy(payload: SpectroscopyAnalyzeRequest) -> SpectroscopyAnalyzeResponse:
    return run_spectroscopy_analysis(payload)
