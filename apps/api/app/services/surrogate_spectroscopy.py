from __future__ import annotations

import csv
import io
import json
import math
import re
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Protocol

from pydantic import AliasChoices, BaseModel, Field

from app.config import settings
from app.services.surrogate_reference_providers import (
    CodReferenceProvider,
    MaterialsProjectReferenceProvider,
    ReferencePattern,
    ReferenceProvider as OpenReferenceProvider,
    RruffReferenceProvider,
)

SpectroscopyMode = Literal["xrd", "raman", "auto"]
ResolvedSpectroscopyMode = Literal["xrd", "raman"]
AnalysisStatus = Literal["ready", "partial", "failed"]

_ALLOWED_EXTENSIONS = {".csv", ".txt"}
_COMMENT_PREFIXES = ("#", "//", ";")
_UNSAFE_CLAIM_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\b(proves?|confirmed|confirms|definitively|unambiguously)\b", re.IGNORECASE), "suggests"),
    (re.compile(r"\bis (pure|phase-pure|definitely|certainly)\b", re.IGNORECASE), "may be"),
    (re.compile(r"\bidentif(?:y|ies|ied)\s+as\b", re.IGNORECASE), "is consistent with"),
    (re.compile(r"\bquantif(?:y|ies|ied)\b", re.IGNORECASE), "estimates qualitatively"),
)


class SpectroscopyFilePayload(BaseModel):
    filename: str = Field(min_length=1)
    label: str | None = None
    contentText: str = Field(min_length=1)


class SpectroscopyPreprocessingRequest(BaseModel):
    smoothing: bool = True
    baselineCorrection: bool = Field(default=True, validation_alias=AliasChoices("baselineCorrection", "baseline"))
    normalization: bool = True
    smoothingWindow: int = Field(default=5, ge=1, le=51)


class SpectroscopyReferenceLookupRequest(BaseModel):
    enabled: bool = True
    providers: list[Literal["materials_project", "cod", "rruff"]] | None = None


class SpectroscopyAnalysisRequest(BaseModel):
    enabled: bool = True


class SpectroscopyAnalyzeRequest(BaseModel):
    mode: SpectroscopyMode = "auto"
    expectedMaterial: str = Field(default="", max_length=200)
    files: list[SpectroscopyFilePayload] = Field(min_length=1, max_length=12)
    preprocessing: SpectroscopyPreprocessingRequest = Field(default_factory=SpectroscopyPreprocessingRequest)
    referenceLookup: SpectroscopyReferenceLookupRequest = Field(default_factory=SpectroscopyReferenceLookupRequest)
    analysis: SpectroscopyAnalysisRequest = Field(default_factory=SpectroscopyAnalysisRequest)


class SpectroscopyPoint(BaseModel):
    x: float
    intensity: float


class SpectroscopyRawSummary(BaseModel):
    pointCount: int
    xMin: float
    xMax: float
    intensityMin: float
    intensityMax: float
    skippedRows: int = 0


class SpectroscopyPreprocessingMetadata(BaseModel):
    smoothing: dict
    baselineCorrection: dict
    normalization: dict


class SpectroscopySeries(BaseModel):
    id: str
    filename: str
    label: str
    mode: ResolvedSpectroscopyMode
    xAxisLabel: str
    yAxisLabel: str = "Normalized intensity (a.u.)"
    rawSummary: SpectroscopyRawSummary
    preprocessing: SpectroscopyPreprocessingMetadata
    points: list[SpectroscopyPoint]
    warnings: list[str] = Field(default_factory=list)


class SpectroscopyPeak(BaseModel):
    seriesId: str
    position: float
    intensity: float
    prominence: float
    rank: int
    annotation: str


class SpectroscopyComparisonObservation(BaseModel):
    kind: Literal["peak_shift", "intensity_ratio", "sample_count"]
    message: str
    seriesIds: list[str]
    values: dict[str, float | str]


class SpectroscopyComparison(BaseModel):
    mode: Literal["single", "overlay", "stacked"]
    seriesIds: list[str]
    observations: list[SpectroscopyComparisonObservation] = Field(default_factory=list)


class SpectroscopyReferenceCandidate(BaseModel):
    provider: str
    material: str
    source: str
    provenance: str
    peaks: list[float] = Field(default_factory=list)
    caveat: str


class SpectroscopyReferences(BaseModel):
    query: str
    providersRequested: list[str]
    candidates: list[SpectroscopyReferenceCandidate] = Field(default_factory=list)
    unavailableReason: str | None = None
    warnings: list[str] = Field(default_factory=list)


class SpectroscopyFigureMetadata(BaseModel):
    renderer: Literal["svg-first"] = "svg-first"
    xAxisLabel: str
    yAxisLabel: str = "Normalized intensity (a.u.)"
    layout: Literal["single", "overlay", "stacked"]
    sampleLabels: list[str]
    peakAnnotationCount: int
    referenceMarkerCount: int
    exports: dict[str, str]
    recommendedCaption: str
    methodNote: str


class SpectroscopyAdvisoryAnalysis(BaseModel):
    mode: Literal["template", "openai", "disabled"]
    summary: str
    observedPeaks: list[str] = Field(default_factory=list)
    sampleComparison: list[str] = Field(default_factory=list)
    referenceNotes: list[str] = Field(default_factory=list)
    caveats: list[str] = Field(default_factory=list)
    manualVerification: str
    unsupportedClaimsBlocked: list[str] = Field(default_factory=list)


class SpectroscopyAnalyzeResponse(BaseModel):
    status: AnalysisStatus
    mode: ResolvedSpectroscopyMode
    series: list[SpectroscopySeries]
    peaks: list[SpectroscopyPeak]
    comparison: SpectroscopyComparison
    references: SpectroscopyReferences
    figure: SpectroscopyFigureMetadata
    analysis: SpectroscopyAdvisoryAnalysis
    warnings: list[str] = Field(default_factory=list)


@dataclass(frozen=True)
class ParsedSpectrum:
    filename: str
    label: str
    rows: list[tuple[float, float]]
    skipped_rows: int
    warnings: list[str]


class ReferenceProvider(Protocol):
    name: str

    def lookup(self, expected_material: str, mode: ResolvedSpectroscopyMode) -> list[SpectroscopyReferenceCandidate]: ...


class OpenReferenceProviderAdapter:
    def __init__(self, provider: OpenReferenceProvider) -> None:
        self.provider = provider
        self.name = provider.name

    def lookup(self, expected_material: str, mode: ResolvedSpectroscopyMode) -> list[SpectroscopyReferenceCandidate]:
        references, status = self.provider.lookup(expected_material, mode)
        if status.status != "ready":
            raise RuntimeError(status.unavailable_reason or f"{self.name} provider is unavailable")
        return [_reference_pattern_to_candidate(pattern) for pattern in references]


def default_reference_providers() -> list[ReferenceProvider]:
    cache_dir_value = getattr(settings, "spectroscopy_reference_cache_dir", None)
    cache_dir = Path(cache_dir_value) if cache_dir_value else None
    return [
        OpenReferenceProviderAdapter(MaterialsProjectReferenceProvider(api_key=getattr(settings, "materials_project_api_key", None) or getattr(settings, "mp_api_key", None))),
        OpenReferenceProviderAdapter(CodReferenceProvider(cache_dir=cache_dir)),
        OpenReferenceProviderAdapter(RruffReferenceProvider(cache_dir=cache_dir)),
    ]


class SpectroscopyService:
    def __init__(self, reference_providers: list[ReferenceProvider] | None = None) -> None:
        self.reference_providers = reference_providers if reference_providers is not None else default_reference_providers()

    def analyze(self, payload: SpectroscopyAnalyzeRequest) -> SpectroscopyAnalyzeResponse:
        warnings: list[str] = []
        parsed: list[ParsedSpectrum] = []
        for file_payload in payload.files:
            try:
                parsed.append(parse_spectrum_file(file_payload))
            except ValueError as exc:
                warnings.append(f"{file_payload.filename}: {exc}")

        if not parsed:
            mode = "xrd" if payload.mode in ("auto", "xrd") else "raman"
            references = SpectroscopyReferences(query=payload.expectedMaterial, providersRequested=_requested_providers(payload.referenceLookup))
            figure = _build_figure_metadata(mode, [], [], references, "single")
            return SpectroscopyAnalyzeResponse(
                status="failed",
                mode=mode,
                series=[],
                peaks=[],
                comparison=SpectroscopyComparison(mode="single", seriesIds=[]),
                references=references,
                figure=figure,
                analysis=_build_template_analysis(mode, [], [], references, enabled=payload.analysis.enabled),
                warnings=warnings or ["No valid spectra were parsed."],
            )

        mode, mode_warnings = resolve_mode(payload.mode, parsed)
        warnings.extend(mode_warnings)

        series = [preprocess_spectrum(item, mode, payload.preprocessing) for item in parsed]
        peaks: list[SpectroscopyPeak] = []
        for item in series:
            peaks.extend(detect_peaks(item))

        comparison = compare_series(series, peaks)
        references = self.lookup_references(payload.referenceLookup, payload.expectedMaterial, mode)
        warnings.extend(references.warnings)
        figure = _build_figure_metadata(mode, series, peaks, references, comparison.mode)
        analysis = build_advisory_analysis(payload.analysis, mode, series, peaks, comparison, references)
        warnings.extend(item for s in series for item in s.warnings)

        status: AnalysisStatus = "ready"
        if references.unavailableReason or warnings:
            status = "partial"

        return SpectroscopyAnalyzeResponse(
            status=status,
            mode=mode,
            series=series,
            peaks=peaks,
            comparison=comparison,
            references=references,
            figure=figure,
            analysis=analysis,
            warnings=dedupe_preserve_order(warnings),
        )

    def lookup_references(
        self,
        request: SpectroscopyReferenceLookupRequest,
        expected_material: str,
        mode: ResolvedSpectroscopyMode,
    ) -> SpectroscopyReferences:
        requested = _requested_providers(request)
        references = SpectroscopyReferences(query=expected_material, providersRequested=requested)
        if not request.enabled:
            references.unavailableReason = "Reference lookup disabled by request."
            return references
        if not expected_material.strip():
            references.unavailableReason = "Expected material/formula was not provided, so reference lookup was skipped."
            references.warnings.append("Add an expected material/formula to enable provenance-backed reference search.")
            return references

        provider_map = {provider.name: provider for provider in self.reference_providers}
        failure_reasons: list[str] = []
        for provider_name in requested:
            provider = provider_map.get(provider_name)
            if provider is None:
                failure_reasons.append(f"{provider_name}: provider adapter is not configured")
                continue
            try:
                provider_result = provider.lookup(expected_material.strip(), mode)
                references.candidates.extend(_coerce_provider_result(provider_name, provider_result, failure_reasons))
            except Exception as exc:  # provider failures must be isolated
                failure_reasons.append(f"{provider_name}: {exc}")

        if failure_reasons:
            references.warnings.extend(failure_reasons)
        if not references.candidates:
            references.unavailableReason = "No reference patterns were available from the configured open providers."
        return references


def _coerce_provider_result(provider_name: str, provider_result: object, failure_reasons: list[str]) -> list[SpectroscopyReferenceCandidate]:
    """Accept either core-service candidates or provider-adapter pattern/status tuples."""

    if isinstance(provider_result, list):
        return provider_result
    if isinstance(provider_result, tuple) and len(provider_result) == 2 and hasattr(provider_result[1], "status"):
        patterns, status = provider_result
        status_value = getattr(status, "status", "failed")
        reason = getattr(status, "unavailable_reason", None)
        if status_value != "ready" and reason:
            failure_reasons.append(f"{provider_name}: {reason}")
        return [_reference_pattern_to_candidate(pattern) for pattern in patterns]
    raise TypeError(f"{provider_name} provider returned an unsupported reference result shape")


def _reference_pattern_to_candidate(pattern: ReferencePattern) -> SpectroscopyReferenceCandidate:
    notes = []
    if pattern.license_note:
        notes.append(pattern.license_note)
    notes.extend(pattern.warnings)
    caveat = pattern.provenance
    if notes:
        caveat = f"{caveat} {' '.join(notes)}"
    source_parts = [part for part in [pattern.source_id, pattern.source_url] if part]
    return SpectroscopyReferenceCandidate(
        provider=pattern.provider,
        material=pattern.material_name,
        source="; ".join(source_parts) if source_parts else "configured reference adapter",
        provenance=pattern.provenance,
        peaks=[round(peak.position, 6) for peak in pattern.peaks],
        caveat=caveat,
    )


def analyze_spectroscopy(payload: SpectroscopyAnalyzeRequest) -> SpectroscopyAnalyzeResponse:
    return SpectroscopyService().analyze(payload)


def parse_spectrum_file(payload: SpectroscopyFilePayload) -> ParsedSpectrum:
    suffix = Path(payload.filename).suffix.lower()
    if suffix not in _ALLOWED_EXTENSIONS:
        raise ValueError("unsupported extension; CSV/TXT text payloads are the MVP input format")
    rows: list[tuple[float, float]] = []
    skipped = 0
    for raw_line in io.StringIO(payload.contentText):
        line = raw_line.strip().replace("\ufeff", "")
        if not line or line.startswith(_COMMENT_PREFIXES):
            continue
        values = _split_numeric_line(line, suffix)
        if values is None:
            skipped += 1
            continue
        rows.append(values)
    if len(rows) < 5:
        raise ValueError(f"too few numeric two-column points ({len(rows)} parsed, at least 5 required)")
    rows.sort(key=lambda pair: pair[0])
    label = payload.label.strip() if payload.label and payload.label.strip() else Path(payload.filename).stem
    return ParsedSpectrum(filename=payload.filename, label=label, rows=rows, skipped_rows=skipped, warnings=[])


def _split_numeric_line(line: str, suffix: str) -> tuple[float, float] | None:
    if suffix == ".csv" or "," in line:
        try:
            cells = next(csv.reader([line]))
        except csv.Error:
            return None
    else:
        cells = re.split(r"\s+", line)
    numeric: list[float] = []
    for cell in cells:
        token = cell.strip()
        if not token:
            continue
        try:
            numeric.append(float(token))
        except ValueError:
            continue
        if len(numeric) == 2:
            break
    if len(numeric) < 2 or not all(math.isfinite(value) for value in numeric):
        return None
    return numeric[0], numeric[1]


def resolve_mode(requested: SpectroscopyMode, parsed: list[ParsedSpectrum]) -> tuple[ResolvedSpectroscopyMode, list[str]]:
    if requested in ("xrd", "raman"):
        return requested, []
    names = " ".join(item.filename.lower() for item in parsed)
    all_x = [x for item in parsed for x, _ in item.rows]
    x_min, x_max = min(all_x), max(all_x)
    if "raman" in names or "shift" in names:
        return "raman", ["Mode auto-resolved to Raman from filename signal."]
    if "xrd" in names or "2theta" in names or "2-theta" in names:
        return "xrd", ["Mode auto-resolved to XRD from filename signal."]
    if x_max > 250:
        return "raman", ["Mode auto-resolved to Raman because x-axis extends beyond common lab XRD 2θ ranges."]
    if 0 <= x_min and x_max <= 180:
        return "xrd", ["Mode auto-resolved to XRD from numeric x-axis range."]
    return "xrd", ["Mode auto was ambiguous; defaulted safely to XRD axis labeling."]


def preprocess_spectrum(parsed: ParsedSpectrum, mode: ResolvedSpectroscopyMode, request: SpectroscopyPreprocessingRequest) -> SpectroscopySeries:
    xs = [x for x, _ in parsed.rows]
    ys = [y for _, y in parsed.rows]
    warnings = list(parsed.warnings)
    smoothed = moving_average(ys, request.smoothingWindow if request.smoothing else 1)
    baseline = rolling_minimum(smoothed, max(5, request.smoothingWindow * 3)) if request.baselineCorrection else [0.0] * len(smoothed)
    corrected = [max(y - b, 0.0) for y, b in zip(smoothed, baseline)]
    if not request.baselineCorrection:
        corrected = smoothed
    normalized = normalize(corrected) if request.normalization else corrected
    points = [SpectroscopyPoint(x=round(x, 6), intensity=round(y, 6)) for x, y in zip(xs, normalized)]
    return SpectroscopySeries(
        id=_stable_series_id(parsed.filename, parsed.label),
        filename=parsed.filename,
        label=parsed.label,
        mode=mode,
        xAxisLabel=x_axis_label(mode),
        rawSummary=SpectroscopyRawSummary(
            pointCount=len(parsed.rows),
            xMin=min(xs),
            xMax=max(xs),
            intensityMin=min(ys),
            intensityMax=max(ys),
            skippedRows=parsed.skipped_rows,
        ),
        preprocessing=SpectroscopyPreprocessingMetadata(
            smoothing={"enabled": request.smoothing, "method": "centered moving average", "window": request.smoothingWindow if request.smoothing else 1},
            baselineCorrection={"enabled": request.baselineCorrection, "method": "rolling minimum subtraction with non-negative clamp"},
            normalization={"enabled": request.normalization, "method": "max scaling", "range": [0, 1] if request.normalization else "native"},
        ),
        points=points,
        warnings=warnings,
    )


def moving_average(values: list[float], window: int) -> list[float]:
    if window <= 1 or len(values) <= 2:
        return [float(v) for v in values]
    if window % 2 == 0:
        window += 1
    radius = window // 2
    output: list[float] = []
    for index in range(len(values)):
        start = max(0, index - radius)
        end = min(len(values), index + radius + 1)
        output.append(sum(values[start:end]) / (end - start))
    return output


def rolling_minimum(values: list[float], window: int) -> list[float]:
    if window % 2 == 0:
        window += 1
    radius = window // 2
    return [min(values[max(0, i - radius) : min(len(values), i + radius + 1)]) for i in range(len(values))]


def normalize(values: list[float]) -> list[float]:
    max_value = max(values) if values else 0.0
    if max_value <= 0:
        return [0.0 for _ in values]
    return [v / max_value for v in values]


def detect_peaks(series: SpectroscopySeries, max_peaks: int = 10, threshold: float = 0.12) -> list[SpectroscopyPeak]:
    points = series.points
    if len(points) < 3:
        return []
    intensities = [point.intensity for point in points]
    if max(intensities) - min(intensities) < 0.05:
        return []
    candidates: list[tuple[float, float, float]] = []
    for i in range(1, len(points) - 1):
        current = points[i].intensity
        if current < threshold or current < points[i - 1].intensity or current < points[i + 1].intensity:
            continue
        left_floor = min(intensities[max(0, i - 4) : i + 1])
        right_floor = min(intensities[i : min(len(points), i + 5)])
        prominence = current - max(left_floor, right_floor)
        if prominence < 0.05:
            continue
        candidates.append((points[i].x, current, prominence))
    candidates.sort(key=lambda item: (item[1], item[2]), reverse=True)
    peaks: list[SpectroscopyPeak] = []
    for rank, (position, intensity, prominence) in enumerate(_dedupe_nearby_peaks(candidates, series), start=1):
        peaks.append(
            SpectroscopyPeak(
                seriesId=series.id,
                position=round(position, 4),
                intensity=round(intensity, 4),
                prominence=round(prominence, 4),
                rank=rank,
                annotation=f"{position:.2f}",
            )
        )
        if len(peaks) >= max_peaks:
            break
    return peaks


def _dedupe_nearby_peaks(candidates: list[tuple[float, float, float]], series: SpectroscopySeries) -> list[tuple[float, float, float]]:
    if not candidates:
        return []
    tolerance = 1.0 if series.mode == "xrd" else 8.0
    selected: list[tuple[float, float, float]] = []
    for candidate in candidates:
        if all(abs(candidate[0] - existing[0]) > tolerance for existing in selected):
            selected.append(candidate)
    return selected


def compare_series(series: list[SpectroscopySeries], peaks: list[SpectroscopyPeak]) -> SpectroscopyComparison:
    layout: Literal["single", "overlay", "stacked"] = "single" if len(series) == 1 else "overlay"
    comparison = SpectroscopyComparison(mode=layout, seriesIds=[item.id for item in series])
    if len(series) < 2:
        comparison.observations.append(
            SpectroscopyComparisonObservation(
                kind="sample_count",
                message="Single uploaded spectrum; sample-to-sample comparison is not applicable.",
                seriesIds=[item.id for item in series],
                values={"sampleCount": len(series)},
            )
        )
        return comparison

    by_series = {item.id: sorted([peak for peak in peaks if peak.seriesId == item.id], key=lambda p: p.rank) for item in series}
    first = series[0]
    first_peak = by_series.get(first.id, [])[:1]
    if first_peak:
        reference_peak = first_peak[0]
        for other in series[1:]:
            other_peak = by_series.get(other.id, [])[:1]
            if not other_peak:
                continue
            delta = other_peak[0].position - reference_peak.position
            ratio = other_peak[0].intensity / reference_peak.intensity if reference_peak.intensity else 0.0
            comparison.observations.append(
                SpectroscopyComparisonObservation(
                    kind="peak_shift",
                    message=(
                        f"Candidate top-peak shift between {first.label} and {other.label}: "
                        f"{delta:+.3f} {x_axis_unit(first.mode)}. Treat as an observation for manual review."
                    ),
                    seriesIds=[first.id, other.id],
                    values={"from": reference_peak.position, "to": other_peak[0].position, "delta": round(delta, 4)},
                )
            )
            comparison.observations.append(
                SpectroscopyComparisonObservation(
                    kind="intensity_ratio",
                    message=(
                        f"Candidate normalized top-peak intensity ratio {other.label}/{first.label}: "
                        f"{ratio:.3f}; not a quantitative phase or purity result."
                    ),
                    seriesIds=[first.id, other.id],
                    values={"ratio": round(ratio, 4)},
                )
            )
    return comparison


def build_advisory_analysis(
    request: SpectroscopyAnalysisRequest,
    mode: ResolvedSpectroscopyMode,
    series: list[SpectroscopySeries],
    peaks: list[SpectroscopyPeak],
    comparison: SpectroscopyComparison,
    references: SpectroscopyReferences,
) -> SpectroscopyAdvisoryAnalysis:
    if not request.enabled:
        return SpectroscopyAdvisoryAnalysis(
            mode="disabled",
            summary="Advisory analysis was disabled by request.",
            caveats=_standard_caveats(),
            manualVerification="Manually verify peak assignments against curated references before scientific claims.",
        )

    template = _build_template_analysis(mode, series, peaks, references, enabled=True, comparison=comparison)
    if not settings.openai_api_key:
        return template

    llm_payload = _build_openai_advisory_payload(mode, series, peaks, comparison, references)
    llm_text = _call_openai_advisory(llm_payload)
    if not llm_text:
        template.referenceNotes.append("OpenAI advisory analysis was unavailable; deterministic template fallback was used.")
        return template

    analysis = _parse_openai_advisory(llm_text, fallback=template)
    analysis.mode = "openai"
    return analysis


def _build_openai_advisory_payload(
    mode: ResolvedSpectroscopyMode,
    series: list[SpectroscopySeries],
    peaks: list[SpectroscopyPeak],
    comparison: SpectroscopyComparison,
    references: SpectroscopyReferences,
) -> dict[str, Any]:
    by_series = {item.id: item for item in series}
    return {
        "mode": mode,
        "expectedMaterial": references.query,
        "series": [
            {
                "id": item.id,
                "label": item.label,
                "pointCount": item.rawSummary.pointCount,
                "xMin": item.rawSummary.xMin,
                "xMax": item.rawSummary.xMax,
                "intensityMin": item.rawSummary.intensityMin,
                "intensityMax": item.rawSummary.intensityMax,
            }
            for item in series
        ],
        "topPeaks": [
            {
                "seriesId": peak.seriesId,
                "seriesLabel": by_series[peak.seriesId].label if peak.seriesId in by_series else peak.seriesId,
                "position": peak.position,
                "intensity": peak.intensity,
                "prominence": peak.prominence,
            }
            for peak in sorted(peaks, key=lambda item: item.intensity, reverse=True)[:12]
        ],
        "comparisonObservations": [observation.model_dump() for observation in comparison.observations],
        "references": {
            "query": references.query,
            "providersRequested": references.providersRequested,
            "candidates": [candidate.model_dump() for candidate in references.candidates[:6]],
            "unavailableReason": references.unavailableReason,
            "warnings": references.warnings,
        },
        "nonGoals": [
            "advisory only",
            "no definitive material identity, phase composition, crystallinity, purity, or quantitative phase fractions",
            "no BO/surrogate training writes",
            "do not infer from raw spectra beyond summarized peaks/comparison/provenance",
        ],
    }


def _call_openai_advisory(payload: dict[str, Any]) -> str | None:
    try:
        from openai import OpenAI

        client = OpenAI(api_key=settings.openai_api_key)
        response = client.responses.create(
            model=settings.openai_model,
            timeout=8.0,
            store=False,
            text={"format": {"type": "json_object"}},
            instructions=(
                "You write advisory, provenance-aware XRD/Raman analysis from summarized spectra only. "
                "Return JSON with keys summary, observedPeaks, sampleComparison, referenceNotes, caveats, manualVerification. "
                "Never claim proof, definitive identity, phase composition, crystallinity, purity, or quantitative phase percentages. "
                "State limitations and recommend manual verification."
            ),
            input=json.dumps(payload, ensure_ascii=False),
        )
        return _extract_openai_response_text(response)
    except Exception:
        return _call_openai_advisory_legacy_chat_fallback(payload)


def _extract_openai_response_text(response: Any) -> str | None:
    output_text = getattr(response, "output_text", None)
    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip()

    try:
        for item in getattr(response, "output", []) or []:
            for content in getattr(item, "content", []) or []:
                text = getattr(content, "text", None)
                if isinstance(text, str) and text.strip():
                    return text.strip()
    except Exception:
        return None
    return None


def _call_openai_advisory_legacy_chat_fallback(payload: dict[str, Any]) -> str | None:
    try:
        from openai import OpenAI

        client = OpenAI(api_key=settings.openai_api_key)
        response = client.chat.completions.create(
            model=settings.openai_model,
            timeout=8.0,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You write advisory, provenance-aware XRD/Raman analysis from summarized spectra only. "
                        "Return JSON with keys summary, observedPeaks, sampleComparison, referenceNotes, caveats, manualVerification. "
                        "Never claim proof, definitive identity, phase composition, crystallinity, purity, or quantitative phase percentages. "
                        "State limitations and recommend manual verification."
                    ),
                },
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
        )
        return (response.choices[0].message.content or "").strip()
    except Exception:
        return None


def _parse_openai_advisory(text: str, *, fallback: SpectroscopyAdvisoryAnalysis) -> SpectroscopyAdvisoryAnalysis:
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        payload = {"summary": text}
    if not isinstance(payload, dict):
        payload = {}

    summary, blocked = sanitize_advisory_text(str(payload.get("summary") or fallback.summary))
    observed, observed_blocked = _sanitize_advisory_list(payload.get("observedPeaks") or payload.get("observed_peaks"), fallback.observedPeaks)
    sample_comparison, comparison_blocked = _sanitize_advisory_list(
        payload.get("sampleComparison") or payload.get("sample_comparison"), fallback.sampleComparison
    )
    reference_notes, reference_blocked = _sanitize_advisory_list(
        payload.get("referenceNotes") or payload.get("reference_notes"), fallback.referenceNotes
    )
    caveats, caveat_blocked = _sanitize_advisory_list(payload.get("caveats") or payload.get("limitations"), fallback.caveats)
    manual_candidates, manual_blocked = _sanitize_advisory_list(
        payload.get("manualVerification") or payload.get("manual_verification"), [fallback.manualVerification]
    )
    manual_verification = manual_candidates[0] if manual_candidates else fallback.manualVerification

    if not summary.lower().startswith("advisory"):
        summary = f"Advisory only: {summary}"
    if not caveats:
        caveats = _standard_caveats()
    if not any("definitive" in caveat.lower() or "advisory" in caveat.lower() for caveat in caveats):
        caveats.insert(0, "This output is advisory and cannot establish definitive scientific claims.")
    if "verify" not in manual_verification.lower():
        manual_verification = f"Manually verify before scientific use: {manual_verification}"

    return SpectroscopyAdvisoryAnalysis(
        mode="openai",
        summary=summary,
        observedPeaks=observed,
        sampleComparison=sample_comparison,
        referenceNotes=reference_notes,
        caveats=caveats,
        manualVerification=manual_verification,
        unsupportedClaimsBlocked=dedupe_preserve_order(
            fallback.unsupportedClaimsBlocked
            + blocked
            + observed_blocked
            + comparison_blocked
            + reference_blocked
            + caveat_blocked
            + manual_blocked
        ),
    )


def _sanitize_advisory_list(value: Any, fallback: list[str]) -> tuple[list[str], list[str]]:
    if isinstance(value, str):
        raw_items = [value]
    elif isinstance(value, list):
        raw_items = [str(item) for item in value if str(item).strip()]
    else:
        raw_items = list(fallback)
    sanitized: list[str] = []
    blocked: list[str] = []
    for item in raw_items:
        text, item_blocked = sanitize_advisory_text(item)
        if text.strip():
            sanitized.append(text.strip())
        blocked.extend(item_blocked)
    return sanitized, blocked


def sanitize_advisory_text(text: str) -> tuple[str, list[str]]:
    blocked: list[str] = []
    sanitized = text
    for pattern, replacement in _UNSAFE_CLAIM_PATTERNS:
        if pattern.search(sanitized):
            blocked.append(pattern.pattern)
            sanitized = pattern.sub(replacement, sanitized)
    return sanitized, blocked


def _build_template_analysis(
    mode: ResolvedSpectroscopyMode,
    series: list[SpectroscopySeries],
    peaks: list[SpectroscopyPeak],
    references: SpectroscopyReferences,
    *,
    enabled: bool = True,
    comparison: SpectroscopyComparison | None = None,
) -> SpectroscopyAdvisoryAnalysis:
    if not enabled:
        return SpectroscopyAdvisoryAnalysis(
            mode="disabled",
            summary="Advisory analysis was disabled by request.",
            caveats=_standard_caveats(),
            manualVerification="Manually verify peak assignments against curated references before scientific claims.",
        )
    by_series = {item.id: item for item in series}
    observed = []
    for peak in sorted(peaks, key=lambda item: (by_series.get(item.seriesId).label if by_series.get(item.seriesId) else item.seriesId, item.rank))[:12]:
        label = by_series.get(peak.seriesId).label if by_series.get(peak.seriesId) else peak.seriesId
        observed.append(f"{label}: candidate peak at {peak.position:g} {x_axis_unit(mode)} with normalized intensity {peak.intensity:g}.")
    if not observed:
        observed.append("No robust peak candidates exceeded the deterministic threshold; inspect raw/preprocessed traces manually.")
    sample_comparison = [obs.message for obs in comparison.observations] if comparison else []
    reference_notes = []
    if references.candidates:
        reference_notes = [f"{candidate.provider}: {candidate.material} from {candidate.source}; {candidate.caveat}" for candidate in references.candidates]
    elif references.unavailableReason:
        reference_notes = [references.unavailableReason]
    summary, blocked = sanitize_advisory_text(
        f"This {mode.upper()} summary reports observed spectral features and candidate comparisons only. "
        "It does not establish definitive material identity, phase composition, crystallinity, purity, or quantitative phase fractions."
    )
    return SpectroscopyAdvisoryAnalysis(
        mode="template",
        summary=summary,
        observedPeaks=observed,
        sampleComparison=sample_comparison,
        referenceNotes=reference_notes,
        caveats=_standard_caveats(),
        manualVerification="Verify candidate peak assignments, instrument calibration, preprocessing choices, and reference provenance before using the interpretation in a publication.",
        unsupportedClaimsBlocked=blocked,
    )


def _build_figure_metadata(
    mode: ResolvedSpectroscopyMode,
    series: list[SpectroscopySeries],
    peaks: list[SpectroscopyPeak],
    references: SpectroscopyReferences,
    layout: Literal["single", "overlay", "stacked"],
) -> SpectroscopyFigureMetadata:
    reference_marker_count = sum(len(candidate.peaks) for candidate in references.candidates)
    material = references.query.strip() or "expected material not specified"
    return SpectroscopyFigureMetadata(
        xAxisLabel=x_axis_label(mode),
        layout=layout,
        sampleLabels=[item.label for item in series],
        peakAnnotationCount=len(peaks),
        referenceMarkerCount=reference_marker_count,
        exports={
            "vector": "Render as SVG for manuscript/report editing.",
            "raster": "Export at 300 ppi equivalent or higher in the browser/client.",
            "processedCsv": "Export preprocessed x,intensity points plus peak metadata for reproducibility.",
        },
        recommendedCaption=(
            f"Preprocessed {mode.upper()} spectra for {', '.join(item.label for item in series) or 'uploaded samples'} "
            f"with candidate peak annotations and open-reference comparison status for {material}."
        ),
        methodNote="Preprocessing: centered moving-average smoothing, rolling-minimum baseline subtraction, and max normalization unless overridden; peak labels are candidate local maxima.",
    )


def x_axis_label(mode: ResolvedSpectroscopyMode) -> str:
    return "2θ (degrees)" if mode == "xrd" else "Raman shift (cm⁻¹)"


def x_axis_unit(mode: ResolvedSpectroscopyMode) -> str:
    return "degrees 2θ" if mode == "xrd" else "cm⁻¹"


def _requested_providers(request: SpectroscopyReferenceLookupRequest) -> list[str]:
    return list(request.providers or ["materials_project", "cod", "rruff"])


def _stable_series_id(filename: str, label: str) -> str:
    return "series-" + uuid.uuid5(uuid.NAMESPACE_URL, f"{filename}:{label}").hex[:12]


def _standard_caveats() -> list[str]:
    return [
        "This output is advisory and provenance-oriented, not a definitive phase/material identification.",
        "Preprocessing and peak detection can shift or suppress weak features; compare against raw data.",
        "Reference availability and coverage vary by provider and may be simulated rather than experimental.",
        "No BO/surrogate training records or uploaded raw spectra are persisted by this analysis path.",
    ]


def dedupe_preserve_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            output.append(value)
    return output
