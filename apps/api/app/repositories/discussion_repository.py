from __future__ import annotations

import json
import logging
from datetime import datetime

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from app.models.domain import Discussion

logger = logging.getLogger(__name__)

_UPDATE_COLS = [
    "project_id", "title", "question", "module_mode", "stage", "summary",
    "agents_json", "hypotheses_json", "validations_json", "hypothesis_rankings_json",
    "constraint_candidates_json", "validated_constraints_json", "constraint_review_state_json",
    "new_constraint_suggestions_json", "selected_hypothesis_id", "turns_json", "next_actions_json", "evidence_json",
    "graph_json", "open_questions_json", "created_at",
]

_ALL_COLS = ["discussion_id"] + _UPDATE_COLS

_SCHEMA_COLUMNS = {
    "hypotheses_json": "TEXT NOT NULL DEFAULT '[]'",
    "validations_json": "TEXT NOT NULL DEFAULT '[]'",
    "hypothesis_rankings_json": "TEXT NOT NULL DEFAULT '[]'",
    "constraint_candidates_json": "TEXT NOT NULL DEFAULT '[]'",
    "validated_constraints_json": "TEXT NOT NULL DEFAULT '[]'",
    "constraint_review_state_json": "TEXT NOT NULL DEFAULT '{}'",
    "new_constraint_suggestions_json": "TEXT NOT NULL DEFAULT '[]'",
    "selected_hypothesis_id": "TEXT",
}

_INSERT_SQL = (
    f"INSERT INTO discussions ({', '.join(_ALL_COLS)}) "
    f"VALUES ({', '.join(':' + c for c in _ALL_COLS)}) "
    f"ON CONFLICT (discussion_id) DO UPDATE SET "
    + ", ".join(f"{c} = excluded.{c}" for c in _UPDATE_COLS)
)


class DiscussionRepository:
    """SQLite(로컬) 또는 PostgreSQL(Cloud Run/Supabase) 자동 전환 토론 저장소."""

    def __init__(self, db_url: str) -> None:
        is_sqlite = db_url.startswith("sqlite")
        connect_args = {"check_same_thread": False} if is_sqlite else {}
        pool_kwargs = {} if is_sqlite else {"pool_size": 2, "max_overflow": 3, "pool_timeout": 10}
        self._engine: Engine = create_engine(
            db_url, connect_args=connect_args, pool_pre_ping=True, **pool_kwargs
        )
        self._dialect = self._engine.dialect.name
        self._init_schema()

    def _init_schema(self) -> None:
        with self._engine.begin() as conn:
            if self._dialect == "sqlite":
                conn.execute(text("PRAGMA journal_mode=WAL"))
                conn.execute(text("PRAGMA synchronous=NORMAL"))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS discussions (
                    discussion_id         TEXT PRIMARY KEY,
                    project_id            TEXT NOT NULL,
                    title                 TEXT NOT NULL,
                    question              TEXT NOT NULL,
                    module_mode           TEXT NOT NULL,
                    stage                 TEXT NOT NULL,
                    summary               TEXT NOT NULL,
                    agents_json           TEXT NOT NULL,
                    hypotheses_json       TEXT NOT NULL DEFAULT '[]',
                    validations_json      TEXT NOT NULL DEFAULT '[]',
                    hypothesis_rankings_json TEXT NOT NULL DEFAULT '[]',
                    constraint_candidates_json TEXT NOT NULL DEFAULT '[]',
                    validated_constraints_json TEXT NOT NULL DEFAULT '[]',
                    constraint_review_state_json TEXT NOT NULL DEFAULT '{}',
                    new_constraint_suggestions_json TEXT NOT NULL DEFAULT '[]',
                    selected_hypothesis_id TEXT,
                    turns_json            TEXT NOT NULL,
                    next_actions_json     TEXT NOT NULL,
                    evidence_json         TEXT NOT NULL,
                    graph_json            TEXT NOT NULL,
                    open_questions_json   TEXT NOT NULL,
                    created_at            TEXT NOT NULL
                )
            """))
            self._ensure_schema_columns(conn)
        logger.info("DiscussionRepository ready (dialect=%s)", self._dialect)

    def _ensure_schema_columns(self, conn) -> None:
        existing_columns = self._get_column_names(conn)
        for column_name, column_definition in _SCHEMA_COLUMNS.items():
            if column_name not in existing_columns:
                conn.execute(text(f"ALTER TABLE discussions ADD COLUMN {column_name} {column_definition}"))

    def _get_column_names(self, conn) -> set[str]:
        if self._dialect == "sqlite":
            rows = conn.execute(text("PRAGMA table_info(discussions)")).mappings().fetchall()
            return {row["name"] for row in rows}
        rows = conn.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'discussions'
              AND table_schema = current_schema()
        """)).mappings().fetchall()
        return {row["column_name"] for row in rows}

    def list_discussions(self) -> list[Discussion]:
        with self._engine.connect() as conn:
            rows = conn.execute(
                text("SELECT * FROM discussions ORDER BY created_at DESC, discussion_id DESC")
            ).mappings().fetchall()
        return [_from_row(dict(row)) for row in rows]

    def save_discussion(self, discussion: Discussion) -> Discussion:
        with self._engine.begin() as conn:
            conn.execute(text(_INSERT_SQL), _to_params(discussion))
        return discussion

    def delete_discussion(self, discussion_id: str, project_id: str | None = None) -> bool:
        if project_id is None:
            sql, params = "DELETE FROM discussions WHERE discussion_id = :id", {"id": discussion_id}
        else:
            sql = "DELETE FROM discussions WHERE discussion_id = :id AND project_id = :pid"
            params = {"id": discussion_id, "pid": project_id}
        with self._engine.begin() as conn:
            result = conn.execute(text(sql), params)
        return result.rowcount > 0


def _to_params(d: Discussion) -> dict:
    return {
        "discussion_id": d.discussion_id,
        "project_id": d.project_id,
        "title": d.title,
        "question": d.question,
        "module_mode": d.module_mode,
        "stage": d.stage,
        "summary": d.summary,
        "agents_json": json.dumps([a.model_dump(mode="json") for a in d.agents], ensure_ascii=False),
        "hypotheses_json": json.dumps([h.model_dump(mode="json") for h in d.hypotheses], ensure_ascii=False),
        "validations_json": json.dumps([v.model_dump(mode="json") for v in d.validations], ensure_ascii=False),
        "hypothesis_rankings_json": json.dumps([r.model_dump(mode="json") for r in d.hypothesis_rankings], ensure_ascii=False),
        "constraint_candidates_json": json.dumps([c.model_dump(mode="json") for c in d.constraint_candidates], ensure_ascii=False),
        "validated_constraints_json": json.dumps([c.model_dump(mode="json") for c in d.validated_constraints], ensure_ascii=False),
        "constraint_review_state_json": json.dumps(d.constraint_review_state.model_dump(mode="json"), ensure_ascii=False),
        "new_constraint_suggestions_json": json.dumps([c.model_dump(mode="json") for c in d.new_constraint_suggestions], ensure_ascii=False),
        "selected_hypothesis_id": d.selected_hypothesis_id,
        "turns_json": json.dumps([t.model_dump(mode="json") for t in d.turns], ensure_ascii=False),
        "next_actions_json": json.dumps(d.next_actions, ensure_ascii=False),
        "evidence_json": json.dumps([e.model_dump(mode="json") for e in d.evidence], ensure_ascii=False),
        "graph_json": json.dumps(d.graph.model_dump(mode="json"), ensure_ascii=False),
        "open_questions_json": json.dumps(d.open_questions, ensure_ascii=False),
        "created_at": d.created_at.isoformat(),
    }


def _from_row(row: dict) -> Discussion:
    return Discussion.model_validate({
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
        "constraint_candidates": json.loads(row.get("constraint_candidates_json") or "[]"),
        "validated_constraints": json.loads(row.get("validated_constraints_json") or "[]"),
        "constraint_review_state": json.loads(row.get("constraint_review_state_json") or "{}"),
        "new_constraint_suggestions": json.loads(row.get("new_constraint_suggestions_json") or "[]"),
        "selected_hypothesis_id": row["selected_hypothesis_id"],
        "turns": json.loads(row["turns_json"]),
        "next_actions": json.loads(row["next_actions_json"]),
        "evidence": json.loads(row["evidence_json"]),
        "graph": json.loads(row["graph_json"]),
        "open_questions": json.loads(row["open_questions_json"]),
        "created_at": datetime.fromisoformat(row["created_at"]),
    })
