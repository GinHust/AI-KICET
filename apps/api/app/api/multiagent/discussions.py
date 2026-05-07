from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.models.domain import (
    Discussion,
    DiscussionCreateRequest,
    ConstraintCandidate,
    ValidatedConstraint,
    ConstraintReviewState,
    NumericConstraintBound,
)
from app.api.multiagent.service import service

router = APIRouter(prefix="/discussions", tags=["discussions"])
project_router = APIRouter(prefix="/projects", tags=["discussions"])


class ClarifyRequest(BaseModel):
    question: str = Field(min_length=1)


class ClarifyResponse(BaseModel):
    refined_question: str
    needs_clarification: bool
    follow_up: str | None = None
    reasoning: str


class ConstraintPreviewResponse(BaseModel):
    candidates: list[ConstraintCandidate] = Field(default_factory=list)
    validated_constraints: list[ValidatedConstraint] = Field(default_factory=list)
    review_state: ConstraintReviewState = Field(default_factory=ConstraintReviewState)
    missing_inputs: list[str] = Field(default_factory=list)
    follow_up_questions: list[str] = Field(default_factory=list)


class DiscussionConstraintPayload(BaseModel):
    constraint_id: str = Field(min_length=1)
    text: str = Field(min_length=1)
    constraint_type: str = "assumption"
    scope: str = "session"
    why: str = ""
    source: str = "user-approved"
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    numeric_bounds: list[NumericConstraintBound] = Field(default_factory=list)


class DiscussionStreamRequest(BaseModel):
    project_id: str = "proj-ai-research-001"
    question: str = Field(min_length=1)
    num_agents: int = Field(default=4, ge=2, le=12)
    num_rounds: int = Field(default=2, ge=1, le=5)
    use_web_search: bool = True
    use_equipment_constraints: bool = False
    use_constraint_wiki: bool = True
    approved_constraints: list[DiscussionConstraintPayload] = Field(default_factory=list)
    enable_hypothesis_stage: bool = True
    debug_mode: bool = False


class ProjectDiscussionStreamRequest(BaseModel):
    question: str = Field(min_length=1)
    num_agents: int = Field(default=4, ge=2, le=12)
    num_rounds: int = Field(default=2, ge=1, le=5)
    use_web_search: bool = True
    use_equipment_constraints: bool = False
    use_constraint_wiki: bool = True
    approved_constraints: list[DiscussionConstraintPayload] = Field(default_factory=list)
    enable_hypothesis_stage: bool = True
    debug_mode: bool = False


class HypothesisExplorationRequest(BaseModel):
    goal: str = Field(min_length=1)
    num_agents: int = Field(default=4, ge=2, le=12)
    num_candidates: int = Field(default=4, ge=2, le=6)
    max_validation_passes: int = Field(default=2, ge=1, le=2)
    use_web_search: bool = True
    debug_mode: bool = False


def _format_sse(event: dict) -> str:
    event_type = event.get("event", "message")
    data = event.get("data", {})
    return f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _stream_response(event_iterator):
    def event_generator():
        try:
            for event in event_iterator:
                yield _format_sse(event)
        except ValueError as exc:
            yield _format_sse({"event": "error", "data": {"detail": str(exc)}})
        except Exception as exc:  # pragma: no cover
            yield _format_sse({"event": "error", "data": {"detail": str(exc)}})

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("", response_model=list[Discussion])
def list_discussions() -> list[Discussion]:
    return service.list_discussions()


@router.post("", response_model=Discussion)
def create_discussion(payload: DiscussionCreateRequest) -> Discussion:
    return service.create_discussion(payload)


@router.post("/clarify", response_model=ClarifyResponse)
def clarify_question(payload: ClarifyRequest) -> ClarifyResponse:
    result = service.clarify_question(payload.question)
    return ClarifyResponse(**result)


@router.get("/constraints/seeds", response_model=list[ConstraintCandidate])
def list_constraint_seeds() -> list[ConstraintCandidate]:
    return [ConstraintCandidate.model_validate(item) for item in service.list_constraint_seed_candidates()]


@router.post("/constraints/preview", response_model=ConstraintPreviewResponse)
def preview_constraints(payload: ClarifyRequest) -> ConstraintPreviewResponse:
    result = service.preview_constraints(project_id="proj-ai-research-001", question=payload.question)
    return ConstraintPreviewResponse(**result)


@router.post("/stream")
def stream_discussion(payload: DiscussionStreamRequest):
    return _stream_response(
        service.stream_discussion(
            project_id=payload.project_id,
            question=payload.question,
            num_agents=payload.num_agents,
            num_rounds=payload.num_rounds,
            use_web_search=payload.use_web_search,
            use_equipment_constraints=payload.use_equipment_constraints,
            use_constraint_wiki=payload.use_constraint_wiki,
            approved_constraints=[item.model_dump() for item in payload.approved_constraints],
            enable_hypothesis_stage=payload.enable_hypothesis_stage,
            debug_mode=payload.debug_mode,
        )
    )


@router.get("/{discussion_id}", response_model=Discussion)
def get_discussion(discussion_id: str) -> Discussion:
    discussions = service.list_discussions()
    for discussion in discussions:
        if discussion.discussion_id == discussion_id:
            return discussion
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discussion not found.")


@router.delete("/{discussion_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_discussion(discussion_id: str) -> Response:
    if not service.delete_discussion(discussion_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discussion not found.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/projects/{project_id}", response_model=list[Discussion])
def list_project_discussions(project_id: str) -> list[Discussion]:
    try:
        service.get_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.") from exc
    return [discussion for discussion in service.list_discussions() if discussion.project_id == project_id]


@router.post("/projects/{project_id}", response_model=Discussion)
def create_project_discussion(project_id: str, payload: DiscussionCreateRequest) -> Discussion:
    request_payload = DiscussionCreateRequest(project_id=project_id, question=payload.question)
    return service.create_discussion(request_payload)


def _get_project_discussions(project_id: str) -> list[Discussion]:
    try:
        service.get_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.") from exc
    return [discussion for discussion in service.list_discussions() if discussion.project_id == project_id]


@project_router.post("/{project_id}/discussions/clarify", response_model=ClarifyResponse)
def clarify_project_discussion(project_id: str, payload: ClarifyRequest) -> ClarifyResponse:
    try:
        service.get_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.") from exc
    result = service.clarify_question(payload.question)
    return ClarifyResponse(**result)


@project_router.get("/{project_id}/discussions/constraints/seeds", response_model=list[ConstraintCandidate])
def list_project_discussion_constraint_seeds(project_id: str) -> list[ConstraintCandidate]:
    try:
        service.get_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.") from exc
    return [ConstraintCandidate.model_validate(item) for item in service.list_constraint_seed_candidates()]


@project_router.post("/{project_id}/discussions/constraints/preview", response_model=ConstraintPreviewResponse)
def preview_project_discussion_constraints(project_id: str, payload: ClarifyRequest) -> ConstraintPreviewResponse:
    try:
        service.get_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.") from exc
    result = service.preview_constraints(project_id=project_id, question=payload.question)
    return ConstraintPreviewResponse(**result)


@project_router.get("/{project_id}/discussions", response_model=list[Discussion])
def list_project_discussions_compat(project_id: str) -> list[Discussion]:
    return _get_project_discussions(project_id)


@project_router.post("/{project_id}/discussions", response_model=Discussion)
def create_project_discussion_compat(project_id: str, payload: DiscussionCreateRequest) -> Discussion:
    request_payload = DiscussionCreateRequest(project_id=project_id, question=payload.question)
    return service.create_discussion(request_payload)


@project_router.post("/{project_id}/discussions/stream")
def stream_project_discussion(project_id: str, payload: ProjectDiscussionStreamRequest):
    return _stream_response(
        service.stream_discussion(
            project_id=project_id,
            question=payload.question,
            num_agents=payload.num_agents,
            num_rounds=payload.num_rounds,
            use_web_search=payload.use_web_search,
            use_equipment_constraints=payload.use_equipment_constraints,
            use_constraint_wiki=payload.use_constraint_wiki,
            approved_constraints=[item.model_dump() for item in payload.approved_constraints],
            enable_hypothesis_stage=payload.enable_hypothesis_stage,
            debug_mode=payload.debug_mode,
        )
    )


@project_router.get("/{project_id}/discussions/{discussion_id}", response_model=Discussion)
def get_project_discussion(project_id: str, discussion_id: str) -> Discussion:
    for discussion in _get_project_discussions(project_id):
        if discussion.discussion_id == discussion_id:
            return discussion
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discussion not found.")


@project_router.delete("/{project_id}/discussions/{discussion_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project_discussion(project_id: str, discussion_id: str) -> Response:
    try:
        service.get_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.") from exc
    if not service.delete_discussion(discussion_id, project_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discussion not found.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@project_router.post("/{project_id}/hypothesis-exploration/stream")
def stream_hypothesis_exploration(project_id: str, payload: HypothesisExplorationRequest):
    return _stream_response(
        service.stream_hypothesis_exploration(
            project_id=project_id,
            goal=payload.goal,
            num_agents=payload.num_agents,
            num_candidates=payload.num_candidates,
            max_validation_passes=payload.max_validation_passes,
            use_web_search=payload.use_web_search,
            debug_mode=payload.debug_mode,
        )
    )
