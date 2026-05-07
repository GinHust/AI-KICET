from __future__ import annotations

from pathlib import Path

from app.services.surrogate_reference_providers import (
    CodReferenceProvider,
    MaterialsProjectReferenceProvider,
    MockReferenceProvider,
    ReferencePattern,
    ReferencePeak,
    RruffReferenceProvider,
    lookup_references,
)

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "spectroscopy"


def _pattern(provider: str, material: str, mode: str) -> ReferencePattern:
    return ReferencePattern(
        provider=provider,  # type: ignore[arg-type]
        material_name=material,
        mode=mode,  # type: ignore[arg-type]
        peaks=(ReferencePeak(position=44.0 if mode == "xrd" else 1332.0, intensity=1.0, label="fixture"),),
        source_id=f"{provider}-fixture",
        provenance=f"{provider} deterministic mock reference; advisory only",
    )


def test_all_reference_providers_unavailable_without_keys_or_cache() -> None:
    result = lookup_references(
        "diamond",
        "xrd",
        providers=(
            MaterialsProjectReferenceProvider(api_key=None),
            CodReferenceProvider(cache_dir=None),
            RruffReferenceProvider(cache_dir=None),
        ),
    )

    assert result.references == ()
    assert {status.provider: status.status for status in result.statuses} == {
        "materials_project": "unavailable",
        "cod": "unavailable",
        "rruff": "unavailable",
    }
    assert result.unavailable_reason is not None
    assert any("Reference comparison is unavailable" in warning for warning in result.warnings)


def test_mock_materials_project_provider_returns_xrd_reference_metadata() -> None:
    mp_provider = MaterialsProjectReferenceProvider(mock_records=(_pattern("materials_project", "Diamond", "xrd"),))

    references, status = mp_provider.lookup("diamond", "xrd")

    assert status.status == "ready"
    assert references[0].provider == "materials_project"
    assert references[0].mode == "xrd"
    assert references[0].source_id == "materials_project-fixture"
    assert "advisory" in references[0].provenance


def test_cod_provider_reads_local_cache_without_live_network() -> None:
    references, status = CodReferenceProvider(cache_dir=FIXTURE_DIR).lookup("diamond", "xrd")

    assert status.status == "ready"
    assert references[0].provider == "cod"
    assert references[0].source_id == "cod-9008564"
    assert references[0].peaks[0].label == "111"
    assert references[0].license_note is not None


def test_rruff_provider_reads_empirical_raman_cache_fixture() -> None:
    references, status = RruffReferenceProvider(cache_dir=FIXTURE_DIR).lookup("graphite", "raman")

    assert status.status == "ready"
    assert references[0].provider == "rruff"
    assert references[0].mode == "raman"
    assert references[0].peaks[0].label == "D"
    assert references[0].warnings == ("Mineral reference coverage may not represent process-grown films.",)


def test_provider_failure_is_isolated_from_other_reference_results() -> None:
    failing_cod = MockReferenceProvider(name="cod", records=(), failure="COD cache parse failed")
    rruff = MockReferenceProvider(name="rruff", records=(_pattern("rruff", "Graphite", "raman"),))

    result = lookup_references("graphite", "raman", providers=(failing_cod, rruff))

    assert [reference.provider for reference in result.references] == ["rruff"]
    assert {status.provider: status.status for status in result.statuses} == {"cod": "failed", "rruff": "ready"}
    assert any("COD cache parse failed" in warning for warning in result.warnings)


def test_cache_provider_does_not_include_commercial_database_adapter() -> None:
    providers = (
        MaterialsProjectReferenceProvider(api_key=None),
        CodReferenceProvider(cache_dir=FIXTURE_DIR),
        RruffReferenceProvider(cache_dir=FIXTURE_DIR),
    )

    assert {provider.name for provider in providers} == {"materials_project", "cod", "rruff"}
    assert "icsd" not in {provider.name for provider in providers}
    assert "icdd" not in {provider.name for provider in providers}


def test_cache_lookup_accepts_general_material_phrase_tokens() -> None:
    references, status = CodReferenceProvider(cache_dir=FIXTURE_DIR).lookup("diamond carbon", "xrd")

    assert status.status == "ready"
    assert references[0].material_name == "Diamond"
