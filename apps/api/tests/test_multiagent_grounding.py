from __future__ import annotations

import json
from pathlib import Path

from app.api.multiagent.service import DiscussionService
from app.api.multiagent.smoke_prompts import build_agent_smoke_prompts, load_agents

AGENTS_PATH = Path("apps/api/app/data/discussion_knowledge/agents.json")


def _service() -> DiscussionService:
    return DiscussionService()


def _chunk(chunk_id: str, title: str, text: str, *, source: str | None = None, keywords: list[str] | None = None) -> dict:
    return {
        "chunk_id": chunk_id,
        "title": title,
        "summary": text,
        "excerpt": text,
        "keywords": keywords or [],
        "source": source or chunk_id,
        "year": 2024,
        "entity_keys": [],
    }


def test_agent_specific_ranking_changes_evidence_selection() -> None:
    service = _service()
    chunks = [
        _chunk("plasma", "Plasma gas chemistry", "methane hydrogen plasma radicals OES gas chemistry", source="paper-a"),
        _chunk("seed", "Seed nucleation", "substrate seeding nucleation adhesion surface density", source="paper-b"),
        _chunk("device", "Device contacts", "ohmic contact MOSFET interface Dit leakage", source="paper-c"),
    ]
    plasma_agent = {
        "agent_id": "plasma-agent",
        "retrieval_terms": ["plasma", "methane", "radicals", "OES"],
        "evidence_focus": ["gas chemistry", "plasma stability"],
        "entity_keys": [],
    }
    nucleation_agent = {
        "agent_id": "nucleation-agent",
        "retrieval_terms": ["seed", "nucleation", "substrate", "adhesion"],
        "evidence_focus": ["surface", "nucleation density"],
        "entity_keys": [],
    }

    question = "How should diamond growth evidence be selected for the next experiment?"
    plasma_ranked = service._rank_chunks(question, chunks, plasma_agent, [], seen_chunk_ids=set(), panel_seen_chunk_ids=set(), use_web_search=False)
    nucleation_ranked = service._rank_chunks(question, chunks, nucleation_agent, [], seen_chunk_ids=set(), panel_seen_chunk_ids=set(), use_web_search=False)

    assert plasma_ranked[0]["chunk_id"] == "plasma"
    assert nucleation_ranked[0]["chunk_id"] == "seed"


def test_direct_query_relevance_is_preserved_over_agent_metadata_only_match() -> None:
    service = _service()
    chunks = [
        _chunk("query", "Raman defect evidence", "Raman spectroscopy defect density peak broadening thermal conductivity", source="paper-a"),
        _chunk("metadata", "Generic seed note", "seed nucleation substrate adhesion surface pretreatment", source="paper-b"),
    ]
    agent = {
        "agent_id": "seed-agent",
        "retrieval_terms": ["seed", "nucleation", "substrate", "adhesion"],
        "evidence_focus": ["surface pretreatment"],
        "entity_keys": [],
    }

    ranked = service._rank_chunks(
        "Which Raman spectroscopy defect density evidence explains thermal conductivity?",
        chunks,
        agent,
        [],
        seen_chunk_ids=set(),
        panel_seen_chunk_ids=set(),
        use_web_search=False,
    )

    assert ranked[0]["chunk_id"] == "query"


def test_low_signal_chunks_are_penalized_below_domain_evidence() -> None:
    service = _service()
    chunks = [
        _chunk("refs", "References", "Smith et al. Crossref Jones et al. Crossref Lee et al.", source="refs"),
        _chunk("table", "Table 1", "| a | b | c | d | e | f | g | h | i |", source="table"),
        _chunk("domain", "Plasma stability evidence", "methane plasma stability OES radical emission growth rate defect density", source="paper"),
        _chunk("domain-2", "Raman defect evidence", "Raman spectroscopy defect density growth stability", source="paper-2"),
    ]
    agent = {
        "agent_id": "plasma-agent",
        "retrieval_terms": ["plasma", "methane", "OES", "radical"],
        "evidence_focus": ["plasma stability", "defect density"],
        "entity_keys": [],
    }

    ranked = service._rank_chunks(
        "How does methane plasma stability affect defect density?",
        chunks,
        agent,
        [],
        seen_chunk_ids=set(),
        panel_seen_chunk_ids=set(),
        use_web_search=False,
    )

    assert ranked[0]["chunk_id"] == "domain"
    assert {chunk["chunk_id"] for chunk in ranked}.isdisjoint({"refs", "table"})


def test_repeat_penalty_preserves_diverse_evidence_when_alternative_exists() -> None:
    service = _service()
    chunks = [
        _chunk("seen", "Plasma repeated", "methane plasma radical OES defect density", source="paper-a"),
        _chunk("fresh", "Fresh plasma evidence", "methane plasma radical emission growth stability", source="paper-b"),
        _chunk("other", "Other evidence", "thermal conductivity Raman defect", source="paper-c"),
    ]
    agent = {"agent_id": "plasma-agent", "retrieval_terms": ["plasma", "methane", "radical"], "evidence_focus": ["OES"], "entity_keys": []}

    ranked = service._rank_chunks(
        "Which plasma methane radical evidence should be used?",
        chunks,
        agent,
        [{"message": "Earlier turn cited Plasma repeated"}],
        seen_chunk_ids={"seen"},
        panel_seen_chunk_ids={"seen"},
        use_web_search=False,
    )

    assert "fresh" in [chunk["chunk_id"] for chunk in ranked]
    assert ranked[0]["chunk_id"] != "seen"


def test_structured_output_fallback_fills_safe_defaults_without_fabricating_ids() -> None:
    service = _service()
    chunks = [_chunk("chunk-a", "Domain evidence", "Raman defect density evidence", source="paper-a")]
    agent = {"name": "Evidence Curator", "focus": "separate support from gaps", "next_action_hint": "measure Raman", "research_duty": "Evidence Curator"}

    structured = service._build_fallback_structured_output(
        agent,
        chunks,
        relationship=None,
        message="Raman evidence supports a conservative defect-density claim.",
    )
    assert structured["claim"]
    assert structured["evidence_ids"] == ["chunk-a"]
    assert structured["uncertainties"]
    assert structured["experiment_proposal"] == "measure Raman"
    assert structured["confidence"] in {"medium", "low"}


def test_invented_evidence_ids_are_rejected_from_structured_output() -> None:
    service = _service()
    chunks = [
        _chunk("chunk-a", "Evidence A", "plasma evidence", source="paper-a"),
        _chunk("chunk-b", "Evidence B", "Raman evidence", source="paper-b"),
    ]
    normalized_ids = service._normalize_structured_evidence_ids(
        ["chunk-a", "fake-id", "S2", "missing"],
        chunks,
    )

    assert normalized_ids == ["chunk-a", "chunk-b"]
    assert set(normalized_ids) <= {"chunk-a", "chunk-b"}


def test_evidence_gap_brief_preserves_empty_evidence_ids_when_callable() -> None:
    service = _service()
    turn = {
        "speaker": "Evidence Curator",
        "stance": "evidence",
        "agent_id": "agent-evidence-curator",
        "round_num": 1,
        "message": "The retrieved pack does not support the numeric claim.",
        "evidence_ids": [],
        "structured_output": {
            "claim": "There is an evidence gap for the numeric claim.",
            "evidence_ids": [],
            "uncertainties": ["No retrieved chunk supports the proposed setpoint."],
            "experiment_proposal": "Retrieve or measure before making a numeric recommendation.",
            "confidence": "low",
        },
    }

    brief = service._build_turn_brief(turn)

    assert brief.get("evidence_ids", []) == []
    assert brief["uncertainties"] == ["No retrieved chunk supports the proposed setpoint."]
    assert "evidence gap" in brief["claim"].lower()


def test_manual_smoke_prompt_helper_covers_current_26_agents() -> None:
    raw_agents = json.loads(AGENTS_PATH.read_text(encoding="utf-8"))
    loaded_agents = load_agents(AGENTS_PATH)
    prompts = build_agent_smoke_prompts(loaded_agents)

    assert len(raw_agents) == 26
    assert len(prompts) == 26
    assert len({item["agent_id"] for item in prompts}) == 26
    assert len({item["agent_name"] for item in prompts}) == 26
    for agent, item in zip(loaded_agents, prompts):
        prompt = item["prompt"].lower()
        assert item["agent_id"] == agent["agent_id"]
        assert agent["name"] in item["agent_name"]
        assert "claim" in prompt
        assert "evidence ids" in prompt
        assert "reasoning" in prompt
        assert "uncertainty" in prompt
        assert "proposed experiment" in prompt
        assert str(agent.get("focus") or agent.get("expertise") or "")[:20] in item["prompt"]
