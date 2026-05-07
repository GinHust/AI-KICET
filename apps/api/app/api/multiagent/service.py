from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator
from uuid import uuid4

from app.config import settings
from app.models.domain import (
    AgentPerspective,
    ConstraintCandidate,
    ConstraintReviewState,
    Discussion,
    DiscussionCreateRequest,
    DiscussionTurn,
    EvidenceItem,
    GraphEdge,
    GraphNode,
    GraphPayload,
    HypothesisCandidate,
    HypothesisRanking,
    HypothesisValidation,
    NumericConstraintBound,
    ValidatedConstraint,
)
from app.repositories.discussion_knowledge_repository import DiscussionKnowledgeRepository
from app.repositories.project_repository import ProjectRepository
from app.api.multiagent.engine import DiscussionEngine
from app.api.multiagent.llm import DiscussionLLM
from app.api.multiagent.embedding_store import EmbeddingStore


RESEARCH_ROLE_FALLBACKS: list[dict[str, Any]] = [
    {
        "role_key": "mechanism",
        "keywords": ["mechanism", "material", "defect", "chemistry", "phonon", "growth"],
        "research_duty": "Mechanism Modeler: connect the proposed condition to a physical or chemical mechanism and name the discriminating measurement.",
        "expertise": "Mechanism modeling for material-process-property links",
        "perspective": "mechanistic explanation and measurement discriminator",
        "unique_domain": "reaction pathway, defect formation, transport mechanism",
        "tools_and_methods": ["mechanism mapping", "defect/property reasoning", "measurement discriminator design"],
        "key_terminology": ["mechanism", "defect density", "growth chemistry", "thermal transport"],
        "forbidden_topics": ["unbounded process optimization", "unsupported numeric setpoints"],
    },
    {
        "role_key": "constraint",
        "keywords": ["constraint", "process", "equipment", "safe", "window", "bound"],
        "research_duty": "Constraint Auditor: identify safe-bound, equipment, and feasibility risks before any optimization step.",
        "expertise": "Process constraints and safe operating windows",
        "perspective": "constraint risk and feasibility gate",
        "unique_domain": "equipment compatibility, validated constraint, safe boundary",
        "tools_and_methods": ["constraint audit", "safe-bound check", "operating-window review"],
        "key_terminology": ["safe boundary", "operating window", "validated constraint", "feasibility"],
        "forbidden_topics": ["treating candidate constraints as validated", "unsafe extrapolation"],
    },
    {
        "role_key": "skeptic",
        "keywords": ["skeptic", "risk", "failure", "uncertainty", "validation"],
        "research_duty": "Skeptic / Failure Modes: challenge weak causal claims and expose failure modes or confounders.",
        "expertise": "Failure mode analysis and causal skepticism",
        "perspective": "confounder, counterexample, and falsification test",
        "unique_domain": "causal weakness, hidden confounder, failure mode",
        "tools_and_methods": ["failure-mode review", "confounder isolation", "falsification test"],
        "key_terminology": ["confounder", "failure mode", "uncertainty", "falsification"],
        "forbidden_topics": ["panel-wide conclusion", "unsupported certainty"],
    },
    {
        "role_key": "experiment",
        "keywords": ["experiment", "test", "measurement", "design", "characterization"],
        "research_duty": "Experiment Designer: turn uncertainty into the next measurement, run matrix, or validation protocol.",
        "expertise": "Experiment design and characterization protocol",
        "perspective": "actionable measurement and minimal validation design",
        "unique_domain": "DOE, characterization, discriminating experiment",
        "tools_and_methods": ["DOE framing", "characterization plan", "measurement protocol"],
        "key_terminology": ["DOE", "measurement", "validation", "replicate"],
        "forbidden_topics": ["generic next steps", "unmeasurable recommendation"],
    },
    {
        "role_key": "evidence",
        "keywords": ["evidence", "knowledge", "literature", "retrieval", "source"],
        "research_duty": "Evidence Curator: separate source-backed claims from unsupported assumptions and cite only available evidence IDs.",
        "expertise": "Evidence curation and source-grounded claim checking",
        "perspective": "source support, contradiction, and evidence gap",
        "unique_domain": "retrieval quality, evidence gap, citation discipline",
        "tools_and_methods": ["evidence triage", "source contradiction check", "claim grounding"],
        "key_terminology": ["evidence ID", "source support", "grounding", "gap"],
        "forbidden_topics": ["invented citations", "uncited numeric bounds"],
    },
    {
        "role_key": "bo",
        "keywords": ["bo", "optimization", "surrogate", "ranking", "parameter"],
        "research_duty": "BO Bridge Analyst: translate validated risks and measurements into safe Bayesian optimization variables or constraints.",
        "expertise": "Safe Bayesian optimization bridge for experimental planning",
        "perspective": "BO variable, objective, constraint, and safe-bound implication",
        "unique_domain": "safe BO, surrogate input, acquisition constraint",
        "tools_and_methods": ["BO variable mapping", "constraint-aware search", "surrogate-readiness check"],
        "key_terminology": ["Bayesian optimization", "objective", "constraint", "surrogate"],
        "forbidden_topics": ["optimizing outside validated safe bounds", "fictional parameter ranges"],
    },
]


class DiscussionService:
    def __init__(self) -> None:
        knowledge_repository = DiscussionKnowledgeRepository(settings.discussion_knowledge_dir)
        self._project_repository = ProjectRepository(settings.sqlite_path, knowledge_repository)
        self._embedding_store = EmbeddingStore()
        self._engine = DiscussionEngine(self._embedding_store)
        self._llm = DiscussionLLM.from_settings(settings)
        self._synthesis_cache: dict[tuple[str, str], dict[str, Any] | None] = {}
        self._equipment_constraints_text = self._load_equipment_constraints_text()
        self._constraint_seeds = self._load_constraint_seeds()

    def get_project(self, project_id: str) -> dict[str, Any]:
        return self._project_repository.get_project(project_id)

    def list_discussions(self) -> list[Discussion]:
        return self._project_repository.list_discussions()

    def delete_discussion(self, discussion_id: str, project_id: str | None = None) -> bool:
        self._synthesis_cache.clear()
        return self._project_repository.delete_discussion(discussion_id, project_id)

    def create_discussion(self, payload: DiscussionCreateRequest) -> Discussion:
        self._synthesis_cache.clear()
        project = self._project_repository.get_project(payload.project_id)
        agents = self._project_repository.list_agents(payload.project_id)
        chunks = self._project_repository.list_chunks(payload.project_id)
        entities = self._project_repository.list_entities(payload.project_id)
        relationships = self._project_repository.list_relationships(payload.project_id)

        if not agents:
            raise ValueError("No agents are available for this project.")
        if not chunks:
            raise ValueError("No evidence chunks are available for this project.")

        selected_agents = self._apply_agent_role_fallbacks(self._select_agents(payload.question, agents, 4))
        entity_map = {entity["entity_key"]: entity for entity in entities}
        selected_relationships: list[dict[str, Any]] = []
        rendered_turns: list[dict[str, Any]] = []
        evidence_by_id: dict[str, dict[str, Any]] = {}
        seen_by_agent: dict[str, set[str]] = {agent["agent_id"]: set() for agent in selected_agents}
        seen_by_panel: set[str] = set()

        for agent in selected_agents:
            ranked_chunks = self._rank_chunks(
                payload.question,
                chunks,
                agent,
                [],
                seen_chunk_ids=seen_by_agent[agent["agent_id"]],
                panel_seen_chunk_ids=seen_by_panel,
                use_web_search=True,
            )
            relationships_for_turn = self._pick_relationships(agent, relationships, ranked_chunks)
            relationship = relationships_for_turn[0] if relationships_for_turn else None
            for item in relationships_for_turn:
                if item not in selected_relationships:
                    selected_relationships.append(item)
            for chunk in ranked_chunks:
                evidence_by_id[chunk["chunk_id"]] = chunk
                seen_by_agent[agent["agent_id"]].add(chunk["chunk_id"])
                seen_by_panel.add(chunk["chunk_id"])

            equipment_note = self._build_constraint_note(entity_map, ranked_chunks, False, [])
            message_payload = self._compose_round_message(
                question=payload.question,
                agent=agent,
                chunks=ranked_chunks,
                relationship=relationship,
                round_context=[],
                round_num=1,
                use_web_search=True,
                equipment_note=equipment_note,
                follow_up_focus="",
                panel_agents=selected_agents,
                moderator_packet=None,
            )
            structured_output = message_payload.get("structured_output", {})
            turn = {
                "speaker": agent["name"],
                "stance": agent["stance"],
                "agent_id": agent["agent_id"],
                "message": message_payload["message"],
                "references": [chunk["title"] for chunk in ranked_chunks],
                "evidence_ids": structured_output.get("evidence_ids", []),
                "round_num": 1,
                "community_id": agent.get("community_id") or "seed-community",
                "structured_output": structured_output,
                "claim": structured_output.get("claim"),
                "constraint_risks": structured_output.get("constraint_risks", []),
                "uncertainties": structured_output.get("uncertainties", []),
                "experiment_proposal": structured_output.get("experiment_proposal"),
                "confidence": structured_output.get("confidence"),
                "bo_bridge_note": structured_output.get("bo_bridge_note"),
            }
            turn["turn_brief"] = self._build_turn_brief(turn)
            rendered_turns.append(turn)

        evidence = list(evidence_by_id.values())
        graph = self._engine._build_graph(entities, selected_relationships or relationships[:2], evidence)
        summary = self._compose_summary(project, payload.question, rendered_turns, evidence, selected_relationships or relationships, True, False, entity_map, [], None, [], [])
        next_actions = self._compose_next_actions(project, payload.question, rendered_turns, evidence, selected_relationships or relationships, True, False, entity_map, [], None, [], [])
        open_questions = self._compose_open_questions(project, payload.question, evidence, selected_relationships or relationships, rendered_turns, True, False, entity_map, [], None, [])

        discussion = self._build_discussion_record(
            project_id=project["project_id"],
            project_name=project["name"],
            question=payload.question,
            selected_agents=selected_agents,
            hypotheses=[],
            validations=[],
            hypothesis_rankings=[],
            selected_hypothesis_id=None,
            constraint_candidates=[],
            validated_constraints=[],
            constraint_review_state=ConstraintReviewState(review_status="completed", review_required=False),
            new_constraint_suggestions=[],
            turns=rendered_turns,
            evidence=evidence,
            graph=graph,
            summary=summary,
            next_actions=next_actions,
            open_questions=open_questions,
        )
        return self._project_repository.save_discussion(discussion)

    def clarify_question(self, question: str) -> dict[str, Any]:
        trimmed = question.strip()
        normalized = " ".join(trimmed.split())

        token_count = len(self._tokenize(normalized))
        normalized_lower = normalized.lower()
        has_goal_signal = any(token in normalized_lower for token in ["why", "how", "compare", "optimiz", "improve", "effect", "영향", "비교", "최적", "원인", "조건"])
        has_domain_signal = any(token in normalized_lower for token in ["material", "process", "experiment", "optimize", "parameter", "synthesis", "model", "재료", "실험", "공정", "최적화", "파라미터", "합성", "모델", "성능", "특성"])
        needs_clarification = len(normalized) < 18 or token_count < 4 or not (has_goal_signal or has_domain_signal)
        follow_up = None
        reasoning = "질문을 현재 표현 그대로 정리해 토론 세션에 전달합니다."

        if needs_clarification:
            follow_up = "비교할 변수, 확인할 지표, 또는 가장 중요한 제약 조건을 한 줄만 더 알려주세요."
            reasoning = "질문 범위가 넓어 보여 핵심 변수나 목표 지표를 보강하면 토론 품질이 더 좋아집니다."

        return {
            "refined_question": normalized,
            "needs_clarification": needs_clarification,
            "follow_up": follow_up,
            "reasoning": reasoning,
        }

    def preview_constraints(self, *, project_id: str, question: str) -> dict[str, Any]:
        trimmed_question = question.strip()
        if not trimmed_question:
            raise ValueError("Question is required.")

        project = self._project_repository.get_project(project_id)
        agents = self._project_repository.list_agents(project_id)
        chunks = self._project_repository.list_chunks(project_id)
        if not agents or not chunks:
            return {
                "candidates": [],
                "validated_constraints": [],
                "review_state": ConstraintReviewState(review_status="pending", review_required=False).model_dump(mode="json"),
                "missing_inputs": [],
                "follow_up_questions": [],
            }

        selected_agents = self._apply_agent_role_fallbacks(self._select_agents(trimmed_question, agents, min(3, len(agents)), use_llm=False))
        seen_chunk_ids_by_agent: dict[str, set[str]] = {agent["agent_id"]: set() for agent in selected_agents}
        seen_chunk_ids_by_panel: set[str] = set()
        seed_evidence = self._collect_hypothesis_seed_evidence(
            question=trimmed_question,
            chunks=chunks,
            selected_agents=selected_agents,
            seen_chunk_ids_by_agent=seen_chunk_ids_by_agent,
            seen_chunk_ids_by_panel=seen_chunk_ids_by_panel,
            use_web_search=False,
        )
        extracted = self._extract_constraint_candidates(trimmed_question, project, seed_evidence, use_llm=False)
        candidates = extracted["candidates"]
        review_state = ConstraintReviewState(
            review_status="pending",
            review_required=bool(candidates),
            approved_constraint_ids=[],
            rejected_constraint_ids=[],
            last_reviewed_at=None,
        )
        return {
            "candidates": [item.model_dump(mode="json") for item in candidates],
            "validated_constraints": [],
            "review_state": review_state.model_dump(mode="json"),
            "missing_inputs": extracted["missing_inputs"],
            "follow_up_questions": extracted["follow_up_questions"],
        }

    def list_constraint_seed_candidates(self) -> list[dict[str, Any]]:
        now = datetime.now(timezone.utc)
        candidates = [
            ConstraintCandidate(
                constraint_id=str(seed.get("constraint_id") or seed.get("id") or f"seed-constraint-{index}"),
                text=str(seed.get("text") or "").strip(),
                constraint_type=str(seed.get("constraint_type") or "assumption"),
                scope=str(seed.get("scope") or "project"),
                why=str(seed.get("why") or "seed constraint"),
                source=str(seed.get("source") or "seed"),
                confidence=float(seed.get("confidence") or 0.55),
                numeric_bounds=self._normalize_numeric_bounds(seed.get("numeric_bounds")),
                status="candidate",
                created_at=now,
            )
            for index, seed in enumerate(self._constraint_seeds, start=1)
            if str(seed.get("text") or "").strip()
        ]
        return [item.model_dump(mode="json") for item in self._dedupe_constraint_candidates(candidates)]

    def stream_discussion(
        self,
        *,
        project_id: str,
        question: str,
        num_agents: int = 4,
        num_rounds: int = 2,
        use_web_search: bool = True,
        use_equipment_constraints: bool = False,
        use_constraint_wiki: bool = True,
        approved_constraints: list[dict[str, Any]] | None = None,
        enable_hypothesis_stage: bool = True,
        debug_mode: bool = False,
    ) -> Iterator[dict[str, Any]]:
        trimmed_question = question.strip()
        if not trimmed_question:
            raise ValueError("Question is required.")

        self._synthesis_cache.clear()
        project = self._project_repository.get_project(project_id)
        agents = self._project_repository.list_agents(project_id)
        chunks = self._project_repository.list_chunks(project_id)
        entities = self._project_repository.list_entities(project_id)
        relationships = self._project_repository.list_relationships(project_id)

        if not agents:
            raise ValueError("No agents are available for this project.")
        if not chunks:
            raise ValueError("No evidence chunks are available for this project.")

        use_llm = not debug_mode
        selected_agents = self._apply_agent_role_fallbacks(self._select_agents(trimmed_question, agents, num_agents, use_llm=use_llm))
        total_rounds = max(1, num_rounds)
        evidence_by_id: dict[str, dict[str, Any]] = {}
        selected_relationships: list[dict[str, Any]] = []
        rendered_turns: list[dict[str, Any]] = []
        turn_briefs: list[dict[str, Any]] = []
        round_summaries: list[dict[str, Any]] = []
        entity_map = {entity["entity_key"]: entity for entity in entities}
        seen_chunk_ids_by_agent: dict[str, set[str]] = {agent["agent_id"]: set() for agent in selected_agents}
        seen_chunk_ids_by_panel: set[str] = set()
        follow_up_by_agent: dict[str, str] = {}
        hypotheses: list[dict[str, Any]] = []
        validations: list[dict[str, Any]] = []
        hypothesis_rankings: list[dict[str, Any]] = []
        selected_hypothesis_id: str | None = None
        selected_hypothesis: dict[str, Any] | None = None
        approved_constraints = approved_constraints or []
        validated_constraints = self._normalize_validated_constraints(approved_constraints)
        constraint_candidates: list[ConstraintCandidate] = []
        constraint_review_state = ConstraintReviewState(
            review_status="completed" if validated_constraints else "pending",
            review_required=False,
            approved_constraint_ids=[item.constraint_id for item in validated_constraints],
            rejected_constraint_ids=[],
            last_reviewed_at=datetime.now(timezone.utc) if validated_constraints else None,
        )
        new_constraint_suggestions: list[ConstraintCandidate] = []

        yield {"event": "status", "data": {"message": "질문 분석 중..."}}
        yield {"event": "status", "data": {"message": "질문과 가장 맞는 전문가 조합을 정렬하는 중..."}}
        if use_web_search:
            yield {"event": "status", "data": {"message": "프로젝트 전반의 확장 근거까지 함께 탐색하는 중..."}}
        if use_equipment_constraints:
            yield {"event": "status", "data": {"message": "장비 제약과 연결되는 실험 조건을 함께 확인하는 중..."}}
        yield {
            "event": "agents",
            "data": {
                "agents_used": [self._to_agent_payload(agent) for agent in selected_agents],
                "total_rounds": total_rounds,
            },
        }

        if use_constraint_wiki:
            if validated_constraints:
                constraint_review_state = ConstraintReviewState(
                    review_status="completed",
                    review_required=False,
                    approved_constraint_ids=[item.constraint_id for item in validated_constraints],
                    rejected_constraint_ids=[],
                    last_reviewed_at=datetime.now(timezone.utc),
                )
                yield {
                    "event": "constraint_candidates",
                    "data": {
                        "candidates": [],
                        "validated_constraints": [item.model_dump(mode="json") for item in validated_constraints],
                        "review_state": constraint_review_state.model_dump(mode="json"),
                        "missing_inputs": [],
                        "follow_up_questions": [],
                    },
                }
            else:
                seed_evidence = self._collect_hypothesis_seed_evidence(
                    question=trimmed_question,
                    chunks=chunks,
                    selected_agents=selected_agents,
                    seen_chunk_ids_by_agent=seen_chunk_ids_by_agent,
                    seen_chunk_ids_by_panel=seen_chunk_ids_by_panel,
                    use_web_search=use_web_search,
                )
                extracted_constraints = self._extract_constraint_candidates(trimmed_question, project, seed_evidence, use_llm=False)
                constraint_candidates = extracted_constraints["candidates"]
                for chunk in seed_evidence:
                    evidence_by_id[chunk["chunk_id"]] = chunk
                if constraint_candidates:
                    constraint_review_state = ConstraintReviewState(
                        review_status="pending",
                        review_required=True,
                        approved_constraint_ids=[],
                        rejected_constraint_ids=[],
                        last_reviewed_at=None,
                    )
                    yield {
                        "event": "constraint_candidates",
                        "data": {
                            "candidates": [item.model_dump(mode="json") for item in constraint_candidates],
                            "validated_constraints": [],
                            "review_state": constraint_review_state.model_dump(mode="json"),
                            "missing_inputs": extracted_constraints["missing_inputs"],
                            "follow_up_questions": extracted_constraints["follow_up_questions"],
                        },
                    }
                    yield {
                        "event": "constraint_review_required",
                        "data": {
                            "review_required": True,
                            "candidate_count": len(constraint_candidates),
                        },
                    }

        if enable_hypothesis_stage:
            yield {"event": "status", "data": {"message": "초기 가설 후보를 구성하는 중..."}}
            hypothesis_seed_evidence = self._collect_hypothesis_seed_evidence(
                question=trimmed_question,
                chunks=chunks,
                selected_agents=selected_agents,
                seen_chunk_ids_by_agent=seen_chunk_ids_by_agent,
                seen_chunk_ids_by_panel=seen_chunk_ids_by_panel,
                use_web_search=use_web_search,
            )
            for chunk in hypothesis_seed_evidence:
                evidence_by_id[chunk["chunk_id"]] = chunk
            hypotheses = self._generate_hypotheses(trimmed_question, project, hypothesis_seed_evidence, selected_agents, use_llm=use_llm)
            if hypotheses:
                yield {
                    "event": "hypotheses",
                    "data": {
                        "candidates": [self._to_hypothesis_payload(item) for item in hypotheses],
                    },
                }
                yield {"event": "status", "data": {"message": "가설별 검증 의견을 수집하는 중..."}}
                for index, hypothesis in enumerate(hypotheses, start=1):
                    yield {
                        "event": "hypothesis_start",
                        "data": {
                            "hypothesis_id": hypothesis["hypothesis_id"],
                            "title": hypothesis["title"],
                            "index": index,
                            "total": len(hypotheses),
                        },
                    }
                    for agent in selected_agents:
                        ranked_chunks = self._rank_chunks(
                            self._compose_hypothesis_query(trimmed_question, hypothesis),
                            chunks,
                            agent,
                            [],
                            seen_chunk_ids=seen_chunk_ids_by_agent[agent["agent_id"]],
                            panel_seen_chunk_ids=seen_chunk_ids_by_panel,
                            use_web_search=use_web_search,
                        )
                        for chunk in ranked_chunks:
                            evidence_by_id[chunk["chunk_id"]] = chunk
                            seen_chunk_ids_by_agent[agent["agent_id"]].add(chunk["chunk_id"])
                            seen_chunk_ids_by_panel.add(chunk["chunk_id"])
                        validation = self._validate_hypothesis(trimmed_question, hypothesis, agent, ranked_chunks, use_llm=use_llm)
                        validations.append(validation)
                        yield {
                            "event": "validation",
                            "data": {
                                **self._to_hypothesis_validation_payload(validation),
                                "agent_expertise": agent.get("expertise") or agent["focus"],
                                "community_id": agent.get("community_id") or "seed-community",
                                "source_chunks": [self._to_source_chunk_payload(chunk) for chunk in ranked_chunks],
                            },
                        }
                hypothesis_ranking_result = self._rank_hypotheses(trimmed_question, project, hypotheses, validations, use_llm=use_llm)
                hypothesis_rankings = hypothesis_ranking_result["rankings"]
                selected_hypothesis_id = hypothesis_ranking_result["selected_hypothesis_id"]
                selected_hypothesis = next((item for item in hypotheses if item["hypothesis_id"] == selected_hypothesis_id), hypotheses[0] if hypotheses else None)
                yield {
                    "event": "hypothesis_ranking",
                    "data": {
                        "ranked_candidates": [self._to_hypothesis_ranking_payload(item) for item in hypothesis_rankings],
                    },
                }
                if selected_hypothesis is not None:
                    yield {
                        "event": "hypothesis_selected",
                        "data": {
                            "hypothesis_id": selected_hypothesis["hypothesis_id"],
                            "title": selected_hypothesis["title"],
                            "summary": selected_hypothesis.get("rationale") or selected_hypothesis.get("statement") or "",
                        },
                    }

        round_question = self._compose_question_with_selected_hypothesis(trimmed_question, selected_hypothesis)

        for round_num in range(1, total_rounds + 1):
            yield {"event": "round_start", "data": {"round_num": round_num}}
            round_context = turn_briefs[-len(selected_agents):] if turn_briefs else []
            moderator_packet: dict[str, Any] | None = None
            if round_num > 1 and round_context:
                moderator_packet = self._build_moderator_packet(round_question, round_context, selected_relationships or relationships, selected_agents, use_llm=use_llm)
                follow_up_by_agent = moderator_packet["follow_up_by_agent"]
                round_summary = self._to_round_summary_payload(round_num, moderator_packet)
                round_summaries.append(round_summary)
                yield {
                    "event": "message",
                    "data": {
                        "agent_name": "토론 진행자",
                        "agent_expertise": "패널 분석 및 진행",
                        "community_id": "moderator",
                        "round_num": round_num,
                        "content": moderator_packet["content"],
                        "source_chunks": [],
                        "round_summary": round_summary,
                    },
                }
            for agent in selected_agents:
                follow_up_focus = follow_up_by_agent.get(agent["agent_id"], "")
                ranked_chunks = self._rank_chunks(
                    self._compose_round_query(round_question, follow_up_focus),
                    chunks,
                    agent,
                    round_context,
                    seen_chunk_ids=seen_chunk_ids_by_agent[agent["agent_id"]],
                    panel_seen_chunk_ids=seen_chunk_ids_by_panel,
                    use_web_search=use_web_search,
                )
                relationships_for_turn = self._pick_relationships(agent, relationships, ranked_chunks)
                relationship = relationships_for_turn[0] if relationships_for_turn else None
                for item in relationships_for_turn:
                    if item not in selected_relationships:
                        selected_relationships.append(item)
                for chunk in ranked_chunks:
                    evidence_by_id[chunk["chunk_id"]] = chunk
                    seen_chunk_ids_by_agent[agent["agent_id"]].add(chunk["chunk_id"])
                    seen_chunk_ids_by_panel.add(chunk["chunk_id"])

                equipment_note = self._build_constraint_note(entity_map, ranked_chunks, use_equipment_constraints, validated_constraints)
                message_payload = self._compose_round_message(
                    question=round_question,
                    agent=agent,
                    chunks=ranked_chunks,
                    relationship=relationship,
                    round_context=round_context,
                    round_num=round_num,
                    use_web_search=use_web_search,
                    equipment_note=equipment_note,
                    follow_up_focus=follow_up_focus,
                    panel_agents=selected_agents,
                    moderator_packet=moderator_packet,
                    use_llm=use_llm,
                )
                structured_output = message_payload.get("structured_output", {})
                turn = {
                    "speaker": agent["name"],
                    "stance": agent["stance"],
                    "agent_id": agent["agent_id"],
                    "message": message_payload["message"],
                    "references": [chunk["title"] for chunk in ranked_chunks],
                    "evidence_ids": structured_output.get("evidence_ids", []),
                    "round_num": round_num,
                    "community_id": agent.get("community_id") or "seed-community",
                    "source_chunks": [self._to_source_chunk_payload(chunk) for chunk in ranked_chunks],
                    "structured_output": structured_output,
                    "claim": structured_output.get("claim"),
                    "constraint_risks": structured_output.get("constraint_risks", []),
                    "uncertainties": structured_output.get("uncertainties", []),
                    "experiment_proposal": structured_output.get("experiment_proposal"),
                    "confidence": structured_output.get("confidence"),
                    "bo_bridge_note": structured_output.get("bo_bridge_note"),
                }
                turn["turn_brief"] = self._build_turn_brief(turn)
                rendered_turns.append(turn)
                turn_briefs.append(turn["turn_brief"])
                yield {
                    "event": "message",
                    "data": {
                        "agent_id": agent["agent_id"],
                        "agent_name": agent["name"],
                        "agent_expertise": agent.get("expertise") or agent["focus"],
                        "community_id": agent.get("community_id") or "seed-community",
                        "round_num": round_num,
                        "content": message_payload["message"],
                        "source_chunks": turn["source_chunks"],
                        "structured_output": structured_output,
                        "turn_brief": turn["turn_brief"],
                    },
                }
                if debug_mode:
                    yield {
                        "event": "debug",
                        "data": {
                            "agent_id": agent["agent_id"],
                            "agent_name": agent["name"],
                            "round_num": round_num,
                            "use_web_search": use_web_search,
                            "use_equipment_constraints": use_equipment_constraints,
                            "selected_chunk_ids": [chunk["chunk_id"] for chunk in ranked_chunks],
                            "selected_sources": [chunk["source"] for chunk in ranked_chunks],
                            "selected_titles": [chunk["title"] for chunk in ranked_chunks],
                            "relationship_ids": [item["relationship_id"] for item in relationships_for_turn],
                            "equipment_note": equipment_note,
                        },
                    }

        evidence = list(evidence_by_id.values())
        research_context = self._build_research_context(
            selected_agents=selected_agents,
            total_rounds=total_rounds,
            evidence=evidence,
            rendered_turns=rendered_turns,
            turn_briefs=turn_briefs,
            round_summaries=round_summaries,
        )
        graph = self._engine._build_graph(entities, selected_relationships or relationships[:2], evidence)
        summary = self._compose_summary(
            project,
            round_question,
            rendered_turns,
            evidence,
            selected_relationships or relationships,
            use_web_search,
            use_equipment_constraints,
            entity_map,
            validated_constraints,
            selected_hypothesis,
            hypothesis_rankings,
            validations,
            use_llm=use_llm,
        )
        next_actions = self._compose_next_actions(
            project,
            round_question,
            rendered_turns,
            evidence,
            selected_relationships or relationships,
            use_web_search,
            use_equipment_constraints,
            entity_map,
            validated_constraints,
            selected_hypothesis,
            hypothesis_rankings,
            validations,
            use_llm=use_llm,
        )
        open_questions = self._compose_open_questions(
            project,
            round_question,
            evidence,
            selected_relationships or relationships,
            rendered_turns,
            use_web_search,
            use_equipment_constraints,
            entity_map,
            validated_constraints,
            selected_hypothesis,
            validations,
            use_llm=use_llm,
        )

        new_constraint_suggestions = [
            item.model_copy(update={"last_reviewed_at": datetime.now(timezone.utc)})
            for item in constraint_candidates[:4]
            if item.constraint_id not in {constraint.constraint_id for constraint in validated_constraints}
        ]

        discussion = self._build_discussion_record(
            project_id=project["project_id"],
            project_name=project["name"],
            question=trimmed_question,
            selected_agents=selected_agents,
            hypotheses=hypotheses,
            validations=validations,
            hypothesis_rankings=hypothesis_rankings,
            selected_hypothesis_id=selected_hypothesis_id,
            constraint_candidates=constraint_candidates,
            validated_constraints=validated_constraints,
            constraint_review_state=constraint_review_state,
            new_constraint_suggestions=new_constraint_suggestions,
            turns=rendered_turns,
            evidence=evidence,
            graph=graph,
            summary=summary,
            next_actions=next_actions,
            open_questions=open_questions,
        )
        self._project_repository.save_discussion(discussion)

        yield {
            "event": "done",
            "data": {
                "discussion_id": discussion.discussion_id,
                "question": trimmed_question,
                "summary": summary,
                "next_actions": next_actions,
                "open_questions": open_questions,
                "agents": [self._to_agent_summary_payload(agent) for agent in selected_agents],
                "hypotheses": [self._to_hypothesis_payload(item) for item in hypotheses],
                "validations": [self._to_hypothesis_validation_payload(item) for item in validations],
                "hypothesis_rankings": [self._to_hypothesis_ranking_payload(item) for item in hypothesis_rankings],
                "selected_hypothesis_id": selected_hypothesis_id,
                "constraint_candidates": [item.model_dump(mode="json") for item in constraint_candidates],
                "validated_constraints": [item.model_dump(mode="json") for item in validated_constraints],
                "constraint_review_state": constraint_review_state.model_dump(mode="json"),
                "new_constraint_suggestions": [item.model_dump(mode="json") for item in new_constraint_suggestions],
                "research_context": research_context,
                "context_budget": research_context["context_budget"],
                "round_summaries": round_summaries,
                "evidence": [self._to_evidence_payload(item) for item in evidence],
                "graph": graph,
                "created_at": discussion.created_at.isoformat(),
            },
        }

    def stream_hypothesis_exploration(
        self,
        *,
        project_id: str,
        goal: str,
        num_agents: int = 4,
        num_candidates: int = 4,
        max_validation_passes: int = 2,
        use_web_search: bool = True,
        debug_mode: bool = False,
    ) -> Iterator[dict[str, Any]]:
        trimmed_goal = goal.strip()
        if not trimmed_goal:
            raise ValueError("Goal is required.")

        run_id = str(uuid4())
        self._synthesis_cache.clear()
        project = self._project_repository.get_project(project_id)
        agents = self._project_repository.list_agents(project_id)
        chunks = self._project_repository.list_chunks(project_id)

        if not agents:
            raise ValueError("No agents are available for this project.")
        if not chunks:
            raise ValueError("No evidence chunks are available for this project.")

        use_llm = not debug_mode
        selected_agents = self._apply_agent_role_fallbacks(self._select_agents(trimmed_goal, agents, num_agents, use_llm=use_llm))
        seen_chunk_ids_by_agent: dict[str, set[str]] = {agent["agent_id"]: set() for agent in selected_agents}
        seen_chunk_ids_by_panel: set[str] = set()
        evidence_by_id: dict[str, dict[str, Any]] = {}
        validations: list[dict[str, Any]] = []

        yield {"event": "status", "data": {"message": "Creative hypothesis strategist is framing testable candidates."}}
        yield {
            "event": "agents",
            "data": {
                "agents_used": [self._to_agent_payload(agent) for agent in selected_agents],
                "goal": trimmed_goal,
                "mode": "hypothesis-exploration",
            },
        }

        seed_evidence = self._collect_hypothesis_seed_evidence(
            question=trimmed_goal,
            chunks=chunks,
            selected_agents=selected_agents,
            seen_chunk_ids_by_agent=seen_chunk_ids_by_agent,
            seen_chunk_ids_by_panel=seen_chunk_ids_by_panel,
            use_web_search=use_web_search,
        )
        for chunk in seed_evidence:
            evidence_by_id[chunk["chunk_id"]] = chunk

        hypotheses = self._generate_hypotheses(
            trimmed_goal,
            project,
            seed_evidence,
            selected_agents,
            num_candidates=max(2, min(6, num_candidates)),
            use_llm=use_llm,
        )
        yield {
            "event": "hypotheses",
            "data": {"candidates": [self._to_hypothesis_payload(item) for item in hypotheses]},
        }

        yield {"event": "status", "data": {"message": "Specialist agents are validating each hypothesis."}}
        validation_passes = 1
        for event in self._stream_hypothesis_validation_pass(
            question=trimmed_goal,
            hypotheses=hypotheses,
            selected_agents=selected_agents,
            chunks=chunks,
            validations=validations,
            evidence_by_id=evidence_by_id,
            seen_chunk_ids_by_agent=seen_chunk_ids_by_agent,
            seen_chunk_ids_by_panel=seen_chunk_ids_by_panel,
            use_web_search=use_web_search,
            use_llm=use_llm,
            validation_pass=1,
        ):
            yield event

        validation_gap_reasons = self._assess_validation_gaps(hypotheses, selected_agents, validations)
        if validation_gap_reasons and max_validation_passes > 1:
            yield {"event": "status", "data": {"message": "검증 근거가 부족해 2차 검증 루프를 실행합니다."}}
            validation_passes = 2
            for event in self._stream_hypothesis_validation_pass(
                question=trimmed_goal,
                hypotheses=hypotheses,
                selected_agents=selected_agents,
                chunks=chunks,
                validations=validations,
                evidence_by_id=evidence_by_id,
                seen_chunk_ids_by_agent=seen_chunk_ids_by_agent,
                seen_chunk_ids_by_panel=seen_chunk_ids_by_panel,
                use_web_search=use_web_search,
                use_llm=use_llm,
                validation_pass=2,
            ):
                yield event
            validation_gap_reasons = self._assess_validation_gaps(hypotheses, selected_agents, validations)
        validation_complete = len(validation_gap_reasons) == 0

        ranking_result = self._rank_hypotheses(trimmed_goal, project, hypotheses, validations, use_llm=use_llm)
        hypothesis_rankings = ranking_result["rankings"]
        selected_hypothesis_id = ranking_result["selected_hypothesis_id"]
        selected_hypothesis = next((item for item in hypotheses if item["hypothesis_id"] == selected_hypothesis_id), hypotheses[0] if hypotheses else None)

        yield {
            "event": "hypothesis_ranking",
            "data": {"ranked_candidates": [self._to_hypothesis_ranking_payload(item) for item in hypothesis_rankings]},
        }
        if selected_hypothesis is not None:
            yield {
                "event": "hypothesis_selected",
                "data": {
                    "hypothesis_id": selected_hypothesis["hypothesis_id"],
                    "title": selected_hypothesis["title"],
                    "summary": selected_hypothesis.get("rationale") or selected_hypothesis.get("statement") or "",
                },
            }

        evidence = list(evidence_by_id.values())
        summary = self._compose_hypothesis_exploration_summary(trimmed_goal, selected_hypothesis, hypothesis_rankings, validations)
        next_actions = self._compose_hypothesis_exploration_actions(selected_hypothesis, validations)
        open_questions = self._compose_hypothesis_exploration_questions(selected_hypothesis, validations)

        yield {
            "event": "done",
            "data": {
                "run_id": run_id,
                "goal": trimmed_goal,
                "question": trimmed_goal,
                "summary": summary,
                "next_actions": next_actions,
                "open_questions": open_questions,
                "agents": [self._to_agent_summary_payload(agent) for agent in selected_agents],
                "hypotheses": [self._to_hypothesis_payload(item) for item in hypotheses],
                "validations": [self._to_hypothesis_validation_payload(item) for item in validations],
                "hypothesis_rankings": [self._to_hypothesis_ranking_payload(item) for item in hypothesis_rankings],
                "selected_hypothesis_id": selected_hypothesis_id,
                "validation_passes": validation_passes,
                "validation_complete": validation_complete,
                "validation_gap_reasons": validation_gap_reasons,
                "evidence": [self._to_evidence_payload(item) for item in evidence],
                "graph": {"nodes": [], "edges": []},
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
        }

    def _stream_hypothesis_validation_pass(
        self,
        *,
        question: str,
        hypotheses: list[dict[str, Any]],
        selected_agents: list[dict[str, Any]],
        chunks: list[dict[str, Any]],
        validations: list[dict[str, Any]],
        evidence_by_id: dict[str, dict[str, Any]],
        seen_chunk_ids_by_agent: dict[str, set[str]],
        seen_chunk_ids_by_panel: set[str],
        use_web_search: bool,
        use_llm: bool,
        validation_pass: int,
    ) -> Iterator[dict[str, Any]]:
        for index, hypothesis in enumerate(hypotheses, start=1):
            yield {
                "event": "hypothesis_start",
                "data": {
                    "hypothesis_id": hypothesis["hypothesis_id"],
                    "title": hypothesis["title"],
                    "index": index,
                    "total": len(hypotheses),
                    "validation_pass": validation_pass,
                },
            }
            for agent in selected_agents:
                ranked_chunks = self._rank_chunks(
                    self._compose_hypothesis_query(question, hypothesis),
                    chunks,
                    agent,
                    [],
                    seen_chunk_ids=seen_chunk_ids_by_agent[agent["agent_id"]],
                    panel_seen_chunk_ids=seen_chunk_ids_by_panel,
                    use_web_search=use_web_search,
                )
                for chunk in ranked_chunks:
                    evidence_by_id[chunk["chunk_id"]] = chunk
                    seen_chunk_ids_by_agent[agent["agent_id"]].add(chunk["chunk_id"])
                    seen_chunk_ids_by_panel.add(chunk["chunk_id"])
                validation = self._validate_hypothesis(question, hypothesis, agent, ranked_chunks, use_llm=use_llm)
                validation["validation_pass"] = validation_pass
                validations.append(validation)
                yield {
                    "event": "validation",
                    "data": {
                        **self._to_hypothesis_validation_payload(validation),
                        "agent_expertise": agent.get("expertise") or agent["focus"],
                        "community_id": agent.get("community_id") or "seed-community",
                        "source_chunks": [self._to_source_chunk_payload(chunk) for chunk in ranked_chunks],
                    },
                }

    @staticmethod
    def _assess_validation_gaps(
        hypotheses: list[dict[str, Any]],
        selected_agents: list[dict[str, Any]],
        validations: list[dict[str, Any]],
    ) -> list[str]:
        reasons: list[str] = []
        expected_per_hypothesis = len(selected_agents)
        for hypothesis in hypotheses:
            hypothesis_id = hypothesis.get("hypothesis_id")
            title = hypothesis.get("title") or hypothesis_id or "가설"
            related = [item for item in validations if item.get("hypothesis_id") == hypothesis_id]
            if len(related) < expected_per_hypothesis:
                reasons.append(f"{title}: 전문가 검증 의견이 부족합니다.")
            evidence_ids = {
                evidence_id
                for item in related
                for evidence_id in item.get("evidence_ids", [])
                if evidence_id
            }
            if len(evidence_ids) < 2:
                reasons.append(f"{title}: 독립 근거가 2개 미만입니다.")
            if related and not any(item.get("confidence") in {"medium", "high"} for item in related):
                reasons.append(f"{title}: 중간 이상 신뢰도의 검증 의견이 없습니다.")
            if related and not any(str(item.get("key_test") or "").strip() for item in related):
                reasons.append(f"{title}: 판별 실험 포인트가 비어 있습니다.")

        if validations and all(item.get("confidence") == "low" for item in validations):
            reasons.append("전체 검증 의견이 모두 low confidence입니다.")
        if validations and not any(item.get("evidence_ids") for item in validations):
            reasons.append("전체 검증 의견에 연결된 evidence가 없습니다.")
        return list(dict.fromkeys(reasons))[:6]

    def _load_equipment_constraints_text(self) -> str:
        candidate_paths = [
            settings.data_dir / "equipment_constraints.md",
            settings.discussion_knowledge_dir / "equipment_constraints.md",
            Path(settings.sqlite_path).parent / "equipment_constraints.md",
        ]
        for path in candidate_paths:
            if path.exists():
                return path.read_text(encoding="utf-8").strip()
        return ""

    def _load_constraint_seeds(self) -> list[dict[str, Any]]:
        candidate_paths = [
            settings.discussion_knowledge_dir / "constraint_seeds.json",
            settings.data_dir / "constraint_seeds.json",
        ]
        for path in candidate_paths:
            if not path.exists():
                continue
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if isinstance(payload, list):
                return [item for item in payload if isinstance(item, dict)]
        return []

    @staticmethod
    def _normalize_numeric_bounds(value: Any) -> list[NumericConstraintBound]:
        if not isinstance(value, list):
            return []
        bounds: list[NumericConstraintBound] = []
        for item in value:
            if not isinstance(item, dict):
                continue
            try:
                bounds.append(NumericConstraintBound.model_validate(item))
            except ValueError:
                continue
        return bounds

    def _normalize_validated_constraints(self, items: list[dict[str, Any]]) -> list[ValidatedConstraint]:
        normalized: list[ValidatedConstraint] = []
        now = datetime.now(timezone.utc)
        for index, item in enumerate(items, start=1):
            if not isinstance(item, dict):
                continue
            text = str(item.get("text") or "").strip()
            if not text:
                continue
            normalized.append(
                ValidatedConstraint(
                    constraint_id=str(item.get("constraint_id") or f"approved-constraint-{index}").strip() or f"approved-constraint-{index}",
                    text=text,
                    constraint_type=str(item.get("constraint_type") or "assumption"),
                    scope=str(item.get("scope") or "session"),
                    why=str(item.get("why") or "사용자 승인 constraint"),
                    source=str(item.get("source") or "user-approved"),
                    confidence=float(item.get("confidence") or 0.5),
                    numeric_bounds=self._normalize_numeric_bounds(item.get("numeric_bounds")),
                    status="approved",
                    created_at=item.get("created_at") or now,
                    last_reviewed_at=item.get("last_reviewed_at") or now,
                )
            )
        return normalized

    def _extract_constraint_candidates(
        self,
        question: str,
        project: dict[str, Any],
        evidence: list[dict[str, Any]],
        *,
        use_llm: bool = True,
    ) -> dict[str, Any]:
        llm_result = None
        if use_llm and self._llm is not None:
            llm_result = self._llm.extract_constraint_candidates(
                question=question,
                project=project,
                seed_constraints=self._constraint_seeds,
                evidence=evidence,
            )

        now = datetime.now(timezone.utc)
        if llm_result is not None:
            candidates = [
                ConstraintCandidate(
                    constraint_id=item["constraint_id"],
                    text=item["text"],
                    constraint_type=item.get("constraint_type", "assumption"),
                    scope=item.get("scope", "session"),
                    why=item.get("why", ""),
                    source=item.get("source", "llm-extraction"),
                    confidence=float(item.get("confidence") or 0.5),
                    numeric_bounds=self._normalize_numeric_bounds(item.get("numeric_bounds")),
                    status="candidate",
                    created_at=now,
                )
                for item in llm_result.get("candidates", [])
                if isinstance(item, dict) and str(item.get("text") or "").strip()
            ]
            return {
                "candidates": self._dedupe_constraint_candidates(candidates),
                "missing_inputs": llm_result.get("missing_inputs", []),
                "follow_up_questions": llm_result.get("follow_up_questions", []),
            }

        fallback_candidates: list[ConstraintCandidate] = []
        seen_texts: set[str] = set()
        question_lower = question.lower()
        for seed in self._constraint_seeds:
            text = str(seed.get("text") or "").strip()
            if not text:
                continue
            normalized_text = text.lower()
            keywords = [str(keyword).lower() for keyword in seed.get("keywords", []) if str(keyword).strip()]
            if keywords and not any(keyword in question_lower for keyword in keywords):
                continue
            if normalized_text in seen_texts:
                continue
            seen_texts.add(normalized_text)
            fallback_candidates.append(
                ConstraintCandidate(
                    constraint_id=str(seed.get("constraint_id") or seed.get("id") or f"seed-constraint-{len(fallback_candidates) + 1}"),
                    text=text,
                    constraint_type=str(seed.get("constraint_type") or "assumption"),
                    scope=str(seed.get("scope") or "project"),
                    why=str(seed.get("why") or "seed constraint"),
                    source=str(seed.get("source") or "seed"),
                    confidence=float(seed.get("confidence") or 0.55),
                    numeric_bounds=self._normalize_numeric_bounds(seed.get("numeric_bounds")),
                    status="candidate",
                    created_at=now,
                )
            )
            if len(fallback_candidates) >= 6:
                break

        if not fallback_candidates and self._equipment_constraints_text:
            first_line = next((line.strip() for line in self._equipment_constraints_text.splitlines() if line.strip()), "")
            if first_line:
                fallback_candidates.append(
                    ConstraintCandidate(
                        constraint_id="legacy-equipment-constraint",
                        text=first_line[:240],
                        constraint_type="hard",
                        scope="project",
                        why="기존 equipment constraint fallback",
                        source="equipment_constraints.md",
                        confidence=0.6,
                        status="candidate",
                        created_at=now,
                    )
                )

        return {
            "candidates": self._dedupe_constraint_candidates(fallback_candidates),
            "missing_inputs": [],
            "follow_up_questions": [],
        }

    @staticmethod
    def _dedupe_constraint_candidates(candidates: list[ConstraintCandidate]) -> list[ConstraintCandidate]:
        deduped: list[ConstraintCandidate] = []
        seen: set[str] = set()
        for candidate in candidates:
            key = candidate.text.strip().lower()
            if not key or key in seen:
                continue
            seen.add(key)
            deduped.append(candidate)
        return deduped

    @staticmethod
    def _format_bound_number(value: float | None) -> str:
        if value is None:
            return "?"
        return f"{value:g}"

    def _format_numeric_bound(self, bound: Any) -> str:
        unit = f" {bound.unit}" if getattr(bound, "unit", None) else ""
        lower = getattr(bound, "min_value", None)
        upper = getattr(bound, "max_value", None)
        recommended_lower = getattr(bound, "recommended_min", None)
        recommended_upper = getattr(bound, "recommended_max", None)
        nominal = getattr(bound, "nominal_value", None)
        parts: list[str] = []
        if lower is not None and upper is not None:
            parts.append(f"허용 {self._format_bound_number(lower)}–{self._format_bound_number(upper)}{unit}")
        elif lower is not None:
            parts.append(f"허용 ≥ {self._format_bound_number(lower)}{unit}")
        elif upper is not None:
            parts.append(f"허용 ≤ {self._format_bound_number(upper)}{unit}")
        if recommended_lower is not None and recommended_upper is not None:
            parts.append(f"권장 {self._format_bound_number(recommended_lower)}–{self._format_bound_number(recommended_upper)}{unit}")
        elif recommended_lower is not None:
            parts.append(f"권장 ≥ {self._format_bound_number(recommended_lower)}{unit}")
        elif recommended_upper is not None:
            parts.append(f"권장 ≤ {self._format_bound_number(recommended_upper)}{unit}")
        if nominal is not None:
            parts.append(f"기준 {self._format_bound_number(nominal)}{unit}")
        basis = getattr(bound, "basis", "")
        suffix = f"; 근거: {basis}" if basis else ""
        return f"{bound.parameter}: {', '.join(parts) if parts else '범위 미정'}{suffix}"

    def _build_constraint_note(
        self,
        entity_map: dict[str, dict[str, Any]],
        chunks: list[dict[str, Any]],
        use_equipment_constraints: bool,
        validated_constraints: list[ValidatedConstraint],
    ) -> str:
        if validated_constraints:
            lines: list[str] = []
            for item in validated_constraints[:6]:
                lines.append(f"- {item.text} ({item.constraint_type}, {item.scope})")
                for bound in item.numeric_bounds[:4]:
                    lines.append(f"  - numeric bound 후보: {self._format_numeric_bound(bound)}")
            return "실험 설계와 해석에서는 아래 승인된 constraint를 반드시 유지해야 합니다.\n" + "\n".join(lines)
        return self._build_equipment_note(entity_map, chunks, use_equipment_constraints)

    @staticmethod
    def _tokenize(value: str) -> set[str]:
        return {token.lower() for token in re.findall(r"[A-Za-z0-9_+./-]{2,}|[가-힣]{2,}", value or "")}

    def _agent_terms(self, agent: dict[str, Any]) -> set[str]:
        parts = [
            agent.get("name", ""),
            agent.get("focus", ""),
            agent.get("expertise", ""),
            agent.get("perspective", ""),
            agent.get("unique_domain", ""),
            " ".join(agent.get("retrieval_terms", [])),
            " ".join(agent.get("evidence_focus", [])),
            " ".join(agent.get("knowledge_scope", [])[:8]),
        ]
        return self._tokenize(" ".join(parts))

    def _score_agent(self, question_tokens: set[str], normalized_question: str, agent: dict[str, Any]) -> float:
        terms = self._agent_terms(agent)
        overlap = len(question_tokens & terms)
        retrieval_hits = sum(1.4 for term in agent.get("retrieval_terms", []) if term.lower() in normalized_question)
        focus_hits = sum(1.2 for term in agent.get("evidence_focus", []) if term.lower() in normalized_question)
        direct_focus_bonus = 1.5 if agent.get("focus", "").lower() in normalized_question else 0.0
        expertise_bonus = 1.2 if agent.get("expertise", "").lower() in normalized_question else 0.0

        plasma_bonus = 0.0
        if any(token in normalized_question for token in ["methane", "ch4", "plasma", "oes", "langmuir", "라디칼", "플라즈마", "메탄"]):
            plasma_bonus += sum(
                2.4 for token in ["plasma", "ch4", "methane", "oes", "langmuir", "ion", "radical", "chemistry"] if token in terms
            )

        substrate_bonus = 0.0
        if any(token in normalized_question for token in ["substrate", "seed", "nucleation", "adhesion", "표면", "기판", "시드", "핵생성"]):
            substrate_bonus += sum(
                2.2 for token in ["substrate", "seed", "nucleation", "adhesion", "surface", "pretreatment"] if token in terms
            )

        device_penalty = 0.0
        if not any(token in normalized_question for token in ["device", "mos", "fet", "contact", "dit", "소자", "접촉"]):
            if any(token in terms for token in ["device", "mos", "fet", "contact", "electrical"]):
                device_penalty = 2.4

        return overlap * 3.2 + retrieval_hits + focus_hits + direct_focus_bonus + expertise_bonus + plasma_bonus + substrate_bonus - device_penalty

    def _select_agents(self, question: str, agents: list[dict[str, Any]], num_agents: int, *, use_llm: bool = True) -> list[dict[str, Any]]:
        if len(agents) <= num_agents:
            return agents

        if use_llm and self._llm is not None:
            selected_agent_ids = self._llm.select_agents(question=question, agents=agents, num_agents=num_agents)
            if selected_agent_ids:
                selected_by_id = [agent for agent in agents if agent["agent_id"] in selected_agent_ids]
                if len(selected_by_id) >= num_agents:
                    selected_by_id.sort(key=lambda agent: selected_agent_ids.index(agent["agent_id"]))
                    return selected_by_id[:num_agents]

        normalized_question = question.lower()
        question_tokens = self._tokenize(question)
        candidates = [
            {
                "agent": agent,
                "terms": self._agent_terms(agent),
                "score": self._score_agent(question_tokens, normalized_question, agent),
            }
            for agent in agents
        ]
        selected: list[dict[str, Any]] = []
        covered_terms: set[str] = set()

        while candidates and len(selected) < num_agents:
            best = max(
                candidates,
                key=lambda item: item["score"] + len(item["terms"] - covered_terms) * 0.25 - len(item["terms"] & covered_terms) * 0.08,
            )
            selected.append(best["agent"])
            covered_terms |= best["terms"]
            candidates.remove(best)

        return selected or agents[:num_agents]

    def _apply_agent_role_fallbacks(self, agents: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [self._apply_agent_role_fallback(agent, index) for index, agent in enumerate(agents)]

    def _apply_agent_role_fallback(self, agent: dict[str, Any], index: int) -> dict[str, Any]:
        fallback = self._pick_research_role_fallback(agent, index)
        enriched = dict(agent)
        for key in ["research_duty", "expertise", "perspective", "unique_domain"]:
            if not str(enriched.get(key) or "").strip():
                enriched[key] = fallback[key]
        for key in ["tools_and_methods", "key_terminology", "forbidden_topics"]:
            if not enriched.get(key):
                enriched[key] = fallback[key]
        if not enriched.get("evidence_focus"):
            enriched["evidence_focus"] = fallback["key_terminology"]
        if not enriched.get("retrieval_terms"):
            enriched["retrieval_terms"] = fallback["key_terminology"]
        return enriched

    def _pick_research_role_fallback(self, agent: dict[str, Any], index: int) -> dict[str, Any]:
        agent_text = " ".join(
            str(agent.get(key) or "")
            for key in ["name", "stance", "focus", "expertise", "perspective", "unique_domain"]
        ).lower()
        for fallback in RESEARCH_ROLE_FALLBACKS:
            if any(keyword in agent_text for keyword in fallback["keywords"]):
                return fallback
        return RESEARCH_ROLE_FALLBACKS[index % len(RESEARCH_ROLE_FALLBACKS)]

    def _score_chunk(
        self,
        question_tokens: set[str],
        normalized_question: str,
        chunk: dict[str, Any],
        agent: dict[str, Any],
        round_context: list[dict[str, Any]],
        seen_chunk_ids: set[str],
        panel_seen_chunk_ids: set[str],
        use_web_search: bool,
    ) -> float:
        combined = " ".join(
            [
                chunk.get("title", ""),
                chunk.get("summary", ""),
                chunk.get("excerpt", ""),
                " ".join(chunk.get("keywords", [])),
            ]
        )
        combined_lower = combined.lower()
        chunk_tokens = self._tokenize(combined)
        overlap = len(question_tokens & chunk_tokens)
        retrieval_hits = sum(1.2 for term in agent.get("retrieval_terms", []) if term.lower() in combined_lower)
        focus_hits = sum(1.1 for term in agent.get("evidence_focus", []) if term.lower() in combined_lower)
        role_profile_terms = self._agent_role_profile_terms(agent)
        role_phrase_hits = sum(0.55 for term in role_profile_terms if len(term) > 2 and term in combined_lower)
        role_token_overlap = len(chunk_tokens & set(role_profile_terms)) * 0.35
        keyword_hits = sum(0.9 for keyword in chunk.get("keywords", []) if keyword.lower() in normalized_question)
        entity_overlap = len(set(chunk.get("entity_keys", [])) & set(agent.get("entity_keys", [])))
        recency_bonus = max(0, int(chunk.get("year", 0)) - 2018) * 0.08
        novelty_bonus = 0.0
        if chunk.get("chunk_id") not in panel_seen_chunk_ids:
            novelty_bonus += 0.9
        if chunk.get("chunk_id") not in seen_chunk_ids:
            novelty_bonus += 0.6
        if round_context:
            last_messages = " ".join(turn["message"] for turn in round_context[-2:]).lower()
            if chunk.get("title", "").lower() not in last_messages:
                novelty_bonus += 0.35
        breadth_bonus = 0.4 if use_web_search else 0.0
        repeat_penalty = 2.8 if chunk.get("chunk_id") in seen_chunk_ids else 0.0
        panel_repeat_penalty = 1.2 if chunk.get("chunk_id") in panel_seen_chunk_ids else 0.0
        low_signal_penalty = self._low_signal_chunk_penalty(chunk)
        return (
            overlap * 3.0
            + retrieval_hits
            + focus_hits
            + role_phrase_hits
            + role_token_overlap
            + keyword_hits
            + entity_overlap * 0.9
            + recency_bonus
            + novelty_bonus
            + breadth_bonus
            - repeat_penalty
            - panel_repeat_penalty
            - low_signal_penalty
        )

    def _agent_role_profile_terms(self, agent: dict[str, Any]) -> list[str]:
        values: list[str] = []
        for key in ["expertise", "perspective", "research_duty", "unique_domain"]:
            value = agent.get(key)
            if isinstance(value, str):
                values.append(value)
        for key in ["evidence_focus", "retrieval_terms", "tools_and_methods", "key_terminology"]:
            value = agent.get(key)
            if isinstance(value, list):
                values.extend(str(item) for item in value)
            elif isinstance(value, str):
                values.append(value)

        stopwords = {"and", "for", "with", "the", "this", "that", "from", "into", "model", "analysis", "review"}
        terms: list[str] = []
        for value in values:
            normalized = str(value or "").strip().lower()
            if normalized and normalized not in terms:
                terms.append(normalized)
            for token in self._tokenize(normalized):
                if len(token) > 2 and token not in stopwords and token not in terms:
                    terms.append(token)
        return terms[:40]

    @staticmethod
    def _low_signal_chunk_penalty(chunk: dict[str, Any]) -> float:
        title = (chunk.get("title") or "").strip().lower()
        excerpt = (chunk.get("excerpt") or "").strip()
        summary = (chunk.get("summary") or "").strip()
        combined = f"{title} {summary} {excerpt}".lower()

        penalty = 0.0
        if title in {"references", "reference", "bibliography", "acknowledgements", "acknowledgments", "index", "author index", "subject index", "contents", "table of contents"}:
            penalty += 9.0
        if len(title) <= 2:
            penalty += 4.0
        if title.startswith("table ") or title.startswith("figure "):
            penalty += 2.5
        if combined.count("crossref") >= 2 or combined.count("et al") >= 3:
            penalty += 6.0
        if excerpt.startswith("|") and excerpt.count("|") >= 8:
            penalty += 4.5
        if summary.lower().startswith("co-author of a study"):
            penalty += 8.0
        return penalty

    def _rank_chunks(
        self,
        question: str,
        chunks: list[dict[str, Any]],
        agent: dict[str, Any],
        round_context: list[dict[str, Any]],
        *,
        seen_chunk_ids: set[str],
        panel_seen_chunk_ids: set[str],
        use_web_search: bool,
    ) -> list[dict[str, Any]]:
        context_text = " ".join(turn["message"] for turn in round_context[-2:]) if round_context else ""
        retrieval_query = f"{question} {context_text}".strip()
        query_tokens = self._tokenize(retrieval_query)
        normalized_query = retrieval_query.lower()
        scored = [
            (
                self._score_chunk(
                    query_tokens,
                    normalized_query,
                    chunk,
                    agent,
                    round_context,
                    seen_chunk_ids,
                    panel_seen_chunk_ids,
                    use_web_search,
                ),
                chunk,
            )
            for chunk in chunks
        ]
        scored.sort(key=lambda item: item[0], reverse=True)

        target_count = 3 if use_web_search else 2
        selected: list[dict[str, Any]] = []
        source_counts: dict[str, int] = {}
        for _, chunk in scored:
            source = chunk.get("source", "")
            if source_counts.get(source, 0) >= (2 if use_web_search else 1):
                continue
            selected.append(chunk)
            source_counts[source] = source_counts.get(source, 0) + 1
            if len(selected) >= target_count:
                break

        if not selected:
            return chunks[:target_count]
        return selected

    def _pick_relationships(
        self,
        agent: dict[str, Any],
        relationships: list[dict[str, Any]],
        ranked_chunks: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        candidate_entity_keys = set(agent.get("entity_keys", []))
        for chunk in ranked_chunks:
            candidate_entity_keys.update(chunk.get("entity_keys", []))
        retrieval_terms = [term.lower() for term in agent.get("retrieval_terms", [])]

        scored: list[tuple[float, dict[str, Any]]] = []
        for relationship in relationships:
            statement = relationship.get("statement", "")
            score = 0.0
            if relationship.get("source_entity_key") in candidate_entity_keys:
                score += 2.0
            if relationship.get("target_entity_key") in candidate_entity_keys:
                score += 2.0
            score += sum(0.8 for term in retrieval_terms if term and term in statement.lower())
            score += float(relationship.get("confidence", 0.0) or 0.0)
            if score > 0:
                scored.append((score, relationship))

        scored.sort(key=lambda item: item[0], reverse=True)
        return [relationship for _, relationship in scored[:2]]

    def _build_equipment_note(
        self,
        entity_map: dict[str, dict[str, Any]],
        chunks: list[dict[str, Any]],
        use_equipment_constraints: bool,
    ) -> str:
        if not use_equipment_constraints:
            return ""

        equipment_labels: list[str] = []
        for chunk in chunks:
            for entity_key in chunk.get("entity_keys", []):
                entity = entity_map.get(entity_key)
                if entity and entity.get("entity_type") == "Equipment":
                    label = entity.get("label", "").strip()
                    if label and label not in equipment_labels:
                        equipment_labels.append(label)

        if equipment_labels:
            return f"실험 설계에서는 {', '.join(equipment_labels[:3])} 기준의 장비 제약과 양립하는 조건인지 함께 확인해야 합니다."

        if self._equipment_constraints_text:
            first_line = next((line.strip() for line in self._equipment_constraints_text.splitlines() if line.strip()), "")
            if first_line:
                return f"실험 설계에서는 현재 장비 제약({first_line[:120]})을 벗어나지 않는 범위에서 검증해야 합니다."

        return ""

    def _compose_round_query(self, question: str, follow_up_focus: str) -> str:
        if not follow_up_focus:
            return question
        return f"{question} {follow_up_focus}".strip()

    def _normalize_round_message_payload(
        self,
        payload: dict[str, Any],
        *,
        agent: dict[str, Any],
        chunks: list[dict[str, Any]],
        relationship: dict[str, Any] | None,
    ) -> dict[str, Any]:
        structured_raw = payload.get("structured_output") if isinstance(payload.get("structured_output"), dict) else {}
        message = str(payload.get("message") or payload.get("content") or structured_raw.get("claim") or "").strip()
        evidence_value, evidence_was_present = self._first_present_value(
            structured_raw,
            payload,
            keys=("evidence_ids", "evidenceIds"),
        )
        evidence_ids, rejected_evidence_ids = self._normalize_structured_evidence_ids_with_rejections(evidence_value, chunks)

        claim = str(structured_raw.get("claim") or payload.get("claim") or "").strip()
        uncertainties = self._normalize_text_values(structured_raw.get("uncertainties") or payload.get("uncertainties"))
        reasoning = str(structured_raw.get("reasoning") or payload.get("reasoning") or "").strip()
        experiment_proposal = str(structured_raw.get("experiment_proposal") or structured_raw.get("experimentProposal") or payload.get("experiment_proposal") or payload.get("experimentProposal") or "").strip()
        confidence = str(structured_raw.get("confidence") or payload.get("confidence") or "").strip()

        if not evidence_was_present:
            evidence_ids = [chunk["chunk_id"] for chunk in chunks[:3] if chunk.get("chunk_id")]
        elif rejected_evidence_ids:
            uncertainties.append("일부 근거 ID가 현재 evidence pack에 없어 제거했습니다.")
            removal_note = f"제거된 근거 ID({', '.join(rejected_evidence_ids[:3])})는 현재 evidence pack에 없으므로 인용하지 않습니다."
            reasoning = f"{reasoning} {removal_note}".strip() if reasoning else removal_note

        if evidence_was_present and not evidence_ids:
            gap_note = "현재 evidence pack에서 이 주장에 직접 연결되는 신뢰 가능한 근거 ID를 확정하지 못했습니다."
            if not reasoning:
                reasoning = gap_note
            if not uncertainties:
                uncertainties = ["직접 근거가 약하거나 부재해 후속 검증이 필요합니다."]

        if not claim:
            claim = message.split(".")[0].strip() if message else agent.get("focus", "").strip()
            if not claim and chunks:
                claim = str(chunks[0].get("summary") or chunks[0].get("title") or "").strip()
        if not reasoning:
            if evidence_ids:
                reasoning = "인용된 evidence pack 항목을 바탕으로 주장과 한계를 보수적으로 연결했습니다."
            else:
                reasoning = "현재 evidence pack만으로는 주장을 강하게 뒷받침하기 어려워 근거 한계를 함께 기록했습니다."
        if not uncertainties:
            uncertainties = ["근거 강도는 후속 측정으로 판별해야 합니다."]
        if not experiment_proposal:
            experiment_proposal = relationship.get("statement", "") if relationship else agent.get("next_action_hint", "")
        if not confidence:
            confidence = "medium" if evidence_ids else "low"

        structured: dict[str, Any] = {
            "claim": claim,
            "evidence_ids": evidence_ids,
            "reasoning": reasoning,
            "constraint_risks": self._normalize_text_values(structured_raw.get("constraint_risks") or structured_raw.get("constraintRisks") or payload.get("constraint_risks") or payload.get("constraintRisks")),
            "uncertainties": uncertainties,
            "experiment_proposal": experiment_proposal,
            "confidence": confidence,
            "bo_bridge_note": str(structured_raw.get("bo_bridge_note") or structured_raw.get("boBridgeNote") or payload.get("bo_bridge_note") or payload.get("boBridgeNote") or "").strip(),
        }
        if (agent.get("research_duty") or "").lower().startswith("bo") and not structured["bo_bridge_note"]:
            structured["bo_bridge_note"] = "검증된 constraint와 측정 가능한 objective로 분리한 뒤 BO 후보 변수에 연결해야 합니다."
        structured = {key: value for key, value in structured.items() if value not in (None, "")}
        if not message:
            message = " ".join(
                item
                for item in [structured.get("claim", ""), structured.get("experiment_proposal", "")]
                if isinstance(item, str) and item
            ).strip()
        if not message:
            message = self._engine._compose_message("", agent, chunks, relationship)
        return {"message": message, "structured_output": structured}

    def _build_fallback_structured_output(
        self,
        agent: dict[str, Any],
        chunks: list[dict[str, Any]],
        relationship: dict[str, Any] | None,
        message: str,
    ) -> dict[str, Any]:
        primary_chunk = chunks[0] if chunks else None
        claim = message.split(".")[0].strip() if message else agent.get("focus", "").strip()
        if not claim and primary_chunk:
            claim = str(primary_chunk.get("summary") or primary_chunk.get("title") or "").strip()
        experiment = relationship.get("statement", "") if relationship else agent.get("next_action_hint", "")
        evidence_ids = [chunk["chunk_id"] for chunk in chunks[:3] if chunk.get("chunk_id")]
        structured: dict[str, Any] = {
            "claim": claim,
            "evidence_ids": evidence_ids,
            "reasoning": "인용된 evidence pack 항목을 바탕으로 주장과 한계를 보수적으로 연결했습니다." if evidence_ids else "현재 evidence pack만으로는 주장을 강하게 뒷받침하기 어려워 근거 한계를 함께 기록했습니다.",
            "uncertainties": ["근거 강도는 후속 측정으로 판별해야 합니다."],
            "experiment_proposal": experiment,
            "confidence": "medium" if primary_chunk else "low",
        }
        if (agent.get("research_duty") or "").lower().startswith("bo"):
            structured["bo_bridge_note"] = "검증된 constraint와 측정 가능한 objective로 분리한 뒤 BO 후보 변수에 연결해야 합니다."
        return {key: value for key, value in structured.items() if value}

    @staticmethod
    def _first_present_value(*sources: dict[str, Any], keys: tuple[str, ...]) -> tuple[Any, bool]:
        for source in sources:
            for key in keys:
                if key in source:
                    return source.get(key), True
        return None, False

    @staticmethod
    def _normalize_structured_evidence_ids(value: Any, chunks: list[dict[str, Any]]) -> list[str]:
        normalized, _ = DiscussionService._normalize_structured_evidence_ids_with_rejections(value, chunks)
        return normalized

    @staticmethod
    def _normalize_structured_evidence_ids_with_rejections(value: Any, chunks: list[dict[str, Any]]) -> tuple[list[str], list[str]]:
        if not isinstance(value, list):
            return [], []
        allowed = {str(chunk.get("chunk_id") or "") for chunk in chunks if chunk.get("chunk_id")}
        label_to_id = {f"S{index}": str(chunk.get("chunk_id") or "") for index, chunk in enumerate(chunks, start=1)}
        normalized: list[str] = []
        rejected: list[str] = []
        for item in value:
            candidate = str(item or "").strip().strip("[]")
            evidence_id = candidate if candidate in allowed else label_to_id.get(candidate.upper(), "")
            if evidence_id and evidence_id not in normalized:
                normalized.append(evidence_id)
            elif candidate and candidate not in rejected:
                rejected.append(candidate)
        return normalized[:3], rejected[:5]

    @staticmethod
    def _normalize_text_values(value: Any) -> list[str]:
        if isinstance(value, str):
            value = [value]
        if not isinstance(value, list):
            return []
        normalized: list[str] = []
        for item in value:
            text = str(item or "").strip()
            if text and text not in normalized:
                normalized.append(text)
        return normalized[:3]

    def _build_turn_brief(self, turn: dict[str, Any]) -> dict[str, Any]:
        structured = turn.get("structured_output") if isinstance(turn.get("structured_output"), dict) else {}
        brief = {
            "speaker": turn.get("speaker", ""),
            "role": turn.get("stance") or "specialist",
            "stance": turn.get("stance") or "specialist",
            "agent_id": turn.get("agent_id"),
            "round_num": turn.get("round_num", 1),
            "claim": turn.get("claim") or structured.get("claim") or "",
            "evidence_ids": turn.get("evidence_ids") if "evidence_ids" in turn else structured.get("evidence_ids", []),
            "constraint_risks": turn.get("constraint_risks") or structured.get("constraint_risks") or [],
            "uncertainties": turn.get("uncertainties") or structured.get("uncertainties") or [],
            "experiment_proposal": turn.get("experiment_proposal") or structured.get("experiment_proposal") or "",
            "confidence": turn.get("confidence") or structured.get("confidence") or "",
            "reasoning": structured.get("reasoning") or "",
            "bo_bridge_note": turn.get("bo_bridge_note") or structured.get("bo_bridge_note") or "",
            "references": turn.get("references", []),
        }
        compact_message = " ".join(
            item
            for item in [brief["claim"], brief["experiment_proposal"], "; ".join(brief["uncertainties"][:1])]
            if isinstance(item, str) and item
        ).strip()
        brief["message"] = compact_message or str(turn.get("message") or "")[:260]
        return {
            key: value
            for key, value in brief.items()
            if value not in (None, "") and (value != [] or key == "evidence_ids")
        }

    @staticmethod
    def _to_round_summary_payload(round_num: int, moderator_packet: dict[str, Any]) -> dict[str, Any]:
        return {
            "round_num": round_num,
            "summary": moderator_packet.get("summary") or moderator_packet.get("content") or "",
            "consensus": moderator_packet.get("consensus", []),
            "disagreements": moderator_packet.get("disagreements", []),
            "gaps": moderator_packet.get("gaps", []),
            "already_stated": moderator_packet.get("already_stated", []),
        }

    @staticmethod
    def _build_research_context(
        *,
        selected_agents: list[dict[str, Any]],
        total_rounds: int,
        evidence: list[dict[str, Any]],
        rendered_turns: list[dict[str, Any]],
        turn_briefs: list[dict[str, Any]],
        round_summaries: list[dict[str, Any]],
    ) -> dict[str, Any]:
        context_budget = {
            "agent_count": len(selected_agents),
            "round_count": total_rounds,
            "evidence_count": len(evidence),
            "raw_turn_count": len(rendered_turns),
            "compacted_turn_count": len(turn_briefs),
            "round_summary_count": len(round_summaries),
        }
        return {
            "context_budget": context_budget,
            "turn_briefs": turn_briefs[-24:],
            "round_summaries": round_summaries,
        }

    def _build_moderator_packet(
        self,
        question: str,
        round_context: list[dict[str, Any]],
        relationships: list[dict[str, Any]],
        panel_agents: list[dict[str, Any]] | None = None,
        *,
        use_llm: bool = True,
    ) -> dict[str, Any]:
        if use_llm and self._llm is not None and panel_agents:
            llm_packet = self._llm.build_moderator_packet(
                question=question,
                round_context=round_context,
                panel_agents=panel_agents,
            )
            if llm_packet is not None:
                return llm_packet

        speakers = [turn["speaker"] for turn in round_context if turn.get("speaker")]
        references = [reference for turn in round_context for reference in turn.get("references", [])]
        stances = [turn.get("stance") for turn in round_context if turn.get("stance")]
        consensus_reference = references[0] if references else "현재 evidence set"
        gap_reference = relationships[0]["statement"] if relationships else "우선 관계 가설"
        consensus = f"직전 라운드에서는 {consensus_reference}를 중심으로 핵심 변수가 다시 언급되었습니다."
        gap = f"아직 {gap_reference}를 독립 변수로 분리한 검증 관점은 충분히 정리되지 않았습니다."
        speaker_list = ", ".join(dict.fromkeys(speakers[:3])) if speakers else "패널"
        content = f"{speaker_list}의 직전 응답을 비교한 결과, {consensus} {gap} 이번 라운드에서는 각 전문가가 새로운 근거 또는 반박 포인트를 하나씩 더 제시해야 합니다."
        follow_up_by_agent: dict[str, str] = {}
        for index, turn in enumerate(round_context):
            agent_id = turn.get("agent_id")
            if not agent_id:
                continue
            paired_reference = references[index % len(references)] if references else question
            paired_stance = stances[index % len(stances)] if stances else "현재 관점"
            follow_up_by_agent[agent_id] = f"{paired_reference}와 연결된 {paired_stance} 관점의 미검증 조건을 더 분리해 설명하세요"
        return {
            "content": content,
            "summary": content,
            "consensus": [consensus],
            "disagreements": [gap],
            "gaps": [gap_reference],
            "already_stated": [],
            "follow_up_by_agent": follow_up_by_agent,
        }

    def _compose_round_message(
        self,
        *,
        question: str,
        agent: dict[str, Any],
        chunks: list[dict[str, Any]],
        relationship: dict[str, Any] | None,
        round_context: list[dict[str, Any]],
        round_num: int,
        use_web_search: bool,
        equipment_note: str,
        follow_up_focus: str,
        panel_agents: list[dict[str, Any]] | None = None,
        moderator_packet: dict[str, Any] | None = None,
        use_llm: bool = True,
    ) -> dict[str, Any]:
        if use_llm and self._llm is not None and panel_agents:
            llm_message = self._llm.compose_round_message(
                question=question,
                agent=agent,
                chunks=chunks,
                relationship=relationship,
                round_context=round_context,
                round_num=round_num,
                follow_up_focus=follow_up_focus,
                equipment_note=equipment_note,
                panel_agents=panel_agents,
                moderator_packet=moderator_packet,
            )
            if llm_message is not None:
                return self._normalize_round_message_payload(llm_message, agent=agent, chunks=chunks, relationship=relationship)

        if round_num == 1:
            base_message = self._engine._compose_message(question, agent, chunks, relationship)
        else:
            base_message = self._compose_follow_up_message(agent, chunks, relationship, round_context, round_num)

        follow_up_clause = f" 이번 라운드에서는 특히 {follow_up_focus}에 집중해 응답했습니다." if follow_up_focus else ""
        source_names = [chunk.get("source", "") for chunk in chunks if chunk.get("source")]
        distinct_sources = list(dict.fromkeys(source_names))
        cross_source_note = ""
        if use_web_search and len(distinct_sources) > 1:
            cross_source_note = f" 추가로 {', '.join(distinct_sources[:2])}처럼 서로 다른 source에서도 같은 방향의 근거를 교차 확인했습니다."

        equipment_clause = f" {equipment_note}" if equipment_note else ""
        message = f"{base_message}{follow_up_clause}{cross_source_note}{equipment_clause}".strip()
        structured_output = self._build_fallback_structured_output(agent, chunks, relationship, message)
        if equipment_note:
            structured_output["constraint_risks"] = [equipment_note]
        return {"message": message, "structured_output": structured_output}

    def _compose_follow_up_message(
        self,
        agent: dict[str, Any],
        chunks: list[dict[str, Any]],
        relationship: dict[str, Any] | None,
        round_context: list[dict[str, Any]],
        round_num: int,
    ) -> str:
        primary_chunk = chunks[0] if chunks else None
        secondary_chunk = chunks[1] if len(chunks) > 1 else None
        reference_turn = round_context[(round_num + len(round_context)) % len(round_context)] if round_context else None
        evidence_clause = primary_chunk["excerpt"] if primary_chunk else agent["focus"]
        support_clause = secondary_chunk["summary"] if secondary_chunk else agent.get("expertise") or agent["focus"]
        relationship_clause = relationship["statement"] if relationship else agent["next_action_hint"]
        if reference_turn is None:
            return f"추가 검토 라운드에서는 {evidence_clause} 이를 바탕으로 {relationship_clause}를 다시 점검해야 합니다."
        return (
            f"{reference_turn['speaker']}의 앞선 관점을 이어 보면 {evidence_clause} 또한 {support_clause} 따라서 {relationship_clause}를 독립 변수로 다시 확인하는 후속 검증이 필요합니다."
        ).strip()

    def _synthesize_discussion(
        self,
        *,
        project: dict[str, Any],
        question: str,
        turns: list[dict[str, Any]],
        evidence: list[dict[str, Any]],
        relationships: list[dict[str, Any]],
        use_web_search: bool,
        use_equipment_constraints: bool,
        entity_map: dict[str, dict[str, Any]],
        validated_constraints: list[ValidatedConstraint],
        selected_hypothesis: dict[str, Any] | None,
        hypothesis_rankings: list[dict[str, Any]],
        validations: list[dict[str, Any]],
        use_llm: bool = True,
    ) -> dict[str, Any] | None:
        if not use_llm or self._llm is None or not turns:
            return None

        cache_key = (project.get("project_id", ""), question.strip())
        if cache_key in self._synthesis_cache:
            return self._synthesis_cache[cache_key]

        llm_synthesis = self._llm.synthesize_discussion(
            project=project,
            question=question,
            turns=turns,
            evidence=evidence,
            relationships=relationships,
            recommended_actions=project.get("recommended_actions", []),
            constraint_note=self._build_constraint_note(entity_map, evidence[:3], use_equipment_constraints, validated_constraints),
            selected_hypothesis=selected_hypothesis,
            hypothesis_rankings=hypothesis_rankings,
            validations=validations,
        )
        if llm_synthesis is None:
            self._synthesis_cache[cache_key] = None
            return None

        equipment_note = self._build_constraint_note(entity_map, evidence[:3], use_equipment_constraints, validated_constraints)
        if equipment_note and not any(equipment_note[:24] in action for action in llm_synthesis["next_actions"]):
            llm_synthesis["next_actions"] = [*llm_synthesis["next_actions"], equipment_note.replace("실험 설계에서는 ", "").replace(" 함께 확인해야 합니다.", "를 다음 실험 설계 체크리스트에 반영합니다.")][:4]

        if use_web_search:
            source_count = len({item.get("source", "") for item in evidence if item.get("source")})
            if source_count < 2 and not any("외부 문헌" in item or "source" in item for item in llm_synthesis["open_questions"]):
                llm_synthesis["open_questions"] = [*llm_synthesis["open_questions"], "현재 가설이 외부 문헌이나 다른 source에서도 같은 방향으로 반복 확인되는가?"][:4]

        self._synthesis_cache[cache_key] = llm_synthesis
        return llm_synthesis

    def _compose_summary(
        self,
        project: dict[str, Any],
        question: str,
        turns: list[dict[str, Any]],
        evidence: list[dict[str, Any]],
        relationships: list[dict[str, Any]],
        use_web_search: bool,
        use_equipment_constraints: bool,
        entity_map: dict[str, dict[str, Any]],
        validated_constraints: list[ValidatedConstraint],
        selected_hypothesis: dict[str, Any] | None,
        hypothesis_rankings: list[dict[str, Any]],
        validations: list[dict[str, Any]],
        *,
        use_llm: bool = True,
    ) -> str:
        synthesis = self._synthesize_discussion(
            project=project,
            question=question,
            turns=turns,
            evidence=evidence,
            relationships=relationships,
            use_web_search=use_web_search,
            use_equipment_constraints=use_equipment_constraints,
            entity_map=entity_map,
            validated_constraints=validated_constraints,
            selected_hypothesis=selected_hypothesis,
            hypothesis_rankings=hypothesis_rankings,
            validations=validations,
            use_llm=use_llm,
        )
        if synthesis is not None:
            return synthesis["summary"]

        base_summary = self._engine._compose_summary(project, turns)
        evidence_titles = [item.get("title", "") for item in evidence[:2] if item.get("title")]
        evidence_clause = f" 핵심 근거는 {', '.join(evidence_titles)}에서 반복적으로 관찰됩니다." if evidence_titles else ""
        source_count = len({item.get('source', '') for item in evidence if item.get('source')})
        source_clause = ""
        if use_web_search and source_count > 1:
            source_clause = f" 서로 다른 {source_count}개 source를 교차해 같은 방향의 신호를 비교했습니다."
        hypothesis_clause = ""
        if selected_hypothesis is not None:
            top_risk = next(
                (item.get("risk_note", "") for item in hypothesis_rankings if item.get("hypothesis_id") == selected_hypothesis.get("hypothesis_id")),
                "",
            )
            hypothesis_clause = (
                f" 현재 가장 강한 가설은 {selected_hypothesis.get('title', '')}이며, "
                f"{selected_hypothesis.get('statement', '')}를 중심으로 토론이 수렴했습니다."
            )
            if top_risk:
                hypothesis_clause += f" 다만 {top_risk}"
        equipment_note = self._build_constraint_note(entity_map, evidence[:3], use_equipment_constraints, validated_constraints)
        equipment_clause = f" {equipment_note}" if equipment_note else ""
        return f"{base_summary}{evidence_clause}{source_clause}{hypothesis_clause}{equipment_clause}".strip()

    def _compose_next_actions(
        self,
        project: dict[str, Any],
        question: str,
        turns: list[dict[str, Any]],
        evidence: list[dict[str, Any]],
        relationships: list[dict[str, Any]],
        use_web_search: bool,
        use_equipment_constraints: bool,
        entity_map: dict[str, dict[str, Any]],
        validated_constraints: list[ValidatedConstraint],
        selected_hypothesis: dict[str, Any] | None,
        hypothesis_rankings: list[dict[str, Any]],
        validations: list[dict[str, Any]],
        *,
        use_llm: bool = True,
    ) -> list[str]:
        synthesis = self._synthesize_discussion(
            project=project,
            question=question,
            turns=turns,
            evidence=evidence,
            relationships=relationships,
            use_web_search=use_web_search,
            use_equipment_constraints=use_equipment_constraints,
            entity_map=entity_map,
            validated_constraints=validated_constraints,
            selected_hypothesis=selected_hypothesis,
            hypothesis_rankings=hypothesis_rankings,
            validations=validations,
            use_llm=use_llm,
        )
        if synthesis is not None:
            return synthesis["next_actions"]

        actions = list(project.get("recommended_actions", []))
        if selected_hypothesis is not None:
            actions.insert(
                0,
                selected_hypothesis.get("proposed_experiment") or f"{selected_hypothesis.get('title', '선택 가설')}의 판별 실험을 우선 설계합니다.",
            )
        validation_tests = [item.get("key_test", "") for item in validations if item.get("key_test")]
        actions.extend(validation_tests[:2])
        actions.extend(
            f"{turn['speaker']} 관점에서 제시한 근거와 조건을 다음 검증 라운드 표에 정리합니다."
            for turn in turns[:2]
        )

        source_count = len({item.get('source', '') for item in evidence if item.get('source')})
        if use_web_search:
            if source_count >= 2:
                actions.append("서로 다른 source에서 일치한 조건과 충돌한 조건을 분리해 비교표로 정리합니다.")
            else:
                actions.append("추가 문헌 또는 새 업로드 자료로 현재 가설이 다른 source에서도 반복되는지 확인합니다.")

        equipment_note = self._build_constraint_note(entity_map, evidence[:3], use_equipment_constraints, validated_constraints)
        if equipment_note:
            actions.append(equipment_note.replace("실험 설계에서는 ", "").replace(" 함께 확인해야 합니다.", "를 다음 실험 설계 체크리스트에 반영합니다."))

        deduped: list[str] = []
        for action in actions:
            if action and action not in deduped:
                deduped.append(action)
        return deduped[:4]

    def _compose_open_questions(
        self,
        project: dict[str, Any],
        question: str,
        evidence: list[dict[str, Any]],
        relationships: list[dict[str, Any]],
        turns: list[dict[str, Any]],
        use_web_search: bool,
        use_equipment_constraints: bool,
        entity_map: dict[str, dict[str, Any]],
        validated_constraints: list[ValidatedConstraint],
        selected_hypothesis: dict[str, Any] | None,
        validations: list[dict[str, Any]],
        *,
        use_llm: bool = True,
    ) -> list[str]:
        synthesis = self._synthesize_discussion(
            project=project,
            question=question,
            turns=turns,
            evidence=evidence,
            relationships=relationships,
            use_web_search=use_web_search,
            use_equipment_constraints=use_equipment_constraints,
            entity_map=entity_map,
            validated_constraints=validated_constraints,
            selected_hypothesis=selected_hypothesis,
            hypothesis_rankings=[],
            validations=validations,
            use_llm=use_llm,
        )
        if synthesis is not None:
            return synthesis["open_questions"]

        questions = self._engine._compose_open_questions(evidence, relationships)
        if selected_hypothesis is not None:
            challenge_points = [item.get("reasoning", "") for item in validations if item.get("verdict") == "challenge"]
            if challenge_points:
                questions.insert(0, f"선택 가설 {selected_hypothesis.get('title', '')}에서 가장 큰 반박 포인트를 어떤 측정으로 해소할 수 있는가?")
        if use_web_search:
            source_count = len({item.get('source', '') for item in evidence if item.get('source')})
            if source_count < 2:
                questions.append("현재 가설이 외부 문헌이나 다른 source에서도 같은 방향으로 반복 확인되는가?")
        if turns:
            questions.append(f"{turns[-1]['speaker']}가 제안한 후속 검증이 실제 공정 변수 분리에 충분한가?")

        deduped: list[str] = []
        for question in questions:
            if question and question not in deduped:
                deduped.append(question)
        return deduped[:4]

    def _build_discussion_record(
        self,
        *,
        project_id: str,
        project_name: str,
        question: str,
        selected_agents: list[dict[str, Any]],
        hypotheses: list[dict[str, Any]],
        validations: list[dict[str, Any]],
        hypothesis_rankings: list[dict[str, Any]],
        selected_hypothesis_id: str | None,
        constraint_candidates: list[ConstraintCandidate],
        validated_constraints: list[ValidatedConstraint],
        constraint_review_state: ConstraintReviewState,
        new_constraint_suggestions: list[ConstraintCandidate],
        turns: list[dict[str, Any]],
        evidence: list[dict[str, Any]],
        graph: dict[str, Any],
        summary: str,
        next_actions: list[str],
        open_questions: list[str],
    ) -> Discussion:
        now = datetime.now(timezone.utc)
        return Discussion(
            discussion_id=f"disc-{uuid4().hex[:12]}",
            project_id=project_id,
            title=f"{project_name} discussion",
            question=question,
            module_mode="real",
            stage="summary",
            summary=summary,
            agents=[
                AgentPerspective(
                    agent_id=agent["agent_id"],
                    role=agent["name"],
                    stance=agent["stance"],
                    focus=agent["focus"],
                    evidence_focus=agent.get("evidence_focus", []),
                    knowledge_scope=agent.get("knowledge_scope", []),
                    retrieval_terms=agent.get("retrieval_terms", []),
                )
                for agent in selected_agents
            ],
            hypotheses=[HypothesisCandidate.model_validate(item) for item in hypotheses],
            validations=[HypothesisValidation.model_validate(item) for item in validations],
            hypothesis_rankings=[HypothesisRanking.model_validate(item) for item in hypothesis_rankings],
            constraint_candidates=constraint_candidates,
            validated_constraints=validated_constraints,
            constraint_review_state=constraint_review_state,
            new_constraint_suggestions=new_constraint_suggestions,
            selected_hypothesis_id=selected_hypothesis_id,
            turns=[
                DiscussionTurn(
                    speaker=turn["speaker"],
                    message=turn["message"],
                    references=turn.get("references", []),
                    stance=turn.get("stance"),
                    agent_id=turn.get("agent_id"),
                    evidence_ids=turn.get("evidence_ids", []),
                    claim=turn.get("claim"),
                    constraint_risks=turn.get("constraint_risks", []),
                    uncertainties=turn.get("uncertainties", []),
                    experiment_proposal=turn.get("experiment_proposal"),
                    confidence=turn.get("confidence"),
                    bo_bridge_note=turn.get("bo_bridge_note"),
                    structured_output=turn.get("structured_output", {}),
                    turn_brief=turn.get("turn_brief", {}),
                )
                for turn in turns
            ],
            next_actions=next_actions,
            evidence=[
                EvidenceItem(
                    evidence_id=item["chunk_id"],
                    title=item["title"],
                    source=item["source"],
                    year=item["year"],
                    summary=item["summary"],
                    excerpt=item["excerpt"],
                    entity_keys=item.get("entity_keys", []),
                )
                for item in evidence
            ],
            graph=GraphPayload(
                nodes=[
                    GraphNode(
                        node_id=node["node_id"],
                        label=node["label"],
                        node_type=node["node_type"],
                        summary=node["summary"],
                    )
                    for node in graph["nodes"]
                ],
                edges=[
                    GraphEdge(
                        edge_id=edge["edge_id"],
                        source_node_id=edge["source_node_id"],
                        target_node_id=edge["target_node_id"],
                        relationship_type=edge["relationship_type"],
                        statement=edge["statement"],
                    )
                    for edge in graph["edges"]
                ],
            ),
            open_questions=open_questions,
            created_at=now,
        )

    @staticmethod
    def _compose_hypothesis_exploration_summary(
        goal: str,
        selected_hypothesis: dict[str, Any] | None,
        rankings: list[dict[str, Any]],
        validations: list[dict[str, Any]],
    ) -> str:
        if selected_hypothesis is None:
            return f"No hypothesis was selected for: {goal}"
        support_count = sum(1 for item in validations if item.get("verdict") == "support")
        challenge_count = sum(1 for item in validations if item.get("verdict") == "challenge")
        top_ranking = next(
            (item for item in rankings if item.get("hypothesis_id") == selected_hypothesis.get("hypothesis_id")),
            rankings[0] if rankings else {},
        )
        score = top_ranking.get("plausibility_score", "n/a")
        return (
            f"Creative hypothesis exploration selected '{selected_hypothesis.get('title', '')}' "
            f"for the goal '{goal}'. The agent panel produced {support_count} support reviews and "
            f"{challenge_count} challenges; top plausibility score is {score}."
        )

    @staticmethod
    def _compose_hypothesis_exploration_actions(
        selected_hypothesis: dict[str, Any] | None,
        validations: list[dict[str, Any]],
    ) -> list[str]:
        actions: list[str] = []
        if selected_hypothesis is not None:
            experiment = selected_hypothesis.get("proposed_experiment") or selected_hypothesis.get("statement")
            if experiment:
                actions.append(str(experiment))
        for validation in validations:
            key_test = validation.get("key_test")
            if key_test and key_test not in actions:
                actions.append(str(key_test))
            if len(actions) >= 4:
                break
        return actions[:4] or ["Design one discriminating experiment for the highest-ranked hypothesis."]

    @staticmethod
    def _compose_hypothesis_exploration_questions(
        selected_hypothesis: dict[str, Any] | None,
        validations: list[dict[str, Any]],
    ) -> list[str]:
        questions: list[str] = []
        if selected_hypothesis is not None:
            questions.append(f"What measurement would falsify '{selected_hypothesis.get('title', 'the selected hypothesis')}' first?")
        for validation in validations:
            if validation.get("verdict") == "challenge" and validation.get("reasoning"):
                questions.append(str(validation["reasoning"]))
            if len(questions) >= 4:
                break
        return questions[:4] or ["Which assumption has the weakest current evidence?"]

    def _collect_hypothesis_seed_evidence(
        self,
        *,
        question: str,
        chunks: list[dict[str, Any]],
        selected_agents: list[dict[str, Any]],
        seen_chunk_ids_by_agent: dict[str, set[str]],
        seen_chunk_ids_by_panel: set[str],
        use_web_search: bool,
    ) -> list[dict[str, Any]]:
        collected: list[dict[str, Any]] = []
        seen_local: set[str] = set()
        for agent in selected_agents[: min(3, len(selected_agents))]:
            ranked = self._rank_chunks(
                question,
                chunks,
                agent,
                [],
                seen_chunk_ids=seen_chunk_ids_by_agent[agent["agent_id"]],
                panel_seen_chunk_ids=seen_chunk_ids_by_panel,
                use_web_search=use_web_search,
            )
            for chunk in ranked:
                chunk_id = chunk.get("chunk_id")
                if not chunk_id or chunk_id in seen_local:
                    continue
                seen_local.add(chunk_id)
                collected.append(chunk)
                if len(collected) >= 6:
                    return collected
        return collected[:6]

    def _generate_hypotheses(
        self,
        question: str,
        project: dict[str, Any],
        evidence: list[dict[str, Any]],
        selected_agents: list[dict[str, Any]],
        num_candidates: int = 3,
        *,
        use_llm: bool = True,
    ) -> list[dict[str, Any]]:
        if use_llm and self._llm is not None:
            llm_candidates = self._llm.generate_hypothesis_candidates(
                question=question,
                project=project,
                evidence=evidence,
                panel_agents=selected_agents,
                num_candidates=num_candidates,
            )
            if llm_candidates:
                return llm_candidates
        fallback_evidence_ids = [item.get("chunk_id") for item in evidence[:3] if item.get("chunk_id")]
        base_statement = question if question.endswith("?") else f"{question}?"
        return [
            {
                "hypothesis_id": "hyp-1",
                "title": "주요 메커니즘 가설",
                "statement": f"핵심 성능 변화는 우선적으로 {base_statement}와 직접 연결된 주 메커니즘 변화로 설명될 수 있다.",
                "rationale": "현재 선택된 evidence에서 가장 반복적으로 등장하는 변수와 메커니즘을 먼저 검증하는 것이 타당하다.",
                "proposed_experiment": "가장 강하게 언급된 변수 하나만 고정 스윕하고 구조·조성·성능 지표를 같은 조건에서 동시 비교한다.",
                "source_evidence_ids": fallback_evidence_ids,
            },
            {
                "hypothesis_id": "hyp-2",
                "title": "표면·계면 경쟁 가설",
                "statement": f"관찰된 결과는 bulk 효과보다 surface/interface condition 차이가 더 크게 좌우할 수 있다.",
                "rationale": "초기 성장, 결함, adhesion, termination 같은 표면 조건은 같은 공정 변수에서도 상반된 결과를 만들 수 있다.",
                "proposed_experiment": "동일 공정 변수에서 pretreatment 또는 substrate condition만 바꿔 상대 기여를 분리한다.",
                "source_evidence_ids": fallback_evidence_ids,
            },
            {
                "hypothesis_id": "hyp-3",
                "title": "측정 해석 분리 가설",
                "statement": "현재 신호 일부는 순수 메커니즘 변화가 아니라 measurement artifact 또는 proxy mismatch를 포함할 수 있다.",
                "rationale": "같은 현상을 서로 다른 proxy로 읽을 때 plasma, spectroscopy, morphology 해석이 어긋날 수 있다.",
                "proposed_experiment": "서로 다른 measurement modality를 같은 sample grid에 매핑해 proxy mismatch 여부를 분리한다.",
                "source_evidence_ids": fallback_evidence_ids,
            },
        ]

    def _validate_hypothesis(
        self,
        question: str,
        hypothesis: dict[str, Any],
        agent: dict[str, Any],
        chunks: list[dict[str, Any]],
        *,
        use_llm: bool = True,
    ) -> dict[str, Any]:
        if use_llm and self._llm is not None:
            llm_validation = self._llm.validate_hypothesis_candidate(
                question=question,
                hypothesis=hypothesis,
                agent=agent,
                chunks=chunks,
            )
            if llm_validation is not None:
                return llm_validation
        verdict = "mixed"
        if chunks and any(term.lower() in (chunks[0].get("summary", "") + " " + chunks[0].get("excerpt", "")).lower() for term in agent.get("retrieval_terms", [])[:3]):
            verdict = "support"
        return {
            "hypothesis_id": hypothesis.get("hypothesis_id"),
            "agent_id": agent["agent_id"],
            "agent_name": agent["name"],
            "verdict": verdict,
            "reasoning": f"{agent['name']} 관점에서는 이 가설이 일부 근거와 맞지만, 자신의 전문 영역에서 분리 측정이 더 필요합니다.",
            "confidence": "medium",
            "evidence_ids": [chunk.get("chunk_id") for chunk in chunks if chunk.get("chunk_id")],
            "key_test": hypothesis.get("proposed_experiment") or "판별 실험을 추가 설계해야 합니다.",
        }

    def _rank_hypotheses(
        self,
        question: str,
        project: dict[str, Any],
        hypotheses: list[dict[str, Any]],
        validations: list[dict[str, Any]],
        *,
        use_llm: bool = True,
    ) -> dict[str, Any]:
        if use_llm and self._llm is not None:
            llm_ranking = self._llm.rank_hypothesis_candidates(
                question=question,
                project=project,
                candidates=hypotheses,
                validations=validations,
            )
            if llm_ranking is not None:
                return {
                    "selected_hypothesis_id": llm_ranking["selected_hypothesis_id"],
                    "rankings": llm_ranking["ranked_candidates"],
                }
        scored: list[tuple[float, dict[str, Any]]] = []
        for hypothesis in hypotheses:
            related = [item for item in validations if item.get("hypothesis_id") == hypothesis.get("hypothesis_id")]
            support_count = sum(1 for item in related if item.get("verdict") == "support")
            mixed_count = sum(1 for item in related if item.get("verdict") == "mixed")
            challenge_count = sum(1 for item in related if item.get("verdict") == "challenge")
            score = support_count * 1.0 + mixed_count * 0.5 - challenge_count * 0.35
            scored.append((score, hypothesis))
        scored.sort(key=lambda item: item[0], reverse=True)
        rankings: list[dict[str, Any]] = []
        for index, (score, hypothesis) in enumerate(scored, start=1):
            normalized = max(0.0, min(1.0, 0.45 + score * 0.15))
            rankings.append(
                {
                    "hypothesis_id": hypothesis["hypothesis_id"],
                    "rank": index,
                    "plausibility_score": round(normalized, 2),
                    "feasibility_score": round(min(1.0, normalized + 0.08), 2),
                    "evidence_score": round(normalized, 2),
                    "novelty_score": round(max(0.2, 0.75 - (index - 1) * 0.1), 2),
                    "recommendation": "우선 검증 후보로 유지" if index == 1 else "보조 가설로 비교 검증",
                    "summary": hypothesis.get("rationale") or hypothesis.get("statement") or "",
                    "risk_note": "전문가 간 이견과 proxy mismatch 가능성을 함께 확인해야 합니다.",
                }
            )
        return {
            "selected_hypothesis_id": rankings[0]["hypothesis_id"] if rankings else None,
            "rankings": rankings,
        }

    @staticmethod
    def _compose_hypothesis_query(question: str, hypothesis: dict[str, Any]) -> str:
        return f"{question} {hypothesis.get('statement', '')} {hypothesis.get('rationale', '')}".strip()

    @staticmethod
    def _compose_question_with_selected_hypothesis(question: str, selected_hypothesis: dict[str, Any] | None) -> str:
        if not selected_hypothesis:
            return question
        return (
            f"{question}\n\n"
            f"Selected hypothesis: {selected_hypothesis.get('title', '')}\n"
            f"Statement: {selected_hypothesis.get('statement', '')}\n"
            f"Proposed experiment: {selected_hypothesis.get('proposed_experiment', '')}"
        ).strip()

    @staticmethod
    def _to_hypothesis_payload(item: dict[str, Any]) -> dict[str, Any]:
        return {
            "hypothesis_id": item.get("hypothesis_id"),
            "title": item.get("title", ""),
            "family": item.get("family", "mechanistic"),
            "triz_principle": item.get("triz_principle"),
            "statement": item.get("statement", ""),
            "rationale": item.get("rationale", ""),
            "proposed_experiment": item.get("proposed_experiment", ""),
            "analogy_source": item.get("analogy_source"),
            "source_evidence_ids": item.get("source_evidence_ids", []),
        }

    @staticmethod
    def _to_hypothesis_validation_payload(item: dict[str, Any]) -> dict[str, Any]:
        return {
            "hypothesis_id": item.get("hypothesis_id"),
            "agent_id": item.get("agent_id"),
            "agent_name": item.get("agent_name", ""),
            "verdict": item.get("verdict", "mixed"),
            "reasoning": item.get("reasoning", ""),
            "confidence": item.get("confidence", "medium"),
            "evidence_ids": item.get("evidence_ids", []),
            "key_test": item.get("key_test", ""),
            "validation_pass": item.get("validation_pass", 1),
        }

    @staticmethod
    def _to_hypothesis_ranking_payload(item: dict[str, Any]) -> dict[str, Any]:
        return {
            "hypothesis_id": item.get("hypothesis_id"),
            "rank": item.get("rank", 0),
            "plausibility_score": item.get("plausibility_score", 0.0),
            "feasibility_score": item.get("feasibility_score", 0.0),
            "evidence_score": item.get("evidence_score", 0.0),
            "novelty_score": item.get("novelty_score", 0.0),
            "recommendation": item.get("recommendation", ""),
            "summary": item.get("summary", ""),
            "risk_note": item.get("risk_note", ""),
        }

    @staticmethod
    def _to_source_chunk_payload(chunk: dict[str, Any]) -> dict[str, Any]:
        return {
            "chunk_id": chunk["chunk_id"],
            "document_name": chunk["source"],
            "section_title": chunk["title"],
            "content_preview": chunk["excerpt"],
        }

    @staticmethod
    def _to_agent_payload(agent: dict[str, Any]) -> dict[str, Any]:
        return {
            "name": agent["name"],
            "expertise": agent.get("expertise") or agent["focus"],
            "perspective": agent.get("perspective") or agent["focus"],
            "research_duty": agent.get("research_duty", ""),
            "community_id": agent.get("community_id") or "seed-community",
        }

    @staticmethod
    def _to_agent_summary_payload(agent: dict[str, Any]) -> dict[str, Any]:
        return {
            "agent_id": agent["agent_id"],
            "role": agent["name"],
            "stance": agent["stance"],
            "focus": agent["focus"],
            "evidence_focus": agent.get("evidence_focus", []),
            "knowledge_scope": agent.get("knowledge_scope", []),
            "retrieval_terms": agent.get("retrieval_terms", []),
            "research_duty": agent.get("research_duty", ""),
        }

    @staticmethod
    def _to_evidence_payload(item: dict[str, Any]) -> dict[str, Any]:
        return {
            "evidence_id": item["chunk_id"],
            "title": item["title"],
            "source": item["source"],
            "year": item["year"],
            "summary": item["summary"],
            "excerpt": item["excerpt"],
            "entity_keys": item.get("entity_keys", []),
        }


service = DiscussionService()
