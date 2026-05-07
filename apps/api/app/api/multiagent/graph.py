from fastapi import APIRouter, HTTPException, status

from app.config import settings
from app.repositories.discussion_knowledge_repository import DiscussionKnowledgeRepository
from app.repositories.project_repository import ProjectRepository

router = APIRouter(prefix="/projects", tags=["graph"])

_repository = ProjectRepository(settings.sqlite_path, DiscussionKnowledgeRepository(settings.discussion_knowledge_dir))


@router.get("/{project_id}/graph")
def get_project_graph(project_id: str) -> dict:
    try:
        _repository.get_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.") from exc

    entities = _repository.list_entities(project_id)
    relationships = _repository.list_relationships(project_id)
    return {
        "project_id": project_id,
        "nodes": [
            {
                "id": entity["entity_key"],
                "label": entity["label"],
                "entity_type": entity["entity_type"],
                "description": entity["summary"],
                "aliases": entity.get("aliases", []),
                "source_chunk_ids": entity.get("source_chunk_ids", []),
                "attributes": entity.get("attributes", {}),
            }
            for entity in entities
        ],
        "edges": [
            {
                "id": relationship["relationship_id"],
                "source": relationship["source_entity_key"],
                "target": relationship["target_entity_key"],
                "relation_type": relationship["relationship_type"],
                "description": relationship["statement"],
                "evidence_chunk_ids": relationship.get("evidence_chunk_ids", []),
                "confidence": relationship.get("confidence", 1.0),
            }
            for relationship in relationships
        ],
    }


@router.get("/{project_id}/agents")
def get_project_agents(project_id: str) -> list[dict]:
    try:
        _repository.get_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.") from exc

    agents = _repository.list_agents(project_id)
    return [
        {
            "id": index + 1,
            "agent_id": agent["agent_id"],
            "name": agent["name"],
            "expertise": agent.get("expertise") or agent["focus"],
            "perspective": agent.get("perspective") or agent["focus"],
            "tools_and_methods": agent.get("tools_and_methods", []),
            "unique_domain": agent.get("unique_domain", ""),
            "forbidden_topics": agent.get("forbidden_topics", []),
            "key_terminology": agent.get("key_terminology") or agent.get("retrieval_terms", []),
            "knowledge_scope": agent.get("knowledge_scope", []),
            "community_id": agent.get("community_id") or "seed-community",
            "entity_keys": agent.get("entity_keys", []),
            "metadata": agent.get("metadata", {}),
        }
        for index, agent in enumerate(agents)
    ]
