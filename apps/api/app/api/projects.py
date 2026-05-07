from datetime import datetime

from fastapi import APIRouter

from app.config import settings
from app.models.domain import MaterialTarget, ProjectSummary
from app.repositories.discussion_knowledge_repository import DiscussionKnowledgeRepository
from app.repositories.project_repository import ProjectRepository

router = APIRouter(prefix="/projects", tags=["projects"])

_repository = ProjectRepository(settings.sqlite_path, DiscussionKnowledgeRepository(settings.discussion_knowledge_dir))


@router.get("", response_model=list[ProjectSummary])
def list_projects() -> list[ProjectSummary]:
    return [
        ProjectSummary(
            project_id=project["project_id"],
            name=project["name"],
            material_family=project["material_family"],
            objective=project["objective"],
            module_mode=settings.projects_backend,
            target=MaterialTarget(
                metric=project["target_metric"],
                target_value=project["target_value"],
                unit=project["target_unit"],
            ),
            tags=project.get("keywords", []),
            updated_at=datetime.fromisoformat(project["updated_at"]),
        )
        for project in _repository.list_projects()
    ]
