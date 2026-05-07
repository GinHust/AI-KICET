from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


ModuleMode = Literal["mock", "real"]
DiscussionStage = Literal["intake", "retrieval", "hypothesis", "validation", "debate", "summary"]
TrialStatus = Literal["queued", "running", "completed"]
ConfidenceLevel = Literal["low", "medium", "high"]
HypothesisVerdict = Literal["support", "mixed", "challenge"]
ConstraintType = Literal["hard", "soft", "assumption", "anti-pattern"]
ConstraintScope = Literal["global", "project", "module", "session"]
ConstraintReviewStatus = Literal["pending", "completed"]


class NumericConstraintBound(BaseModel):
    parameter: str = Field(min_length=1)
    unit: str | None = None
    min_value: float | None = None
    max_value: float | None = None
    recommended_min: float | None = None
    recommended_max: float | None = None
    nominal_value: float | None = None
    basis: str = ""
    source: str = ""
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    needs_user_confirmation: bool = True

    @field_validator("parameter", "unit", "basis", "source", mode="before")
    @classmethod
    def _strip_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return str(value).strip()

    @model_validator(mode="after")
    def _validate_ranges(self) -> "NumericConstraintBound":
        if not any(
            value is not None
            for value in [self.min_value, self.max_value, self.recommended_min, self.recommended_max, self.nominal_value]
        ):
            raise ValueError("numeric bound requires at least one numeric value")
        if self.min_value is not None and self.max_value is not None and self.min_value > self.max_value:
            raise ValueError("min_value cannot exceed max_value")
        if self.recommended_min is not None and self.recommended_max is not None and self.recommended_min > self.recommended_max:
            raise ValueError("recommended_min cannot exceed recommended_max")
        return self


class MaterialTarget(BaseModel):
    metric: str
    target_value: float
    unit: str


class ProjectSummary(BaseModel):
    project_id: str
    name: str
    material_family: str
    objective: str
    module_mode: ModuleMode
    rag_capability: str = Field(
        default="multiagent",
        description="RAG is exposed as an internal Multiagent capability rather than a standalone module.",
    )
    target: MaterialTarget
    tags: list[str] = Field(default_factory=list)
    updated_at: datetime


class AgentPerspective(BaseModel):
    agent_id: str
    role: str
    stance: str
    focus: str
    evidence_focus: list[str] = Field(default_factory=list)
    knowledge_scope: list[str] = Field(default_factory=list)
    retrieval_terms: list[str] = Field(default_factory=list)


class DiscussionSourceChunk(BaseModel):
    chunk_id: str
    document_name: str
    section_title: str
    content_preview: str


class DiscussionTurn(BaseModel):
    speaker: str
    message: str
    references: list[str] = Field(default_factory=list)
    stance: str | None = None
    agent_id: str | None = None
    evidence_ids: list[str] = Field(default_factory=list)
    source_chunks: list[DiscussionSourceChunk] = Field(default_factory=list)
    claim: str | None = None
    constraint_risks: list[str] = Field(default_factory=list)
    uncertainties: list[str] = Field(default_factory=list)
    experiment_proposal: str | None = None
    confidence: str | None = None
    bo_bridge_note: str | None = None
    structured_output: dict[str, Any] = Field(default_factory=dict)
    turn_brief: dict[str, Any] = Field(default_factory=dict)


class EvidenceItem(BaseModel):
    evidence_id: str
    title: str
    source: str
    year: int
    summary: str
    excerpt: str
    entity_keys: list[str] = Field(default_factory=list)


class GraphNode(BaseModel):
    node_id: str
    label: str
    node_type: str
    summary: str


class GraphEdge(BaseModel):
    edge_id: str
    source_node_id: str
    target_node_id: str
    relationship_type: str
    statement: str


class GraphPayload(BaseModel):
    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)


class HypothesisCandidate(BaseModel):
    hypothesis_id: str
    title: str
    statement: str
    rationale: str
    proposed_experiment: str
    source_evidence_ids: list[str] = Field(default_factory=list)
    family: Literal["analogy", "novel", "mechanistic"] = "mechanistic"
    triz_principle: str | None = None
    analogy_source: str | None = None


class HypothesisValidation(BaseModel):
    hypothesis_id: str
    agent_id: str
    agent_name: str
    verdict: HypothesisVerdict
    reasoning: str
    confidence: ConfidenceLevel
    evidence_ids: list[str] = Field(default_factory=list)
    key_test: str
    validation_pass: int = 1


class HypothesisRanking(BaseModel):
    hypothesis_id: str
    rank: int
    plausibility_score: float
    feasibility_score: float
    evidence_score: float
    novelty_score: float
    recommendation: str
    summary: str
    risk_note: str


class ConstraintCandidate(BaseModel):
    constraint_id: str
    text: str
    constraint_type: ConstraintType = "assumption"
    scope: ConstraintScope = "session"
    why: str
    source: str
    confidence: float = 0.5
    numeric_bounds: list[NumericConstraintBound] = Field(default_factory=list)
    status: Literal["candidate", "approved", "rejected"] = "candidate"
    created_at: datetime
    last_reviewed_at: datetime | None = None


class ValidatedConstraint(BaseModel):
    constraint_id: str
    text: str
    constraint_type: ConstraintType = "assumption"
    scope: ConstraintScope = "session"
    why: str
    source: str
    confidence: float = 0.5
    numeric_bounds: list[NumericConstraintBound] = Field(default_factory=list)
    status: Literal["approved", "promoted"] = "approved"
    created_at: datetime
    last_reviewed_at: datetime | None = None


class ConstraintReviewState(BaseModel):
    review_status: ConstraintReviewStatus = "pending"
    review_required: bool = False
    approved_constraint_ids: list[str] = Field(default_factory=list)
    rejected_constraint_ids: list[str] = Field(default_factory=list)
    last_reviewed_at: datetime | None = None


class Discussion(BaseModel):
    discussion_id: str
    project_id: str
    title: str
    question: str
    module_mode: ModuleMode
    stage: DiscussionStage
    summary: str
    agents: list[AgentPerspective] = Field(default_factory=list)
    hypotheses: list[HypothesisCandidate] = Field(default_factory=list)
    validations: list[HypothesisValidation] = Field(default_factory=list)
    hypothesis_rankings: list[HypothesisRanking] = Field(default_factory=list)
    constraint_candidates: list[ConstraintCandidate] = Field(default_factory=list)
    validated_constraints: list[ValidatedConstraint] = Field(default_factory=list)
    constraint_review_state: ConstraintReviewState = Field(default_factory=ConstraintReviewState)
    new_constraint_suggestions: list[ConstraintCandidate] = Field(default_factory=list)
    selected_hypothesis_id: str | None = None
    turns: list[DiscussionTurn] = Field(default_factory=list)
    next_actions: list[str] = Field(default_factory=list)
    evidence: list[EvidenceItem] = Field(default_factory=list)
    graph: GraphPayload = Field(default_factory=GraphPayload)
    open_questions: list[str] = Field(default_factory=list)
    created_at: datetime


class DiscussionCreateRequest(BaseModel):
    project_id: str = "proj-ai-research-001"
    question: str


class TrialParameter(BaseModel):
    name: str
    value: str | float | int
    unit: str | None = None


class TrialPrediction(BaseModel):
    metric: str
    expected_value: float
    unit: str
    confidence: ConfidenceLevel


class Trial(BaseModel):
    trial_id: str
    project_id: str
    recommendation_name: str
    module_mode: ModuleMode
    status: TrialStatus
    objective: str
    parameters: list[TrialParameter] = Field(default_factory=list)
    predictions: list[TrialPrediction] = Field(default_factory=list)
    rationale: list[str] = Field(default_factory=list)
    created_at: datetime


class TrialRefreshRequest(BaseModel):
    project_id: str = "proj-ai-research-001"
    objective: str = "research target KPI optimization"


class XAISummary(BaseModel):
    summary_id: str
    project_id: str
    module_mode: ModuleMode
    headline: str
    researcher_view: str
    team_lead_view: str
    executive_view: str
    recommended_actions: list[str] = Field(default_factory=list)
    supporting_signals: list[str] = Field(default_factory=list)
    generated_at: datetime


class XAISummaryRequest(BaseModel):
    project_id: str = "proj-ai-research-001"
    audience: Literal["researcher", "teamLead", "executive"] = "executive"


class HealthResponse(BaseModel):
    status: str
    environment: str
    modules: dict[str, ModuleMode]
    rag_capability: str


# ── MPCVD / Optuna BO models ──────────────────────────────────────────────────

class MpcvdTrialOut(BaseModel):
    trial_number: int
    substrate: str
    power: float | None = None
    pressure: float | None = None
    h_flow: float | None = None
    ch4_flow: float | None = None
    ch4_ratio: float | None = None
    growth_rate: float | None = None
    completed_at: datetime | None = None


class MpcvdHistoryPoint(BaseModel):
    trial_number: int
    value: float
    best_value: float


class MpcvdAppliedBound(BaseModel):
    parameter: str
    source_parameter: str
    source_constraint_id: str
    unit: str | None = None
    min_value: float | None = None
    max_value: float | None = None
    recommended_min: float | None = None
    recommended_max: float | None = None
    basis: str = ""
    source: str = ""
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)


class MpcvdRecommendConstraint(BaseModel):
    constraint_id: str = Field(min_length=1)
    numeric_bounds: list[NumericConstraintBound] = Field(default_factory=list)


class MpcvdRecommendRequest(BaseModel):
    substrate: Literal["4H SiC", "Diamond"] = "4H SiC"
    constraints: list[MpcvdRecommendConstraint] = Field(default_factory=list)


class MpcvdRecommendation(BaseModel):
    trial_number: int
    substrate: str
    power: float
    pressure: float
    h_flow: float
    ch4_flow: float
    ch4_ratio: float
    applied_bounds: list[MpcvdAppliedBound] = Field(default_factory=list)
    safety_notes: list[str] = Field(default_factory=list)


class MpcvdSubmitRequest(BaseModel):
    substrate: Literal["4H SiC", "Diamond"]
    power: float = Field(ge=0.6, le=5.0, allow_inf_nan=False)
    pressure: float = Field(ge=0.0, le=200.0, allow_inf_nan=False)
    h_flow: float = Field(ge=0.0, le=1000.0, allow_inf_nan=False)
    ch4_flow: float = Field(ge=0.0, le=100.0, allow_inf_nan=False)
    ch4_ratio: float = Field(ge=0.0, le=20.0, allow_inf_nan=False)
    growth_rate: float = Field(ge=0.0, allow_inf_nan=False)


class MpcvdImportanceOut(BaseModel):
    param: str
    importance: float


class MpcvdStats(BaseModel):
    total_trials: int
    best_growth_rate: float | None
    best_trial_number: int | None
    substrate_counts: dict[str, int]


class MpcvdStatusOut(BaseModel):
    storage: str
    study_name: str
    study_exists: bool
    total_trials: int
    completed_trials: int
    last_completed_trial_number: int | None = None
    last_completed_at: datetime | None = None
    source: Literal["real", "mock"] = "real"
