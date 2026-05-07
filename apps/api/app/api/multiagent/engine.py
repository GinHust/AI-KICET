from __future__ import annotations

from typing import Any

from app.api.multiagent.embedding_store import EmbeddingStore


class DiscussionEngine:
    def __init__(self, embedding_store: EmbeddingStore) -> None:
        self._embedding_store = embedding_store

    def build_discussion(
        self,
        question: str,
        project: dict[str, Any],
        agents: list[dict[str, Any]],
        chunks: list[dict[str, Any]],
        entities: list[dict[str, Any]],
        relationships: list[dict[str, Any]],
    ) -> dict[str, Any]:
        prepared_agents = agents[:4]
        turns: list[dict[str, Any]] = []
        evidence_by_id: dict[str, dict[str, Any]] = {}
        selected_relationships: list[dict[str, Any]] = []

        for agent in prepared_agents:
            ranked_chunks = self._embedding_store.rank_chunks(question, chunks, agent.get("retrieval_terms", []))[:2]
            relationship = self._pick_relationship(agent, relationships)
            if relationship is not None:
                selected_relationships.append(relationship)
            for chunk in ranked_chunks:
                evidence_by_id[chunk["chunk_id"]] = chunk
            turns.append(
                {
                    "speaker": agent["name"],
                    "stance": agent["stance"],
                    "agent_id": agent["agent_id"],
                    "message": self._compose_message(question, agent, ranked_chunks, relationship),
                    "references": [chunk["title"] for chunk in ranked_chunks],
                    "evidence_ids": [chunk["chunk_id"] for chunk in ranked_chunks],
                }
            )

        evidence = list(evidence_by_id.values())
        graph = self._build_graph(entities, selected_relationships, evidence)
        summary = self._compose_summary(project, turns)
        next_actions = self._compose_next_actions(project, turns)
        open_questions = self._compose_open_questions(evidence, relationships)

        return {
            "summary": summary,
            "turns": turns,
            "next_actions": next_actions,
            "references": [item["title"] for item in evidence[:4]],
            "evidence": evidence,
            "graph": graph,
            "open_questions": open_questions,
        }

    def _pick_relationship(self, agent: dict[str, Any], relationships: list[dict[str, Any]]) -> dict[str, Any] | None:
        for relationship in relationships:
            if any(term.lower() in relationship["statement"].lower() for term in agent.get("retrieval_terms", [])):
                return relationship
        return relationships[0] if relationships else None

    def _compose_message(
        self,
        question: str,
        agent: dict[str, Any],
        chunks: list[dict[str, Any]],
        relationship: dict[str, Any] | None,
    ) -> str:
        primary_chunk = chunks[0] if chunks else None
        secondary_chunk = chunks[1] if len(chunks) > 1 else None
        evidence_clause = primary_chunk["summary"] if primary_chunk else f"질문 '{question}'에 대한 직접 근거가 부족해 현재 knowledge seed를 기준으로 판단합니다."
        support_clause = secondary_chunk["excerpt"] if secondary_chunk else agent["focus"]
        relationship_clause = relationship["statement"] if relationship else agent["next_action_hint"]
        return f"{evidence_clause} 또한 {support_clause} 이를 종합하면 {relationship_clause}".strip()

    def _compose_summary(self, project: dict[str, Any], turns: list[dict[str, Any]]) -> str:
        top_turn = turns[1]["message"] if len(turns) > 1 else turns[0]["message"]
        keywords = project.get("keywords", [])[:3]
        focus = ", ".join(keywords) if keywords else project.get("objective", project["name"])
        return f"{project['name']} 기준으로는 {focus} 축의 근거를 먼저 교차 검증하는 것이 가장 설득력 있습니다. {top_turn}"

    def _compose_next_actions(self, project: dict[str, Any], turns: list[dict[str, Any]]) -> list[str]:
        project_actions = project.get("recommended_actions", [])
        agent_actions = [f"{turn['speaker']} 관점의 근거를 다음 검토 라운드에 반영합니다." for turn in turns[:2]]
        return (project_actions + agent_actions)[:4]

    def _compose_open_questions(self, evidence: list[dict[str, Any]], relationships: list[dict[str, Any]]) -> list[str]:
        first_evidence = evidence[0]["title"] if evidence else "현재 evidence set"
        first_relationship = relationships[0]["statement"] if relationships else "우선 관계 가설"
        return [
            f"{first_evidence}의 결론이 다른 source chunk에서도 반복 확인되는가?",
            f"{first_relationship}를 독립 변수로 분리해 다시 검토해야 하는가?",
        ]

    def _build_graph(
        self,
        entities: list[dict[str, Any]],
        relationships: list[dict[str, Any]],
        evidence: list[dict[str, Any]],
    ) -> dict[str, Any]:
        entity_map = {entity["entity_key"]: entity for entity in entities}
        referenced_entity_keys = {
            entity_key
            for chunk in evidence
            for entity_key in chunk.get("entity_keys", [])
            if entity_key in entity_map
        }
        relationship_entity_keys = {
            relationship["source_entity_key"]
            for relationship in relationships
            if relationship["source_entity_key"] in entity_map
        } | {
            relationship["target_entity_key"]
            for relationship in relationships
            if relationship["target_entity_key"] in entity_map
        }
        graph_entity_keys = list(dict.fromkeys([*referenced_entity_keys, *relationship_entity_keys]))

        return {
            "nodes": [
                {
                    "node_id": entity_key,
                    "label": entity_map[entity_key]["label"],
                    "node_type": entity_map[entity_key]["entity_type"],
                    "summary": entity_map[entity_key]["summary"],
                }
                for entity_key in graph_entity_keys
            ],
            "edges": [
                {
                    "edge_id": relationship["relationship_id"],
                    "source_node_id": relationship["source_entity_key"],
                    "target_node_id": relationship["target_entity_key"],
                    "relationship_type": relationship["relationship_type"],
                    "statement": relationship["statement"],
                }
                for relationship in relationships
                if relationship["source_entity_key"] in graph_entity_keys and relationship["target_entity_key"] in graph_entity_keys
            ],
        }
