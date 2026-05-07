from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any


class DiscussionKnowledgeRepository:
    def __init__(self, data_dir: Path) -> None:
        self._data_dir = data_dir

    def list_projects(self) -> list[dict[str, Any]]:
        return self._load("projects.json")

    def list_agents(self, project_id: str) -> list[dict[str, Any]]:
        return [agent for agent in self._load("agents.json") if agent["project_id"] == project_id]

    def list_chunks(self, project_id: str) -> list[dict[str, Any]]:
        return [chunk for chunk in self._load("chunks.json") if chunk["project_id"] == project_id]

    def list_entities(self, project_id: str) -> list[dict[str, Any]]:
        return [entity for entity in self._load("entities.json") if entity["project_id"] == project_id]

    def list_relationships(self, project_id: str) -> list[dict[str, Any]]:
        return [relationship for relationship in self._load("relationships.json") if relationship["project_id"] == project_id]

    def get_project(self, project_id: str) -> dict[str, Any]:
        for project in self.list_projects():
            if project["project_id"] == project_id:
                return project
        raise KeyError(f"Unknown project: {project_id}")

    @lru_cache(maxsize=8)
    def _load(self, filename: str) -> list[dict[str, Any]]:
        return json.loads((self._data_dir / filename).read_text(encoding="utf-8"))
