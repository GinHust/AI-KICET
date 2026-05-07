from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.multiagent.discussions import project_router as project_discussions_router
from app.api.multiagent.discussions import router as discussions_router
from app.api.multiagent.graph import router as graph_router
from app.api.bo.optimizer import router as optimizer_router
from app.api.projects import router as projects_router
from app.api.surrogate import router as surrogate_router
from app.api.xai.router import router as xai_router
from app.config import settings
from app.models.domain import HealthResponse

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="KICETIC demo API with independent module routing and mock/real switch scaffolding.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.effective_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects_router, prefix=settings.api_prefix)
app.include_router(graph_router, prefix=settings.api_prefix)
app.include_router(discussions_router, prefix=settings.api_prefix)
app.include_router(project_discussions_router, prefix=settings.api_prefix)
app.include_router(optimizer_router, prefix=settings.api_prefix)
app.include_router(surrogate_router, prefix=settings.api_prefix)
app.include_router(xai_router, prefix=settings.api_prefix)


@app.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    return HealthResponse(
        status="ok",
        environment=settings.app_env,
        modules={
            "projects": settings.projects_backend,
            "discussions": settings.discussions_backend,
            "optimizer": settings.optimizer_backend,
            "xai": settings.xai_backend,
        },
        rag_capability=settings.rag_mode,
    )
