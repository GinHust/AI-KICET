from __future__ import annotations

import json
import logging
import re
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

logger = logging.getLogger(__name__)

from app.config import settings
from app.models.domain import Discussion
from app.repositories.discussion_knowledge_repository import DiscussionKnowledgeRepository
from app.repositories.discussion_repository import DiscussionRepository

class ProjectRepository:
    def __init__(self, db_path: Path, knowledge_repository: DiscussionKnowledgeRepository | None = None) -> None:
        self.db_path = db_path
        self._knowledge_repository = knowledge_repository
        self._lock = threading.Lock()
        self._discussion_repo = DiscussionRepository(settings.discussions_db_url)
        self._initialize()
        if knowledge_repository is not None:
            self._bootstrap_from_seed()

    @contextmanager
    def connection(self, read_only: bool = False) -> Iterator[sqlite3.Connection]:
        if read_only:
            db_uri = self.db_path.resolve().as_posix()
            # immutable=1 제거: 동시 쓰기 중 stale read/충돌 방지
            conn = sqlite3.connect(
                f"file:{db_uri}?mode=ro",
                uri=True,
                detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES,
            )
        else:
            conn = sqlite3.connect(self.db_path, detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES)
        conn.row_factory = sqlite3.Row
        if not read_only:
            conn.execute("PRAGMA foreign_keys=ON")
        try:
            yield conn
            if not read_only:
                conn.commit()
        finally:
            conn.close()

    def _initialize(self) -> None:
        try:
            self._run_schema_initialization()
        except sqlite3.OperationalError as exc:
            if (
                self.db_path.exists()
                and "disk i/o error" in str(exc).lower()
                and self._existing_schema_is_usable()
            ):
                return
            raise

    def _run_schema_initialization(self) -> None:
        with self.connection() as conn:
            # WAL 모드: 읽기/쓰기 동시 허용 (기본 journal 모드는 쓰기 중 읽기 차단)
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS projects (
                    project_id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    material_family TEXT NOT NULL,
                    objective TEXT NOT NULL,
                    target_metric TEXT NOT NULL,
                    target_value REAL NOT NULL,
                    target_unit TEXT NOT NULL,
                    keywords_json TEXT NOT NULL,
                    recommended_actions_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS documents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    stored_path TEXT NOT NULL DEFAULT '',
                    content_hash TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'seeded',
                    total_sections INTEGER NOT NULL DEFAULT 0,
                    total_chunks INTEGER NOT NULL DEFAULT 0,
                    error_message TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(project_id) REFERENCES projects(project_id)
                );

                CREATE TABLE IF NOT EXISTS chunks (
                    chunk_id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    document_id INTEGER,
                    title TEXT NOT NULL,
                    source TEXT NOT NULL,
                    year INTEGER NOT NULL,
                    summary TEXT NOT NULL,
                    excerpt TEXT NOT NULL,
                    keywords_json TEXT NOT NULL,
                    entity_keys_json TEXT NOT NULL,
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(project_id) REFERENCES projects(project_id),
                    FOREIGN KEY(document_id) REFERENCES documents(id)
                );

                CREATE TABLE IF NOT EXISTS entities (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id TEXT NOT NULL,
                    entity_key TEXT NOT NULL,
                    entity_type TEXT NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL,
                    aliases_json TEXT NOT NULL DEFAULT '[]',
                    source_chunk_ids_json TEXT NOT NULL DEFAULT '[]',
                    attributes_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(project_id, entity_key),
                    FOREIGN KEY(project_id) REFERENCES projects(project_id)
                );

                CREATE TABLE IF NOT EXISTS relationships (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id TEXT NOT NULL,
                    relationship_id TEXT NOT NULL,
                    relation_type TEXT NOT NULL,
                    source_entity_key TEXT NOT NULL,
                    target_entity_key TEXT NOT NULL,
                    description TEXT NOT NULL,
                    evidence_chunk_ids_json TEXT NOT NULL DEFAULT '[]',
                    confidence REAL NOT NULL DEFAULT 1.0,
                    created_at TEXT NOT NULL,
                    UNIQUE(project_id, relationship_id),
                    FOREIGN KEY(project_id) REFERENCES projects(project_id)
                );

                CREATE TABLE IF NOT EXISTS agents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id TEXT NOT NULL,
                    agent_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    stance TEXT NOT NULL,
                    focus TEXT NOT NULL,
                    expertise TEXT NOT NULL DEFAULT '',
                    perspective TEXT NOT NULL DEFAULT '',
                    tools_and_methods_json TEXT NOT NULL DEFAULT '[]',
                    unique_domain TEXT NOT NULL DEFAULT '',
                    forbidden_topics_json TEXT NOT NULL DEFAULT '[]',
                    key_terminology_json TEXT NOT NULL DEFAULT '[]',
                    evidence_focus_json TEXT NOT NULL DEFAULT '[]',
                    retrieval_terms_json TEXT NOT NULL DEFAULT '[]',
                    knowledge_scope_json TEXT NOT NULL DEFAULT '[]',
                    community_id TEXT NOT NULL DEFAULT '',
                    entity_keys_json TEXT NOT NULL DEFAULT '[]',
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    next_action_hint TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(project_id, agent_id),
                    FOREIGN KEY(project_id) REFERENCES projects(project_id)
                );

                CREATE TABLE IF NOT EXISTS discussions (
                    discussion_id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    question TEXT NOT NULL,
                    module_mode TEXT NOT NULL,
                    stage TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    agents_json TEXT NOT NULL,
                    hypotheses_json TEXT NOT NULL DEFAULT '[]',
                    validations_json TEXT NOT NULL DEFAULT '[]',
                    hypothesis_rankings_json TEXT NOT NULL DEFAULT '[]',
                    constraint_candidates_json TEXT NOT NULL DEFAULT '[]',
                    validated_constraints_json TEXT NOT NULL DEFAULT '[]',
                    constraint_review_state_json TEXT NOT NULL DEFAULT '{}',
                    new_constraint_suggestions_json TEXT NOT NULL DEFAULT '[]',
                    selected_hypothesis_id TEXT,
                    turns_json TEXT NOT NULL,
                    next_actions_json TEXT NOT NULL,
                    evidence_json TEXT NOT NULL,
                    graph_json TEXT NOT NULL,
                    open_questions_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(project_id) REFERENCES projects(project_id)
                );

                CREATE TABLE IF NOT EXISTS reports (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id TEXT NOT NULL,
                    question TEXT NOT NULL,
                    executive_summary TEXT NOT NULL,
                    sections_json TEXT NOT NULL,
                    key_findings_json TEXT NOT NULL,
                    open_questions_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(project_id) REFERENCES projects(project_id)
                );
                """
            )
            conn.execute("ALTER TABLE discussions ADD COLUMN hypotheses_json TEXT NOT NULL DEFAULT '[]'") if "hypotheses_json" not in {row['name'] for row in conn.execute("PRAGMA table_info(discussions)").fetchall()} else None
            conn.execute("ALTER TABLE discussions ADD COLUMN validations_json TEXT NOT NULL DEFAULT '[]'") if "validations_json" not in {row['name'] for row in conn.execute("PRAGMA table_info(discussions)").fetchall()} else None
            conn.execute("ALTER TABLE discussions ADD COLUMN hypothesis_rankings_json TEXT NOT NULL DEFAULT '[]'") if "hypothesis_rankings_json" not in {row['name'] for row in conn.execute("PRAGMA table_info(discussions)").fetchall()} else None
            conn.execute("ALTER TABLE discussions ADD COLUMN constraint_candidates_json TEXT NOT NULL DEFAULT '[]'") if "constraint_candidates_json" not in {row['name'] for row in conn.execute("PRAGMA table_info(discussions)").fetchall()} else None
            conn.execute("ALTER TABLE discussions ADD COLUMN validated_constraints_json TEXT NOT NULL DEFAULT '[]'") if "validated_constraints_json" not in {row['name'] for row in conn.execute("PRAGMA table_info(discussions)").fetchall()} else None
            conn.execute("ALTER TABLE discussions ADD COLUMN constraint_review_state_json TEXT NOT NULL DEFAULT '{}'") if "constraint_review_state_json" not in {row['name'] for row in conn.execute("PRAGMA table_info(discussions)").fetchall()} else None
            conn.execute("ALTER TABLE discussions ADD COLUMN new_constraint_suggestions_json TEXT NOT NULL DEFAULT '[]'") if "new_constraint_suggestions_json" not in {row['name'] for row in conn.execute("PRAGMA table_info(discussions)").fetchall()} else None
            conn.execute("ALTER TABLE discussions ADD COLUMN selected_hypothesis_id TEXT") if "selected_hypothesis_id" not in {row['name'] for row in conn.execute("PRAGMA table_info(discussions)").fetchall()} else None

            agent_columns = {row["name"] for row in conn.execute("PRAGMA table_info(agents)").fetchall()}
            for column_name, statement in (
                ("expertise", "ALTER TABLE agents ADD COLUMN expertise TEXT NOT NULL DEFAULT ''"),
                ("perspective", "ALTER TABLE agents ADD COLUMN perspective TEXT NOT NULL DEFAULT ''"),
                ("tools_and_methods_json", "ALTER TABLE agents ADD COLUMN tools_and_methods_json TEXT NOT NULL DEFAULT '[]'"),
                ("unique_domain", "ALTER TABLE agents ADD COLUMN unique_domain TEXT NOT NULL DEFAULT ''"),
                ("forbidden_topics_json", "ALTER TABLE agents ADD COLUMN forbidden_topics_json TEXT NOT NULL DEFAULT '[]'"),
                ("key_terminology_json", "ALTER TABLE agents ADD COLUMN key_terminology_json TEXT NOT NULL DEFAULT '[]'"),
                ("evidence_focus_json", "ALTER TABLE agents ADD COLUMN evidence_focus_json TEXT NOT NULL DEFAULT '[]'"),
                ("retrieval_terms_json", "ALTER TABLE agents ADD COLUMN retrieval_terms_json TEXT NOT NULL DEFAULT '[]'"),
                ("knowledge_scope_json", "ALTER TABLE agents ADD COLUMN knowledge_scope_json TEXT NOT NULL DEFAULT '[]'"),
                ("community_id", "ALTER TABLE agents ADD COLUMN community_id TEXT NOT NULL DEFAULT ''"),
                ("entity_keys_json", "ALTER TABLE agents ADD COLUMN entity_keys_json TEXT NOT NULL DEFAULT '[]'"),
                ("metadata_json", "ALTER TABLE agents ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'"),
                ("next_action_hint", "ALTER TABLE agents ADD COLUMN next_action_hint TEXT NOT NULL DEFAULT ''"),
            ):
                if column_name not in agent_columns:
                    conn.execute(statement)

    def _existing_schema_is_usable(self) -> bool:
        required_tables = {
            "projects",
            "documents",
            "chunks",
            "entities",
            "relationships",
            "agents",
            "discussions",
            "reports",
        }
        required_discussion_columns = {
            "hypotheses_json",
            "validations_json",
            "hypothesis_rankings_json",
            "constraint_candidates_json",
            "validated_constraints_json",
            "constraint_review_state_json",
            "new_constraint_suggestions_json",
            "selected_hypothesis_id",
        }
        required_agent_columns = {
            "expertise",
            "perspective",
            "tools_and_methods_json",
            "unique_domain",
            "forbidden_topics_json",
            "key_terminology_json",
            "evidence_focus_json",
            "retrieval_terms_json",
            "knowledge_scope_json",
            "community_id",
            "entity_keys_json",
            "metadata_json",
            "next_action_hint",
        }
        try:
            db_uri = self.db_path.resolve().as_posix()
            with sqlite3.connect(f"file:{db_uri}?mode=ro", uri=True) as conn:
                table_rows = conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
                table_names = {row[0] for row in table_rows}
                if not required_tables.issubset(table_names):
                    return False
                discussion_column_rows = conn.execute("PRAGMA table_info(discussions)").fetchall()
                discussion_column_names = {row[1] for row in discussion_column_rows}
                if not required_discussion_columns.issubset(discussion_column_names):
                    return False
                agent_column_rows = conn.execute("PRAGMA table_info(agents)").fetchall()
                agent_column_names = {row[1] for row in agent_column_rows}
                return required_agent_columns.issubset(agent_column_names)
        except sqlite3.Error:
            return False

    def _bootstrap_from_seed(self) -> None:
        if self._knowledge_repository is None:
            return

        with self.connection(read_only=True) as conn:
            row = conn.execute("SELECT COUNT(*) AS count FROM projects").fetchone()
            project_count = int(row["count"]) if row is not None else 0

        if project_count == 0:
            self.import_seed_data()
            return

        self.refresh_seed_agents()

    def refresh_seed_agents(self) -> None:
        if self._knowledge_repository is None:
            return

        projects = self._knowledge_repository.list_projects()
        now = datetime.now(timezone.utc).isoformat()

        with self._lock, self.connection() as conn:
            for project in projects:
                project_id = project["project_id"]
                project_row = conn.execute("SELECT 1 FROM projects WHERE project_id = ?", (project_id,)).fetchone()
                if project_row is None:
                    continue

                for agent in self._knowledge_repository.list_agents(project_id):
                    self._upsert_seed_agent(conn, agent, now)

    def refresh_seed_graph(self) -> None:
        """엔티티·관계를 JSON 씨드로 덮어씀 — DB 수가 씨드보다 많으면 스킵."""
        if self._knowledge_repository is None:
            return

        projects = self._knowledge_repository.list_projects()
        now = datetime.now(timezone.utc).isoformat()

        with self._lock, self.connection() as conn:
            for project in projects:
                project_id = project["project_id"]
                if conn.execute("SELECT 1 FROM projects WHERE project_id = ?", (project_id,)).fetchone() is None:
                    continue

                seed_entities = self._knowledge_repository.list_entities(project_id)
                db_count = conn.execute(
                    "SELECT COUNT(*) FROM entities WHERE project_id = ?", (project_id,)
                ).fetchone()[0]
                if db_count >= len(seed_entities):
                    logger.info(
                        "refresh_seed_graph: skip (db=%d >= seed=%d) for %s",
                        db_count, len(seed_entities), project_id,
                    )
                    continue

                for entity in seed_entities:
                    source_chunk_ids = [
                        chunk["chunk_id"]
                        for chunk in self._knowledge_repository.list_chunks(project_id)
                        if entity["entity_key"] in chunk.get("entity_keys", [])
                    ]
                    conn.execute(
                        """
                        INSERT INTO entities (
                            project_id, entity_key, entity_type, name, description,
                            aliases_json, source_chunk_ids_json, attributes_json,
                            created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(project_id, entity_key) DO UPDATE SET
                            entity_type = excluded.entity_type,
                            name        = excluded.name,
                            description = excluded.description,
                            updated_at  = excluded.updated_at
                        """,
                        (
                            entity["project_id"],
                            entity["entity_key"],
                            entity["entity_type"],
                            entity["label"],
                            entity["summary"],
                            json.dumps([], ensure_ascii=False),
                            json.dumps(source_chunk_ids, ensure_ascii=False),
                            json.dumps({}, ensure_ascii=False),
                            now,
                            now,
                        ),
                    )

                for relationship in self._knowledge_repository.list_relationships(project_id):
                    evidence_chunk_ids = [
                        chunk["chunk_id"]
                        for chunk in self._knowledge_repository.list_chunks(project_id)
                        if relationship["source_entity_key"] in chunk.get("entity_keys", [])
                        or relationship["target_entity_key"] in chunk.get("entity_keys", [])
                    ]
                    conn.execute(
                        """
                        INSERT INTO relationships (
                            project_id, relationship_id, relation_type, source_entity_key,
                            target_entity_key, description, evidence_chunk_ids_json,
                            confidence, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(project_id, relationship_id) DO UPDATE SET
                            relation_type      = excluded.relation_type,
                            source_entity_key  = excluded.source_entity_key,
                            target_entity_key  = excluded.target_entity_key,
                            description        = excluded.description,
                            confidence         = excluded.confidence
                        """,
                        (
                            relationship["project_id"],
                            relationship["relationship_id"],
                            relationship["relationship_type"],
                            relationship["source_entity_key"],
                            relationship["target_entity_key"],
                            relationship["statement"],
                            json.dumps(evidence_chunk_ids, ensure_ascii=False),
                            1.0,
                            now,
                        ),
                    )

    def import_seed_data(self) -> None:
        if self._knowledge_repository is None:
            return

        projects = self._knowledge_repository.list_projects()
        now = datetime.now(timezone.utc).isoformat()

        with self._lock, self.connection() as conn:
            for project in projects:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO projects (
                        project_id, name, material_family, objective,
                        target_metric, target_value, target_unit,
                        keywords_json, recommended_actions_json,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        project["project_id"],
                        project["name"],
                        project["material_family"],
                        project["objective"],
                        project["target_metric"],
                        project["target_value"],
                        project["target_unit"],
                        json.dumps(project.get("keywords", []), ensure_ascii=False),
                        json.dumps(project.get("recommended_actions", []), ensure_ascii=False),
                        now,
                        now,
                    ),
                )

                document_cursor = conn.execute(
                    """
                    INSERT INTO documents (
                        project_id, filename, stored_path, content_hash, status,
                        total_sections, total_chunks, created_at, updated_at
                    ) VALUES (?, ?, '', ?, 'seeded', 1, ?, ?, ?)
                    """,
                    (
                        project["project_id"],
                        f"{project['project_id']}-seed.json",
                        project["project_id"],
                        len(self._knowledge_repository.list_chunks(project["project_id"])),
                        now,
                        now,
                    ),
                )
                document_id = int(document_cursor.lastrowid)

                for chunk in self._knowledge_repository.list_chunks(project["project_id"]):
                    conn.execute(
                        """
                        INSERT OR REPLACE INTO chunks (
                            chunk_id, project_id, document_id, title, source, year,
                            summary, excerpt, keywords_json, entity_keys_json, metadata_json, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            chunk["chunk_id"],
                            chunk["project_id"],
                            document_id,
                            chunk["title"],
                            chunk["source"],
                            chunk["year"],
                            chunk["summary"],
                            chunk["excerpt"],
                            json.dumps(chunk.get("keywords", []), ensure_ascii=False),
                            json.dumps(chunk.get("entity_keys", []), ensure_ascii=False),
                            json.dumps({}, ensure_ascii=False),
                            now,
                        ),
                    )

                for entity in self._knowledge_repository.list_entities(project["project_id"]):
                    source_chunk_ids = [
                        chunk["chunk_id"]
                        for chunk in self._knowledge_repository.list_chunks(project["project_id"])
                        if entity["entity_key"] in chunk.get("entity_keys", [])
                    ]
                    conn.execute(
                        """
                        INSERT OR REPLACE INTO entities (
                            project_id, entity_key, entity_type, name, description,
                            aliases_json, source_chunk_ids_json, attributes_json,
                            created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            entity["project_id"],
                            entity["entity_key"],
                            entity["entity_type"],
                            entity["label"],
                            entity["summary"],
                            json.dumps([], ensure_ascii=False),
                            json.dumps(source_chunk_ids, ensure_ascii=False),
                            json.dumps({}, ensure_ascii=False),
                            now,
                            now,
                        ),
                    )

                for relationship in self._knowledge_repository.list_relationships(project["project_id"]):
                    evidence_chunk_ids = [
                        chunk["chunk_id"]
                        for chunk in self._knowledge_repository.list_chunks(project["project_id"])
                        if relationship["source_entity_key"] in chunk.get("entity_keys", [])
                        or relationship["target_entity_key"] in chunk.get("entity_keys", [])
                    ]
                    conn.execute(
                        """
                        INSERT OR REPLACE INTO relationships (
                            project_id, relationship_id, relation_type, source_entity_key,
                            target_entity_key, description, evidence_chunk_ids_json,
                            confidence, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            relationship["project_id"],
                            relationship["relationship_id"],
                            relationship["relationship_type"],
                            relationship["source_entity_key"],
                            relationship["target_entity_key"],
                            relationship["statement"],
                            json.dumps(evidence_chunk_ids, ensure_ascii=False),
                            1.0,
                            now,
                        ),
                    )

                for agent in self._knowledge_repository.list_agents(project["project_id"]):
                    self._upsert_seed_agent(conn, agent, now)

    def _upsert_seed_agent(self, conn: sqlite3.Connection, agent: dict[str, Any], now: str) -> None:
        existing_row = conn.execute(
            "SELECT community_id, entity_keys_json, metadata_json FROM agents WHERE project_id = ? AND agent_id = ?",
            (agent["project_id"], agent["agent_id"]),
        ).fetchone()
        existing_metadata: dict[str, Any] = {}
        existing_entity_keys: list[str] = []
        existing_community_id = ""
        if existing_row is not None:
            parsed_metadata = self._safe_json_load(existing_row["metadata_json"], {})
            if isinstance(parsed_metadata, dict):
                existing_metadata = parsed_metadata
            parsed_entity_keys = self._safe_json_load(existing_row["entity_keys_json"], [])
            if isinstance(parsed_entity_keys, list):
                existing_entity_keys = parsed_entity_keys
            existing_community_id = existing_row["community_id"]

        seed_metadata_value = agent.get("metadata") or {}
        seed_metadata = dict(seed_metadata_value) if isinstance(seed_metadata_value, dict) else {}
        metadata = {**existing_metadata, **seed_metadata}
        if agent.get("research_duty"):
            metadata["research_duty"] = agent["research_duty"]
        entity_keys = agent.get("entity_keys") if agent.get("entity_keys") is not None else existing_entity_keys
        community_id = agent.get("community_id") or existing_community_id or "seed-community"

        conn.execute(
            """
            INSERT INTO agents (
                project_id, agent_id, name, stance, focus, expertise, perspective,
                tools_and_methods_json, unique_domain, forbidden_topics_json,
                key_terminology_json, evidence_focus_json, retrieval_terms_json,
                knowledge_scope_json, community_id, entity_keys_json, metadata_json,
                next_action_hint, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(project_id, agent_id) DO UPDATE SET
                name = excluded.name,
                stance = excluded.stance,
                focus = excluded.focus,
                expertise = excluded.expertise,
                perspective = excluded.perspective,
                tools_and_methods_json = excluded.tools_and_methods_json,
                unique_domain = excluded.unique_domain,
                forbidden_topics_json = excluded.forbidden_topics_json,
                key_terminology_json = excluded.key_terminology_json,
                evidence_focus_json = excluded.evidence_focus_json,
                retrieval_terms_json = excluded.retrieval_terms_json,
                knowledge_scope_json = CASE
                    WHEN json_array_length(agents.knowledge_scope_json) > json_array_length(excluded.knowledge_scope_json)
                    THEN agents.knowledge_scope_json
                    ELSE excluded.knowledge_scope_json
                END,
                community_id = excluded.community_id,
                entity_keys_json = excluded.entity_keys_json,
                metadata_json = excluded.metadata_json,
                next_action_hint = excluded.next_action_hint,
                updated_at = excluded.updated_at
            """,
            (
                agent["project_id"],
                agent["agent_id"],
                agent["name"],
                agent["stance"],
                agent["focus"],
                agent.get("expertise", agent["focus"]),
                agent.get("perspective", agent["focus"]),
                json.dumps(agent.get("tools_and_methods", []), ensure_ascii=False),
                agent.get("unique_domain", ""),
                json.dumps(agent.get("forbidden_topics", []), ensure_ascii=False),
                json.dumps(agent.get("key_terminology", []), ensure_ascii=False),
                json.dumps(agent.get("evidence_focus", []), ensure_ascii=False),
                json.dumps(agent.get("retrieval_terms", []), ensure_ascii=False),
                json.dumps(agent.get("knowledge_scope", []), ensure_ascii=False),
                community_id,
                json.dumps(entity_keys, ensure_ascii=False),
                json.dumps(metadata, ensure_ascii=False),
                agent.get("next_action_hint", ""),
                now,
                now,
            ),
        )

    @staticmethod
    def _trim_text(value: str | None, limit: int) -> str:
        text = (value or "").strip()
        if len(text) <= limit:
            return text
        return text[: limit - 1].rstrip() + "…"

    def _summarize_text(self, value: str | None) -> str:
        text = " ".join((value or "").split())
        if not text:
            return "Summary unavailable."
        for separator in (". ", "\n", "? ", "! "):
            head = text.split(separator)[0].strip()
            if head and len(head) > 40:
                return self._trim_text(head, 240)
        return self._trim_text(text, 240)

    @staticmethod
    def _extract_year(value: str | None) -> int:
        text = value or ""
        matches = re.findall(r"(?:19|20)\d{2}", text)
        if matches:
            return int(matches[-1])
        return 2026

    @staticmethod
    def _safe_json_load(value: str | None, default: Any) -> Any:
        if not value:
            return default
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return default

    def _safe_json_text(self, value: str | None, default: str) -> str:
        parsed = self._safe_json_load(value, None)
        if parsed is None:
            return default
        return json.dumps(parsed, ensure_ascii=False)

    def _infer_keywords(self, *parts: str | None) -> list[str]:
        text = " ".join(part for part in parts if part)
        candidates = re.findall(r"[A-Za-z0-9\-\+]{3,}", text)
        seen: list[str] = []
        for candidate in candidates:
            token = candidate.strip()
            if token.lower() in {item.lower() for item in seen}:
                continue
            seen.append(token)
            if len(seen) == 8:
                break
        return seen or ["research", "optimization", "experiment"]

    @staticmethod
    def _infer_stance(name: str, perspective: str) -> str:
        text = f"{name} {perspective}".lower()
        if "process" in text or "growth" in text or "engineer" in text:
            return "process"
        if "character" in text or "analysis" in text or "review" in text:
            return "analysis"
        if "plasma" in text or "materials" in text or "specialist" in text:
            return "research"
        return "insight"

    def _derive_retrieval_terms(self, *parts: str | None) -> list[str]:
        keywords = self._infer_keywords(*parts)
        return keywords[:6]

    def _derive_evidence_focus(self, *parts: str | None) -> list[str]:
        keywords = self._infer_keywords(*parts)
        return keywords[:4]

    @staticmethod
    def _build_next_action_hint(agent_name: str) -> str:
        return f"{agent_name} 관점에서 source chunk를 재검토합니다."

    def list_projects(self) -> list[dict[str, Any]]:
        with self.connection(read_only=True) as conn:
            rows = conn.execute("SELECT * FROM projects ORDER BY updated_at DESC, project_id ASC").fetchall()
        return [self._project_from_row(row) for row in rows]

    def get_project(self, project_id: str) -> dict[str, Any]:
        with self.connection(read_only=True) as conn:
            row = conn.execute("SELECT * FROM projects WHERE project_id = ?", (project_id,)).fetchone()
        if row is None:
            raise KeyError(f"Unknown project: {project_id}")
        return self._project_from_row(row)

    def list_agents(self, project_id: str) -> list[dict[str, Any]]:
        with self.connection(read_only=True) as conn:
            rows = conn.execute(
                "SELECT * FROM agents WHERE project_id = ? ORDER BY id ASC",
                (project_id,),
            ).fetchall()
        return [self._agent_from_row(row) for row in rows]

    def list_chunks(self, project_id: str) -> list[dict[str, Any]]:
        with self.connection(read_only=True) as conn:
            rows = conn.execute(
                "SELECT * FROM chunks WHERE project_id = ? ORDER BY year DESC, chunk_id ASC",
                (project_id,),
            ).fetchall()
        return [self._chunk_from_row(row) for row in rows]

    def list_entities(self, project_id: str) -> list[dict[str, Any]]:
        with self.connection(read_only=True) as conn:
            rows = conn.execute(
                "SELECT * FROM entities WHERE project_id = ? ORDER BY entity_type, name",
                (project_id,),
            ).fetchall()
        return [self._entity_from_row(row) for row in rows]

    def list_relationships(self, project_id: str) -> list[dict[str, Any]]:
        with self.connection(read_only=True) as conn:
            rows = conn.execute(
                "SELECT * FROM relationships WHERE project_id = ? ORDER BY id ASC",
                (project_id,),
            ).fetchall()
        return [self._relationship_from_row(row) for row in rows]

    def list_discussions(self) -> list[Discussion]:
        return self._discussion_repo.list_discussions()

    def save_discussion(self, discussion: Discussion) -> Discussion:
        return self._discussion_repo.save_discussion(discussion)

    def delete_discussion(self, discussion_id: str, project_id: str | None = None) -> bool:
        return self._discussion_repo.delete_discussion(discussion_id, project_id)

    @staticmethod
    def _project_from_row(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "project_id": row["project_id"],
            "name": row["name"],
            "material_family": row["material_family"],
            "objective": row["objective"],
            "target_metric": row["target_metric"],
            "target_value": row["target_value"],
            "target_unit": row["target_unit"],
            "keywords": json.loads(row["keywords_json"]),
            "recommended_actions": json.loads(row["recommended_actions_json"]),
            "updated_at": row["updated_at"],
        }

    @staticmethod
    def _chunk_from_row(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "chunk_id": row["chunk_id"],
            "project_id": row["project_id"],
            "title": row["title"],
            "source": row["source"],
            "year": row["year"],
            "summary": row["summary"],
            "excerpt": row["excerpt"],
            "keywords": json.loads(row["keywords_json"]),
            "entity_keys": json.loads(row["entity_keys_json"]),
        }

    @staticmethod
    def _entity_from_row(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "entity_key": row["entity_key"],
            "project_id": row["project_id"],
            "label": row["name"],
            "entity_type": row["entity_type"],
            "summary": row["description"],
            "aliases": json.loads(row["aliases_json"]),
            "source_chunk_ids": json.loads(row["source_chunk_ids_json"]),
            "attributes": json.loads(row["attributes_json"]),
        }

    @staticmethod
    def _relationship_from_row(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "relationship_id": row["relationship_id"],
            "project_id": row["project_id"],
            "source_entity_key": row["source_entity_key"],
            "target_entity_key": row["target_entity_key"],
            "relationship_type": row["relation_type"],
            "statement": row["description"],
            "evidence_chunk_ids": json.loads(row["evidence_chunk_ids_json"]),
            "confidence": row["confidence"],
        }

    @staticmethod
    def _agent_from_row(row: sqlite3.Row) -> dict[str, Any]:
        metadata = json.loads(row["metadata_json"])
        return {
            "agent_id": row["agent_id"],
            "project_id": row["project_id"],
            "name": row["name"],
            "stance": row["stance"],
            "focus": row["focus"],
            "expertise": row["expertise"],
            "perspective": row["perspective"],
            "research_duty": metadata.get("research_duty", ""),
            "tools_and_methods": json.loads(row["tools_and_methods_json"]),
            "unique_domain": row["unique_domain"],
            "forbidden_topics": json.loads(row["forbidden_topics_json"]),
            "key_terminology": json.loads(row["key_terminology_json"]),
            "evidence_focus": json.loads(row["evidence_focus_json"]),
            "retrieval_terms": json.loads(row["retrieval_terms_json"]),
            "knowledge_scope": json.loads(row["knowledge_scope_json"]),
            "community_id": row["community_id"],
            "entity_keys": json.loads(row["entity_keys_json"]),
            "next_action_hint": row["next_action_hint"],
            "metadata": metadata,
        }

    @staticmethod
    def _discussion_from_row(row: sqlite3.Row) -> Discussion:
        payload = {
            "discussion_id": row["discussion_id"],
            "project_id": row["project_id"],
            "title": row["title"],
            "question": row["question"],
            "module_mode": row["module_mode"],
            "stage": row["stage"],
            "summary": row["summary"],
            "agents": json.loads(row["agents_json"]),
            "hypotheses": json.loads(row["hypotheses_json"] or "[]"),
            "validations": json.loads(row["validations_json"] or "[]"),
            "hypothesis_rankings": json.loads(row["hypothesis_rankings_json"] or "[]"),
            "constraint_candidates": json.loads(row["constraint_candidates_json"] or "[]"),
            "validated_constraints": json.loads(row["validated_constraints_json"] or "[]"),
            "constraint_review_state": json.loads(row["constraint_review_state_json"] or "{}"),
            "new_constraint_suggestions": json.loads(row["new_constraint_suggestions_json"] or "[]"),
            "selected_hypothesis_id": row["selected_hypothesis_id"],
            "turns": json.loads(row["turns_json"]),
            "next_actions": json.loads(row["next_actions_json"]),
            "evidence": json.loads(row["evidence_json"]),
            "graph": json.loads(row["graph_json"]),
            "open_questions": json.loads(row["open_questions_json"]),
            "created_at": datetime.fromisoformat(row["created_at"]),
        }
        return Discussion.model_validate(payload)
