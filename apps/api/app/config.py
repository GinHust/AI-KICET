from pathlib import Path
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

APP_DIR = Path(__file__).resolve().parent


class Settings(BaseSettings):
    app_name: str = "KICETIC API"
    app_env: str = "local"
    api_prefix: str = "/api"
    cors_origins: list[str] = Field(default_factory=list)

    @property
    def effective_cors_origins(self) -> list[str]:
        """production 환경은 Vercel URL만, 로컬은 localhost도 허용."""
        if self.cors_origins:
            return self.cors_origins
        if self.app_env == "production":
            return [
                "https://kicetic.vercel.app",
                "https://kicetic-j0p89elcl-pty2223-2130s-projects.vercel.app",
            ]
        return [
            "http://localhost:3000",
            "http://localhost:3001",
            "http://localhost:3002",
            "http://localhost:3003",
            "http://localhost:3005",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:3001",
            "http://127.0.0.1:3002",
            "http://127.0.0.1:3003",
            "http://127.0.0.1:3005",
            "http://127.0.0.1:8004",
            "http://127.0.0.1:8005",
            "http://127.0.0.1:8015",
        ]
    projects_backend: str = "real"
    discussions_backend: str = "real"
    optimizer_backend: str = "mock"
    xai_backend: str = "mock"
    rag_mode: str = "multiagent"
    discussion_knowledge_dir: Path = APP_DIR / "data" / "discussion_knowledge"
    data_dir: Path = APP_DIR / "data" / "kicetic"
    sqlite_path: Path = APP_DIR / "data" / "kicetic" / "projects.db"
    chroma_dir: Path = APP_DIR / "data" / "kicetic" / "chromadb"
    llm_provider: str = "anthropic"
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-opus-4-7"
    openai_api_key: str | None = None
    openai_model: str = "gpt-5.5"

    # Optuna MPCVD storage — 로컬은 SQLite, 클라우드는 DATABASE_URL(PostgreSQL) 사용
    database_url: Optional[str] = Field(
        default=None,
        description="PostgreSQL URL for cloud deployment (e.g. Supabase). "
                    "Overrides mpcvd_study_path when set.",
    )
    mpcvd_study_path: Path = APP_DIR / "data" / "mpcvd_study_v2.db"
    mpcvd_study_name: str = "mpcvd_optimization_v2"
    cantera_mechanism_path: Path = APP_DIR / "data" / "mechanisms" / "diamond.yaml"
    cantera_gas_phase: str = "gas"
    cantera_bulk_phase: str = "diamond"
    cantera_surface_phase: str = "diamond_100"

    @property
    def discussions_db_url(self) -> str:
        """discussions 영속 저장 URL.
        DATABASE_URL 설정 시 Supabase PostgreSQL 사용 (Cloud Run 재시작 후에도 유지).
        미설정 시 로컬 SQLite 사용.
        """
        if self.database_url:
            url = self.database_url
            if url.startswith("postgresql://") and "+psycopg2" not in url:
                url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
            return url
        return f"sqlite:///{self.sqlite_path}"

    @property
    def optuna_storage(self) -> str:
        if self.database_url:
            url = self.database_url
            if url.startswith("postgresql://") and "+psycopg2" not in url:
                url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
            return url
        return f"sqlite:///{self.mpcvd_study_path}"

    model_config = SettingsConfigDict(
        env_file=APP_DIR.parent / ".env",
        env_prefix="KICETIC_",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def projects_dir(self) -> Path:
        return self.data_dir / "projects"

    def model_post_init(self, __context: object) -> None:
        if self.app_env == "production" and not self.database_url:
            raise ValueError("KICETIC_DATABASE_URL is required in production.")

        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.projects_dir.mkdir(parents=True, exist_ok=True)
        self.chroma_dir.mkdir(parents=True, exist_ok=True)
        self.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.database_url:
            self.mpcvd_study_path.parent.mkdir(parents=True, exist_ok=True)


settings = Settings()
