"""
로컬 SQLite Optuna DB → Supabase PostgreSQL 마이그레이션

사용법:
  python migrate_optuna.py --to "postgresql+psycopg2://postgres.xxxx:PASSWORD@..."

로컬 DB 경로는 .env의 KICETIC_MPCVD_STUDY_PATH 또는 기본값을 사용합니다.
"""
from __future__ import annotations

import argparse

import optuna

from app.config import settings

optuna.logging.set_verbosity(optuna.logging.WARNING)


def migrate(to_storage: str) -> None:
    from_storage = settings.optuna_storage
    study_name = settings.mpcvd_study_name

    print(f"FROM: {from_storage}")
    print(f"TO:   {to_storage}")
    print(f"STUDY: {study_name}")

    try:
        optuna.copy_study(
            from_study_name=study_name,
            from_storage=from_storage,
            to_study_name=study_name,
            to_storage=to_storage,
        )
        print("마이그레이션 완료.")
    except Exception as exc:
        print(f"오류: {exc}")
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--to", required=True, help="대상 PostgreSQL URL")
    args = parser.parse_args()

    to_url = args.to
    if to_url.startswith("postgresql://") and "+psycopg2" not in to_url:
        to_url = to_url.replace("postgresql://", "postgresql+psycopg2://", 1)

    migrate(to_url)
