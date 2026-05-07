from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.services import surrogate_spectroscopy as spectroscopy


def _csv(shift: float = 0.0) -> str:
    rows = ["2theta,intensity"]
    for x, y in [
        (20, 4),
        (30, 6),
        (40 + shift, 45),
        (50, 8),
        (60, 5),
        (70 + shift, 32),
        (80, 4),
    ]:
        rows.append(f"{x},{y}")
    return "\n".join(rows)


def test_spectroscopy_route_returns_plot_ready_template_fallback(monkeypatch) -> None:
    monkeypatch.setattr(spectroscopy.settings, "openai_api_key", None)
    client = TestClient(app)

    response = client.post(
        "/api/surrogate/spectroscopy/analyze",
        json={
            "mode": "xrd",
            "expectedMaterial": "diamond",
            "files": [{"filename": "diamond_xrd.csv", "label": "Sample A", "contentText": _csv()}],
            "referenceLookup": {"enabled": True},
            "analysis": {"enabled": True},
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "partial"
    assert body["mode"] == "xrd"
    assert body["series"][0]["label"] == "Sample A"
    assert body["figure"]["renderer"] == "svg-first"
    assert "300 ppi" in body["figure"]["exports"]["raster"]
    assert body["analysis"]["mode"] == "template"
    assert "definitive" in " ".join(body["analysis"]["caveats"]).lower()
    assert body["references"]["unavailableReason"]


def test_spectroscopy_route_reports_multifile_candidate_comparison(monkeypatch) -> None:
    monkeypatch.setattr(spectroscopy.settings, "openai_api_key", None)
    client = TestClient(app)

    response = client.post(
        "/api/surrogate/spectroscopy/analyze",
        json={
            "mode": "auto",
            "expectedMaterial": "diamond",
            "files": [
                {"filename": "sample_a_xrd.csv", "label": "A", "contentText": _csv()},
                {"filename": "sample_b_xrd.csv", "label": "B", "contentText": _csv(shift=1.0)},
            ],
            "preprocessing": {"smoothing": False, "baselineCorrection": True, "normalization": True},
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["comparison"]["mode"] == "overlay"
    assert {item["label"] for item in body["series"]} == {"A", "B"}
    assert any(item["kind"] == "peak_shift" for item in body["comparison"]["observations"])
    assert all("not a quantitative phase" in item["message"] or item["kind"] != "intensity_ratio" for item in body["comparison"]["observations"])


def test_openai_advisory_is_sanitized_and_not_given_raw_spectra(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_call(payload: dict) -> str:
        captured["payload"] = payload
        return '{"summary":"This proves diamond and is pure.","observedPeaks":["Peak confirms phase composition is diamond."],"manualVerification":"Review references."}'

    monkeypatch.setattr(spectroscopy.settings, "openai_api_key", "test-key")
    monkeypatch.setattr(spectroscopy, "_call_openai_advisory", fake_call)
    client = TestClient(app)

    response = client.post(
        "/api/surrogate/spectroscopy/analyze",
        json={
            "mode": "xrd",
            "expectedMaterial": "diamond",
            "files": [{"filename": "diamond_xrd.csv", "contentText": _csv()}],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["analysis"]["mode"] == "openai"
    visible_text = " ".join([body["analysis"]["summary"], *body["analysis"]["observedPeaks"], *body["analysis"]["referenceNotes"], *body["analysis"]["caveats"], body["analysis"]["manualVerification"]]).lower()
    assert "proves" not in visible_text
    assert "confirms" not in visible_text
    assert body["analysis"]["unsupportedClaimsBlocked"]
    assert captured["payload"]
    payload = captured["payload"]
    assert "topPeaks" in payload
    assert "contentText" not in str(payload)


def test_cantera_route_still_registered() -> None:
    paths = {route.path for route in app.routes}
    assert "/api/surrogate/cantera/run" in paths
    assert "/api/surrogate/spectroscopy/analyze" in paths


def test_parser_accepts_txt_comments_headers_and_rejects_unsupported_inputs() -> None:
    parsed = spectroscopy.parse_spectrum_file(
        spectroscopy.SpectroscopyFilePayload(
            filename="graphite_raman.txt",
            contentText="# comment\nshift intensity\n1200 0.1\n1300 4\n1400 0.2\n1500 1\n1600 5\n",
        )
    )

    assert parsed.label == "graphite_raman"
    assert parsed.rows[1] == (1300.0, 4.0)
    assert parsed.skipped_rows == 1

    for filename, content, message in [
        ("raw.xlsx", "PK\x03\x04", "unsupported extension"),
        ("short.csv", "x,y\n1,2\n2,3\n", "too few numeric"),
    ]:
        try:
            spectroscopy.parse_spectrum_file(spectroscopy.SpectroscopyFilePayload(filename=filename, contentText=content))
        except ValueError as exc:
            assert message in str(exc)
        else:  # pragma: no cover - assertion clarity
            raise AssertionError(f"{filename} should be rejected")


def test_preprocessing_preserves_point_count_raw_summary_and_normalizes_intensity() -> None:
    parsed = spectroscopy.parse_spectrum_file(
        spectroscopy.SpectroscopyFilePayload(filename="diamond_xrd.csv", label="Diamond", contentText=_csv())
    )
    series = spectroscopy.preprocess_spectrum(
        parsed,
        "xrd",
        spectroscopy.SpectroscopyPreprocessingRequest(smoothing=True, smoothingWindow=3, baselineCorrection=True, normalization=True),
    )

    assert series.rawSummary.pointCount == len(parsed.rows)
    assert len(series.points) == len(parsed.rows)
    assert series.preprocessing.smoothing["window"] == 3
    assert series.preprocessing.baselineCorrection["enabled"] is True
    assert series.preprocessing.normalization["range"] == [0, 1]
    assert min(point.intensity for point in series.points) >= 0
    assert max(point.intensity for point in series.points) == 1


def test_peak_detection_sorts_top_candidates_and_ignores_flat_data() -> None:
    peaked = spectroscopy.preprocess_spectrum(
        spectroscopy.parse_spectrum_file(spectroscopy.SpectroscopyFilePayload(filename="diamond_xrd.csv", contentText=_csv())),
        "xrd",
        spectroscopy.SpectroscopyPreprocessingRequest(smoothing=False, baselineCorrection=True, normalization=True),
    )
    flat = spectroscopy.preprocess_spectrum(
        spectroscopy.parse_spectrum_file(
            spectroscopy.SpectroscopyFilePayload(
                filename="flat.csv",
                contentText="x,y\n" + "\n".join(f"{index},{10}" for index in range(10, 80, 10)),
            )
        ),
        "xrd",
        spectroscopy.SpectroscopyPreprocessingRequest(smoothing=False, baselineCorrection=False, normalization=True),
    )

    peaks = spectroscopy.detect_peaks(peaked)
    assert peaks
    assert [peak.rank for peak in peaks] == list(range(1, len(peaks) + 1))
    assert peaks[0].intensity >= peaks[-1].intensity
    assert all(peak.seriesId == peaked.id for peak in peaks)
    assert spectroscopy.detect_peaks(flat) == []
