from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Protocol

SpectroscopyMode = Literal["xrd", "raman"]
ProviderName = Literal["materials_project", "cod", "rruff"]
ProviderState = Literal["ready", "unavailable", "failed"]


@dataclass(frozen=True)
class ReferencePeak:
    """Plot-ready reference peak position.

    XRD positions are 2θ degrees; Raman positions are shift values in cm⁻¹.
    Intensities are normalized to 0..1 when possible.
    """

    position: float
    intensity: float
    label: str | None = None


@dataclass(frozen=True)
class ReferencePattern:
    provider: ProviderName
    material_name: str
    mode: SpectroscopyMode
    peaks: tuple[ReferencePeak, ...]
    source_id: str | None = None
    source_url: str | None = None
    provenance: str = "reference-only; not definitive material identification"
    license_note: str | None = None
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class ReferenceProviderStatus:
    provider: ProviderName
    status: ProviderState
    unavailable_reason: str | None = None


@dataclass(frozen=True)
class ReferenceLookupResult:
    query: str
    mode: SpectroscopyMode
    references: tuple[ReferencePattern, ...]
    statuses: tuple[ReferenceProviderStatus, ...]
    warnings: tuple[str, ...] = ()

    @property
    def unavailable_reason(self) -> str | None:
        if self.references:
            return None
        reasons = [status.unavailable_reason for status in self.statuses if status.unavailable_reason]
        return "; ".join(reasons) if reasons else "No reference providers returned matches."


class ReferenceProvider(Protocol):
    name: ProviderName

    def lookup(self, query: str, mode: SpectroscopyMode) -> tuple[tuple[ReferencePattern, ...], ReferenceProviderStatus]:
        """Return references plus provider availability without raising for normal unavailability."""


def _normalize_query(query: str) -> str:
    return " ".join(query.strip().lower().split())


def _normalize_intensity(value: Any) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return 0.0
    return min(max(numeric, 0.0), 1.0)


def _parse_peak(raw: dict[str, Any]) -> ReferencePeak | None:
    position = raw.get("position", raw.get("two_theta", raw.get("shift_cm-1", raw.get("shift_cm_1"))))
    if position is None:
        return None
    try:
        parsed_position = float(position)
    except (TypeError, ValueError):
        return None
    return ReferencePeak(
        position=parsed_position,
        intensity=_normalize_intensity(raw.get("intensity", 1.0)),
        label=str(raw["label"]) if raw.get("label") else None,
    )


def _pattern_from_record(provider: ProviderName, record: dict[str, Any], mode: SpectroscopyMode) -> ReferencePattern | None:
    record_mode = str(record.get("mode", mode)).lower()
    if record_mode != mode:
        return None
    peaks = tuple(peak for peak in (_parse_peak(item) for item in record.get("peaks", [])) if peak is not None)
    if not peaks:
        return None
    return ReferencePattern(
        provider=provider,
        material_name=str(record.get("material_name") or record.get("material") or "unknown material"),
        mode=mode,
        peaks=peaks,
        source_id=str(record["source_id"]) if record.get("source_id") else None,
        source_url=str(record["source_url"]) if record.get("source_url") else None,
        provenance=str(record.get("provenance") or "local cached reference; advisory comparison only"),
        license_note=str(record["license_note"]) if record.get("license_note") else None,
        warnings=tuple(str(warning) for warning in record.get("warnings", [])),
    )


def _safe_json_file(cache_dir: Path, filename: str) -> Path | None:
    """Return an existing JSON file constrained to cache_dir.

    The cache providers are intentionally read-only and filename allowlisted so tests and
    production fallbacks cannot accidentally fetch live resources or traverse arbitrary paths.
    """

    root = cache_dir.resolve()
    candidate = (root / filename).resolve()
    if candidate.suffix.lower() != ".json" or root not in candidate.parents:
        return None
    return candidate if candidate.exists() and candidate.is_file() else None


class LocalJsonReferenceCache:
    def __init__(self, cache_dir: str | Path, filename: str) -> None:
        self.cache_dir = Path(cache_dir)
        self.filename = filename

    def load(self) -> tuple[list[dict[str, Any]], str | None]:
        path = _safe_json_file(self.cache_dir, self.filename)
        if path is None:
            return [], f"No local cache file found for {self.filename}."
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            return [], f"Local cache file {self.filename} could not be read: {exc}."
        if isinstance(payload, dict):
            records = payload.get("references", [])
        else:
            records = payload
        if not isinstance(records, list):
            return [], f"Local cache file {self.filename} has invalid reference shape."
        return [record for record in records if isinstance(record, dict)], None


@dataclass(frozen=True)
class MaterialsProjectReferenceProvider:
    """MVP Materials Project adapter surface.

    Live MP lookup and pymatgen XRD simulation are intentionally not implemented in
    this lane. The provider reports why it is unavailable unless deterministic mock
    records are injected by tests/future services.
    """

    api_key: str | None = None
    mock_records: tuple[ReferencePattern, ...] = ()
    name: ProviderName = "materials_project"

    def lookup(self, query: str, mode: SpectroscopyMode) -> tuple[tuple[ReferencePattern, ...], ReferenceProviderStatus]:
        if self.mock_records:
            matches = _filter_patterns(self.mock_records, self.name, query, mode)
            return matches, ReferenceProviderStatus(self.name, "ready" if matches else "unavailable", None if matches else "No mocked Materials Project references matched.")
        if not self.api_key:
            return (), ReferenceProviderStatus(self.name, "unavailable", "Materials Project API key is not configured.")
        return (), ReferenceProviderStatus(
            self.name,
            "unavailable",
            "Materials Project live lookup requires optional mp-api/pymatgen integration, which is not enabled in the MVP adapter.",
        )


@dataclass(frozen=True)
class CodReferenceProvider:
    cache_dir: Path | None = None
    mock_records: tuple[ReferencePattern, ...] = ()
    name: ProviderName = "cod"

    def lookup(self, query: str, mode: SpectroscopyMode) -> tuple[tuple[ReferencePattern, ...], ReferenceProviderStatus]:
        if self.mock_records:
            matches = _filter_patterns(self.mock_records, self.name, query, mode)
            return matches, ReferenceProviderStatus(self.name, "ready" if matches else "unavailable", None if matches else "No mocked COD references matched.")
        if self.cache_dir is None:
            return (), ReferenceProviderStatus(self.name, "unavailable", "COD cache directory is not configured; live COD requests are disabled in automated MVP paths.")
        records, error = LocalJsonReferenceCache(self.cache_dir, "cod_references.json").load()
        if error:
            return (), ReferenceProviderStatus(self.name, "unavailable", error)
        matches = _records_to_matches(self.name, records, query, mode)
        return matches, ReferenceProviderStatus(self.name, "ready" if matches else "unavailable", None if matches else "COD cache contained no matching references.")


@dataclass(frozen=True)
class RruffReferenceProvider:
    cache_dir: Path | None = None
    mock_records: tuple[ReferencePattern, ...] = ()
    name: ProviderName = "rruff"

    def lookup(self, query: str, mode: SpectroscopyMode) -> tuple[tuple[ReferencePattern, ...], ReferenceProviderStatus]:
        if self.mock_records:
            matches = _filter_patterns(self.mock_records, self.name, query, mode)
            return matches, ReferenceProviderStatus(self.name, "ready" if matches else "unavailable", None if matches else "No mocked RRUFF references matched.")
        if self.cache_dir is None:
            return (), ReferenceProviderStatus(self.name, "unavailable", "RRUFF cache directory is not configured; live RRUFF requests are disabled in automated MVP paths.")
        records, error = LocalJsonReferenceCache(self.cache_dir, "rruff_references.json").load()
        if error:
            return (), ReferenceProviderStatus(self.name, "unavailable", error)
        matches = _records_to_matches(self.name, records, query, mode)
        return matches, ReferenceProviderStatus(self.name, "ready" if matches else "unavailable", None if matches else "RRUFF cache contained no matching references.")


@dataclass(frozen=True)
class MockReferenceProvider:
    name: ProviderName
    records: tuple[ReferencePattern, ...]
    failure: str | None = None

    def lookup(self, query: str, mode: SpectroscopyMode) -> tuple[tuple[ReferencePattern, ...], ReferenceProviderStatus]:
        if self.failure:
            return (), ReferenceProviderStatus(self.name, "failed", self.failure)
        matches = _filter_patterns(self.records, self.name, query, mode)
        return matches, ReferenceProviderStatus(self.name, "ready" if matches else "unavailable", None if matches else f"No mocked {self.name} references matched.")


def _query_matches(query: str, candidates: list[str]) -> bool:
    normalized_query = _normalize_query(query)
    normalized_candidates = [_normalize_query(candidate) for candidate in candidates if candidate]
    if not normalized_query:
        return True
    query_tokens = [token for token in normalized_query.replace("/", " ").split() if len(token) >= 2]
    for candidate in normalized_candidates:
        if normalized_query in candidate or candidate in normalized_query:
            return True
        candidate_tokens = set(candidate.replace("/", " ").split())
        if candidate_tokens.intersection(query_tokens):
            return True
    return False


def _filter_patterns(patterns: tuple[ReferencePattern, ...], provider: ProviderName, query: str, mode: SpectroscopyMode) -> tuple[ReferencePattern, ...]:
    return tuple(
        pattern
        for pattern in patterns
        if pattern.provider == provider and pattern.mode == mode and _query_matches(query, [pattern.material_name, pattern.source_id or ""])
    )


def _records_to_matches(provider: ProviderName, records: list[dict[str, Any]], query: str, mode: SpectroscopyMode) -> tuple[ReferencePattern, ...]:
    matches: list[ReferencePattern] = []
    for record in records:
        candidates = [str(record.get("material_name") or record.get("material") or "")]
        candidates.extend(str(alias) for alias in record.get("aliases", []) if alias)
        if not _query_matches(query, candidates):
            continue
        pattern = _pattern_from_record(provider, record, mode)
        if pattern is not None:
            matches.append(pattern)
    return tuple(matches)


def lookup_references(query: str, mode: SpectroscopyMode, providers: tuple[ReferenceProvider, ...]) -> ReferenceLookupResult:
    references: list[ReferencePattern] = []
    statuses: list[ReferenceProviderStatus] = []
    warnings: list[str] = []
    for provider in providers:
        try:
            provider_references, status = provider.lookup(query, mode)
        except Exception as exc:  # defensive isolation: provider failure must not fail spectra plotting
            provider_name = getattr(provider, "name", "cod")
            status = ReferenceProviderStatus(provider_name, "failed", f"{provider_name} provider failed: {exc}")
            provider_references = ()
        references.extend(provider_references)
        statuses.append(status)
        if status.status != "ready" and status.unavailable_reason:
            warnings.append(f"{status.provider}: {status.unavailable_reason}")
    if not references:
        warnings.append("Reference comparison is unavailable; uploaded spectra can still be plotted and analyzed qualitatively.")
    return ReferenceLookupResult(query=query, mode=mode, references=tuple(references), statuses=tuple(statuses), warnings=tuple(warnings))
