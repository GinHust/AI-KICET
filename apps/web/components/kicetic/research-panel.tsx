"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  AgentSummaryDto,
  DiscussionContextBudget,
  DiscussionPanelTurn,
  DiscussionSourceChunkDto,
  DiscussionResearchContext,
  DiscussionRoundSummary,
  DiscussionTurnBrief,
  DiscussionTurnStructuredOutput,
  EvidenceItemDto,
  HypothesisCandidateDto,
  HypothesisRankingDto,
  HypothesisValidationDto,
  ResearchGraphDto,
  ResearchGraphEdgeDto,
  ResearchGraphNodeDto,
  ResearchPanelData
} from "@kicetic/shared/contracts";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { SurfaceCard } from "@/components/ui/surface-card";
import { apiClient, getApiBaseUrl } from "@/lib/api-client";

type DiscussionAgentPayload = {
  agent_id: string;
  role: string;
  stance: string;
  focus: string;
  evidence_focus?: string[];
  knowledge_scope?: string[];
  retrieval_terms?: string[];
};

type DiscussionEvidencePayload = {
  evidence_id: string;
  title: string;
  source: string;
  year: number;
  summary: string;
  excerpt: string;
  entity_keys?: string[];
};

type DiscussionGraphNodePayload = {
  node_id: string;
  label: string;
  node_type: string;
  summary: string;
};

type DiscussionGraphEdgePayload = {
  edge_id: string;
  source_node_id: string;
  target_node_id: string;
  relationship_type: string;
  statement: string;
};

type DiscussionGraphPayload = {
  nodes?: DiscussionGraphNodePayload[];
  edges?: DiscussionGraphEdgePayload[];
};

type ClarifyResponse = {
  refined_question: string;
  needs_clarification: boolean;
  follow_up?: string | null;
  reasoning: string;
};

type NumericConstraintBoundPayload = {
  parameter: string;
  unit?: string | null;
  min_value?: number | null;
  max_value?: number | null;
  recommended_min?: number | null;
  recommended_max?: number | null;
  nominal_value?: number | null;
  basis?: string;
  source?: string;
  confidence?: number;
  needs_user_confirmation?: boolean;
};

type ConstraintCandidatePayload = {
  constraint_id: string;
  text: string;
  constraint_type: "hard" | "soft" | "assumption" | "anti-pattern";
  scope: "global" | "project" | "module" | "session";
  why: string;
  source: string;
  confidence?: number;
  numeric_bounds?: NumericConstraintBoundPayload[];
  status?: "candidate" | "approved" | "rejected";
  created_at?: string;
  last_reviewed_at?: string | null;
};

type ValidatedConstraintPayload = {
  constraint_id: string;
  text: string;
  constraint_type: "hard" | "soft" | "assumption" | "anti-pattern";
  scope: "global" | "project" | "module" | "session";
  why: string;
  source: string;
  confidence?: number;
  numeric_bounds?: NumericConstraintBoundPayload[];
  status?: "approved" | "promoted";
  created_at?: string;
  last_reviewed_at?: string | null;
};

type ConstraintReviewStatePayload = {
  review_status: "pending" | "completed";
  review_required: boolean;
  approved_constraint_ids?: string[];
  rejected_constraint_ids?: string[];
  last_reviewed_at?: string | null;
};

type ConstraintPreviewResponse = {
  candidates?: ConstraintCandidatePayload[];
  validated_constraints?: ValidatedConstraintPayload[];
  review_state?: ConstraintReviewStatePayload;
  missing_inputs?: string[];
  follow_up_questions?: string[];
};

type StoredConstraintApprovalState = {
  approved_constraints?: ValidatedConstraintPayload[];
  rejected_constraint_ids?: string[];
  updated_at?: string;
};

type StreamAgent = {
  name: string;
  expertise: string;
  perspective: string;
  community_id: string;
};

type StreamSourceChunk = {
  chunk_id: string;
  document_name: string;
  section_title: string;
  content_preview: string;
};

type StreamStructuredOutput = {
  claim?: string;
  evidence_ids?: string[];
  reasoning?: string;
  evidence_strength?: "none" | "weak" | "medium" | "strong";
  unsupported_claims?: string[];
  constraint_risks?: string[];
  uncertainties?: string[];
  experiment_proposal?: string;
  confidence?: string;
  bo_bridge_note?: string;
};

type StreamTurnBrief = StreamStructuredOutput & {
  speaker?: string;
  role?: string;
  round_num?: number;
  evidence_ids?: string[];
};

type StreamRoundSummary = {
  round_num: number;
  summary: string;
  consensus?: string[];
  disagreements?: string[];
  gaps?: string[];
  already_stated?: string[];
};

type StreamContextBudget = {
  agent_count: number;
  round_count: number;
  evidence_count: number;
  raw_turn_count: number;
  compacted_turn_count: number;
  round_summary_count?: number;
};

type StreamResearchContext = {
  context_budget?: StreamContextBudget;
  turn_briefs?: StreamTurnBrief[];
  round_summaries?: StreamRoundSummary[];
};

type StreamMessage = {
  agent_id?: string;
  agent_name: string;
  agent_expertise: string;
  community_id: string;
  round_num: number;
  content: string;
  source_chunks: StreamSourceChunk[];
  structured_output?: StreamStructuredOutput;
  turn_brief?: StreamTurnBrief;
  round_summary?: StreamRoundSummary;
};

type StreamHypothesisCandidate = {
  hypothesis_id: string;
  title: string;
  family?: "analogy" | "novel" | "mechanistic";
  triz_principle?: string | null;
  statement: string;
  rationale: string;
  proposed_experiment: string;
  analogy_source?: string | null;
  source_evidence_ids?: string[];
};

type StreamHypothesisValidation = {
  hypothesis_id: string;
  agent_id: string;
  agent_name: string;
  verdict: "support" | "mixed" | "challenge";
  reasoning: string;
  confidence: "low" | "medium" | "high";
  evidence_ids?: string[];
  key_test: string;
  validation_pass?: number;
  agent_expertise?: string;
  community_id?: string;
  source_chunks?: StreamSourceChunk[];
};

type StreamHypothesisRanking = {
  hypothesis_id: string;
  rank: number;
  plausibility_score: number;
  feasibility_score: number;
  evidence_score: number;
  novelty_score: number;
  recommendation: string;
  summary: string;
  risk_note: string;
};

type StreamDonePayload = {
  discussion_id?: string;
  run_id?: string;
  goal?: string;
  question: string;
  summary: string;
  next_actions?: string[];
  open_questions?: string[];
  agents?: DiscussionAgentPayload[];
  hypotheses?: StreamHypothesisCandidate[];
  validations?: StreamHypothesisValidation[];
  hypothesis_rankings?: StreamHypothesisRanking[];
  selected_hypothesis_id?: string | null;
  validation_passes?: number;
  validation_complete?: boolean;
  validation_gap_reasons?: string[];
  constraint_candidates?: ConstraintCandidatePayload[];
  validated_constraints?: ValidatedConstraintPayload[];
  constraint_review_state?: ConstraintReviewStatePayload;
  new_constraint_suggestions?: ConstraintCandidatePayload[];
  research_context?: StreamResearchContext;
  context_budget?: StreamContextBudget;
  round_summaries?: StreamRoundSummary[];
  evidence?: DiscussionEvidencePayload[];
  graph?: DiscussionGraphPayload;
  created_at?: string;
};

type DiscussionViewState = {
  summary: string;
  nextActions: string[];
  openQuestions: string[];
  agents: ResearchAgentCard[];
  hypotheses: HypothesisCandidateDto[];
  validations: HypothesisValidationDto[];
  hypothesisRankings: HypothesisRankingDto[];
  selectedHypothesisId: string | null;
  validatedConstraints: ValidatedConstraintPayload[];
  researchContext?: DiscussionResearchContext;
  contextBudget?: DiscussionContextBudget;
  roundSummaries?: DiscussionRoundSummary[];
  evidence: EvidenceItemDto[];
  graph: ResearchGraphDto;
};

type GraphApiResponse = {
  project_id: string;
  nodes: Array<{
    id: string;
    label: string;
    entity_type: string;
    description: string;
    aliases?: string[];
    source_chunk_ids?: string[];
    attributes?: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    relation_type: string;
    description: string;
    evidence_chunk_ids?: string[];
    confidence?: number;
  }>;
};

type AgentApiResponse = Array<{
  agent_id?: string;
  name: string;
  expertise: string;
  perspective: string;
  key_terminology?: string[];
  knowledge_scope?: string[];
}>;

type ResearchPanelProps = {
  data: ResearchPanelData;
  view?: string;
};

type WorkspaceView = "discussion" | "validation" | "graph" | "agents" | "report";

type ResearchAgentCard = AgentSummaryDto & {
  expertise?: string;
  perspective?: string;
};

type DiscussionHistoryEntry = {
  id: string;
  question: string;
  createdAt: string;
  summary: string;
  nextActions: string[];
  openQuestions: string[];
  turns: DiscussionPanelTurn[];
  agents: ResearchAgentCard[];
  hypotheses: HypothesisCandidateDto[];
  validations: HypothesisValidationDto[];
  hypothesisRankings: HypothesisRankingDto[];
  selectedHypothesisId: string | null;
  validatedConstraints: ValidatedConstraintPayload[];
  researchContext?: DiscussionResearchContext;
  contextBudget?: DiscussionContextBudget;
  roundSummaries?: DiscussionRoundSummary[];
  evidence: EvidenceItemDto[];
  graph: ResearchGraphDto;
};

type ValidationPhase = "idle" | "hypothesizing" | "validating" | "completed";
type ValidationWorkspaceTab = "hypotheses" | "validations";

type ValidationRunEntry = {
  id: string;
  goal: string;
  createdAt: string;
  summary: string;
  nextActions: string[];
  openQuestions: string[];
  agents: ResearchAgentCard[];
  hypotheses: HypothesisCandidateDto[];
  validations: HypothesisValidationDto[];
  hypothesisRankings: HypothesisRankingDto[];
  selectedHypothesisId: string | null;
  validationPasses: number;
  validationComplete: boolean;
  validationGapReasons: string[];
  evidence: EvidenceItemDto[];
};

type ReportWorkspaceItem = {
  id: string;
  title: string;
  createdAt: string | null;
  question: string;
  summary: string;
  nextActions: string[];
  openQuestions: string[];
  turns: DiscussionPanelTurn[];
  hypotheses: HypothesisCandidateDto[];
  validations: HypothesisValidationDto[];
  hypothesisRankings: HypothesisRankingDto[];
  selectedHypothesisId: string | null;
  validatedConstraints: ValidatedConstraintPayload[];
  researchContext?: DiscussionResearchContext;
  contextBudget?: DiscussionContextBudget;
  roundSummaries?: DiscussionRoundSummary[];
  evidence: EvidenceItemDto[];
};

type GeneratedReportSection = {
  id: string;
  title: string;
  body: string;
  tone: "default" | "warning";
  sources: EvidenceItemDto[];
};

type GeneratedReportWorkspaceItem = {
  id: string;
  sourceSessionId: string;
  title: string;
  createdAt: string | null;
  question: string;
  executiveSummary: string;
  keyFindings: string[];
  openQuestions: string[];
  sections: GeneratedReportSection[];
  evidence: EvidenceItemDto[];
  kind: "auto" | "manual";
};

type DiscussionPhase = "input" | "clarifying" | "preview" | "hypothesizing" | "validating" | "discussing" | "completed";

type DiscussionOptions = {
  rounds: number;
  experts: number;
  webSearch: boolean;
};

type ValidationOptions = {
  experts: number;
  maxValidationPasses: number;
};

type DiscussionApiResponse = {
  discussion_id: string;
  question: string;
  created_at: string;
  summary: string;
  next_actions?: string[];
  open_questions?: string[];
  turns?: Array<{
    speaker: string;
    stance?: string | null;
    message: string;
    references?: string[];
    agent_id?: string | null;
    evidence_ids?: string[];
    source_chunks?: StreamSourceChunk[];
    claim?: string | null;
    constraint_risks?: string[];
    uncertainties?: string[];
    experiment_proposal?: string | null;
    confidence?: string | null;
    bo_bridge_note?: string | null;
    reasoning?: string | null;
    evidence_strength?: "none" | "weak" | "medium" | "strong" | null;
    unsupported_claims?: string[];
    structured_output?: StreamStructuredOutput;
  }>;
  agents?: DiscussionAgentPayload[];
  hypotheses?: StreamHypothesisCandidate[];
  validations?: StreamHypothesisValidation[];
  hypothesis_rankings?: StreamHypothesisRanking[];
  selected_hypothesis_id?: string | null;
  constraint_candidates?: ConstraintCandidatePayload[];
  validated_constraints?: ValidatedConstraintPayload[];
  constraint_review_state?: ConstraintReviewStatePayload;
  new_constraint_suggestions?: ConstraintCandidatePayload[];
  research_context?: StreamResearchContext;
  context_budget?: StreamContextBudget;
  round_summaries?: StreamRoundSummary[];
  evidence?: DiscussionEvidencePayload[];
  graph?: DiscussionGraphPayload;
};

type RenderGraphNode = ResearchGraphNodeDto & {
  id: string;
  name: string;
  color: string;
  description?: string;
  attributes?: Record<string, unknown>;
  x?: number;
  y?: number;
  __degree?: number;
};
type RenderGraphLink = ResearchGraphEdgeDto & {
  source: string | RenderGraphNode;
  target: string | RenderGraphNode;
  color: string;
  label: string;
};

type GraphEdgeDetailView = ResearchGraphEdgeDto & {
  sourceName: string;
  targetName: string;
};

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false
});

const DEFAULT_PROJECT_ID = "proj-ai-research-001";
const HISTORY_STORAGE_KEY = "kicetic-research-history-v4";
const VALIDATION_RUN_STORAGE_KEY = "kicetic-validation-runs-v1";
const CONSTRAINT_APPROVAL_STORAGE_KEY = "kicetic-constraint-approval-state-v1";
const ADVANCED_CONTROLS_STORAGE_KEY = "kicetic-advanced-controls";
const ADVANCED_CONTROLS_EVENT_NAME = "kicetic-advanced-controls-changed";
const DEVELOPER_MODE_STORAGE_KEY = "kicetic-developer-mode";
const E2E_FAST_VALIDATION_MODE = process.env.NEXT_PUBLIC_KICETIC_E2E_FAST === "true";

const GRAPH_NODE_COLORS: Record<string, string> = {
  Material: "#4f7edb",
  ProcessCondition: "#f08b49",
  Equipment: "#2f946f",
  Phenomenon: "#7b63d4",
  Researcher: "#c75656",
  Institution: "#74839b"
};

const GRAPH_EDGE_COLORS: Record<string, string> = {
  AFFECTS: "#7b63d4",
  REQUIRES: "#f08b49",
  USES: "#2f946f",
  PRODUCES: "#4f7edb",
  RESEARCHES: "#c75656",
  AFFILIATED: "#74839b"
};

const emptyGraph: ResearchGraphDto = {
  nodes: [],
  edges: []
};

const emptyDiscussionView: DiscussionViewState = {
  summary: "연구 세션을 불러오는 중입니다.",
  nextActions: [],
  openQuestions: [],
  agents: [],
  hypotheses: [],
  validations: [],
  hypothesisRankings: [],
  selectedHypothesisId: null,
  validatedConstraints: [],
  evidence: [],
  graph: emptyGraph
};

function normalizeConstraintCandidate(item: ConstraintCandidatePayload): ConstraintCandidatePayload {
  return {
    constraint_id: item.constraint_id,
    text: item.text,
    constraint_type: item.constraint_type,
    scope: item.scope,
    why: item.why,
    source: item.source,
    confidence: item.confidence ?? 0.5,
    numeric_bounds: item.numeric_bounds ?? [],
    status: item.status ?? "candidate",
    created_at: item.created_at,
    last_reviewed_at: item.last_reviewed_at ?? null
  };
}

function normalizeValidatedConstraint(item: ValidatedConstraintPayload): ValidatedConstraintPayload {
  return {
    constraint_id: item.constraint_id,
    text: item.text,
    constraint_type: item.constraint_type,
    scope: item.scope,
    why: item.why,
    source: item.source,
    confidence: item.confidence ?? 0.5,
    numeric_bounds: item.numeric_bounds ?? [],
    status: item.status ?? "approved",
    created_at: item.created_at,
    last_reviewed_at: item.last_reviewed_at ?? null
  };
}

function formatBoundNumber(value?: number | null) {
  if (value === null || value === undefined) {
    return "?";
  }
  return Number.isInteger(value) ? value.toString() : value.toPrecision(3).replace(/\.0+$/, "");
}

function formatBoundRange(minValue?: number | null, maxValue?: number | null, unit?: string | null) {
  const suffix = unit ? ` ${unit}` : "";
  if (minValue !== null && minValue !== undefined && maxValue !== null && maxValue !== undefined) {
    return `${formatBoundNumber(minValue)}–${formatBoundNumber(maxValue)}${suffix}`;
  }
  if (minValue !== null && minValue !== undefined) {
    return `≥ ${formatBoundNumber(minValue)}${suffix}`;
  }
  if (maxValue !== null && maxValue !== undefined) {
    return `≤ ${formatBoundNumber(maxValue)}${suffix}`;
  }
  return "범위 미정";
}

function NumericBoundsList({ bounds }: { bounds?: NumericConstraintBoundPayload[] }) {
  if (!bounds?.length) {
    return null;
  }

  return (
    <div className="mt-3 grid gap-2 md:grid-cols-2">
      {bounds.map((bound) => {
        const hardRange = formatBoundRange(bound.min_value, bound.max_value, bound.unit);
        const recommendedRange = formatBoundRange(bound.recommended_min, bound.recommended_max, bound.unit);
        const hasRecommended = bound.recommended_min !== null && bound.recommended_min !== undefined || bound.recommended_max !== null && bound.recommended_max !== undefined;
        return (
          <div key={`${bound.parameter}-${hardRange}-${recommendedRange}`} className="rounded-[0.85rem] border border-research/15 bg-white/75 px-3 py-2 text-xs leading-5">
            <div className="font-semibold text-ink">{bound.parameter}</div>
            <div className="mt-1 text-soft">허용 후보: {hardRange}</div>
            {hasRecommended ? <div className="text-soft">권장 후보: {recommendedRange}</div> : null}
            {bound.nominal_value !== null && bound.nominal_value !== undefined ? <div className="text-soft">기준값: {formatBoundNumber(bound.nominal_value)}{bound.unit ? ` ${bound.unit}` : ""}</div> : null}
            {bound.basis ? <div className="mt-1 text-faint">근거: {bound.basis}</div> : null}
            <div className="mt-1 flex flex-wrap gap-1.5">
              <StatusBadge tone="neutral">confidence {(bound.confidence ?? 0.5).toFixed(2)}</StatusBadge>
              {bound.needs_user_confirmation ?? true ? <StatusBadge tone="neutral">사용자 확인 필요</StatusBadge> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function normalizeView(view?: string): WorkspaceView {
  if (view === "validation" || view === "graph" || view === "agents" || view === "report") {
    return view;
  }
  return "discussion";
}

function formatAgentDisplay(agent: Pick<ResearchAgentCard, "agentId" | "role" | "stance" | "focus">) {
  const stanceLabelMap: Record<string, string> = {
    process: "공정",
    research: "연구",
    mechanism: "메커니즘",
    scalability: "스케일업",
    decision: "의사결정",
    synthesis: "종합",
    specialist: "전문가",
    constraint: "제약",
    skeptic: "회의론",
    experiment: "실험",
    evidence: "근거",
    "bo-bridge": "BO 연결"
  };

  // Agent ID 기반 고유 매핑 (키워드 매칭보다 우선)
  const agentIdPersonas: Record<string, { personEmoji: string; domainEmoji: string; roleLabel: string; sublabel: string; summary: string }> = {
    "agent-mechanism-modeler": {
      personEmoji: "⚙️",
      domainEmoji: "🔬",
      roleLabel: "메커니즘 모델러",
      sublabel: "성장·결함·열전도 메커니즘 담당",
      summary: "공정 조건이 defect density, growth chemistry, thermal transport로 이어지는 메커니즘을 분해해 해석합니다."
    },
    "agent-constraint-auditor": {
      personEmoji: "🛡️",
      domainEmoji: "🔍",
      roleLabel: "제약 감사관",
      sublabel: "안전 경계·장비 제약 담당",
      summary: "장비 한계, validated constraint, safe boundary와 충돌하는 실험 조건을 사전에 걸러냅니다."
    },
    "agent-skeptic-failure-modes": {
      personEmoji: "🤔",
      domainEmoji: "⚠️",
      roleLabel: "회의론자·실패 분석가",
      sublabel: "인과 약점·실패 모드 담당",
      summary: "가설의 약한 인과, confounder, failure mode를 찾아 falsification test로 전환합니다."
    },
    "agent-experiment-designer": {
      personEmoji: "🧪",
      domainEmoji: "📐",
      roleLabel: "실험 설계자",
      sublabel: "DOE·측정 프로토콜 담당",
      summary: "불확실성을 다음 측정, DOE matrix, validation protocol로 변환해 실행 가능한 계획을 제시합니다."
    },
    "agent-evidence-curator": {
      personEmoji: "📚",
      domainEmoji: "🗂️",
      roleLabel: "근거 큐레이터",
      sublabel: "출처 기반 검증·근거 갭 담당",
      summary: "source-backed claim과 unsupported assumption을 분리하고 evidence ID 기반으로 근거 gap을 표시합니다."
    },
    "agent-bo-bridge-analyst": {
      personEmoji: "📊",
      domainEmoji: "🔗",
      roleLabel: "BO 브리지 분석가",
      sublabel: "Bayesian 최적화 연결 담당",
      summary: "Research 토론 결과를 safe Bayesian optimization의 변수, objective, constraint 후보로 연결합니다."
    },
    // WBG 도메인 전문가 (논문 기반)
    "wbg-agent-01": {
      personEmoji: "💎",
      domainEmoji: "📈",
      roleLabel: "MPCVD 다이아몬드 성장 전문가",
      sublabel: "성장 속도·공정 창 최적화 담당",
      summary: "MPCVD 다이아몬드 성장 조건과 공정 창 최적화를 논문 근거 기반으로 분석합니다."
    },
    "wbg-agent-02": {
      personEmoji: "🌱",
      domainEmoji: "🏔️",
      roleLabel: "핵생성 이론 전문가",
      sublabel: "Diamond 핵생성·BEN 담당",
      summary: "다이아몬드 핵생성 이론과 BEN 메커니즘을 중심으로 초기 seed 조건을 해석합니다."
    },
    "wbg-agent-03": {
      personEmoji: "🧫",
      domainEmoji: "📋",
      roleLabel: "박막·표면 과학 전문가",
      sublabel: "Thin Film·계면 분석 담당",
      summary: "다이아몬드 박막 계면과 표면 과학 관점에서 공정 조건의 영향을 검토합니다."
    },
    "wbg-agent-04": {
      personEmoji: "⚡",
      domainEmoji: "⚗️",
      roleLabel: "플라즈마 물리·화학 전문가",
      sublabel: "플라즈마 밀도·라디칼 반응 담당",
      summary: "마이크로파 플라즈마 물리와 gas-phase 화학 반응 경로를 중심으로 분석합니다."
    },
    "wbg-agent-05": {
      personEmoji: "🧱",
      domainEmoji: "💡",
      roleLabel: "SiC·와이드밴드갭 전문가",
      sublabel: "전력반도체 응용·기판 담당",
      summary: "SiC 및 와이드밴드갭 소재 관점에서 다이아몬드 전력소자 응용 가능성을 봅니다."
    },
    "wbg-agent-06": {
      personEmoji: "🩻",
      domainEmoji: "🌈",
      roleLabel: "결함·분광 분석 전문가",
      sublabel: "반도체 결함·Spectroscopy 담당",
      summary: "결함 특성과 분광 분석(Raman, PL, FTIR)을 연계해 결정 품질을 진단합니다."
    },
    "wbg-agent-07": {
      personEmoji: "📍",
      domainEmoji: "🔩",
      roleLabel: "AFM·홀더 셋업 전문가",
      sublabel: "프로브·기판 홀더 설정 담당",
      summary: "AFM probe 설정과 기판 홀더 안정성 관점에서 실험 재현성을 점검합니다."
    },
    "wbg-agent-08": {
      personEmoji: "🔋",
      domainEmoji: "📡",
      roleLabel: "2D 핵생성·수송 전문가",
      sublabel: "2D 다이아몬드·전하 수송 담당",
      summary: "2D 다이아몬드 핵생성 거동과 전하 수송 특성의 연관 관계를 분석합니다."
    },
    "wbg-agent-09": {
      personEmoji: "🏗️",
      domainEmoji: "✨",
      roleLabel: "다이아몬드 호모에피택시 전문가",
      sublabel: "단결정 성장·에피층 담당",
      summary: "다이아몬드 호모에피택시 성장 메커니즘과 단결정 품질 향상 조건을 분석합니다."
    },
    "wbg-agent-10": {
      personEmoji: "🖼️",
      domainEmoji: "🔎",
      roleLabel: "성장·결함 이미징 전문가",
      sublabel: "SEM·TEM·광학 이미징 담당",
      summary: "성장 중 결함 분포와 미세구조를 이미징 기반으로 분석해 공정 연관성을 도출합니다."
    },
    "wbg-agent-11": {
      personEmoji: "🔮",
      domainEmoji: "📷",
      roleLabel: "결정 성장·핵생성 이미징 전문가",
      sublabel: "결정 성장·핵생성 시각화 담당",
      summary: "결정 성장과 핵생성 과정을 이미징 데이터로 시각화해 구조적 완성도를 평가합니다."
    },
    "wbg-agent-12": {
      personEmoji: "🧬",
      domainEmoji: "🔵",
      roleLabel: "인 도핑·2DHG 전문가",
      sublabel: "Phosphorus 도핑·2D 홀가스 담당",
      summary: "인 도핑 다이아몬드와 2D hole gas 특성을 중심으로 전기적 성질 변화를 해석합니다."
    },
    "wbg-agent-13": {
      personEmoji: "🌀",
      domainEmoji: "🔭",
      roleLabel: "공초점 Raman·플라즈마 성장 전문가",
      sublabel: "Confocal Raman·성장 상관 분석 담당",
      summary: "공초점 Raman 분광과 플라즈마 성장 조건의 상관 관계를 심층 분석합니다."
    },
    "wbg-agent-14": {
      personEmoji: "🌾",
      domainEmoji: "🪨",
      roleLabel: "Seed 기판·핵생성 전문가",
      sublabel: "Seed 기판 선정·전처리 담당",
      summary: "Seed 기판 특성과 핵생성 조건의 상호작용을 논문 근거 기반으로 분석합니다."
    },
    "wbg-agent-15": {
      personEmoji: "🤖",
      domainEmoji: "🌿",
      roleLabel: "AE-MPCVD·Seed 성장 전문가",
      sublabel: "자율 MPCVD·Seed 성장 담당",
      summary: "자율 실험 MPCVD 공정과 Seed 성장 조건 최적화를 통합 관점에서 분석합니다."
    },
    "wbg-agent-16": {
      personEmoji: "🔄",
      domainEmoji: "🧲",
      roleLabel: "H-다이아몬드·스핀 수송 전문가",
      sublabel: "H-Diamond·스핀 상호작용 담당",
      summary: "수소 종단 다이아몬드 표면의 스핀 수송 특성과 2DHG 거동을 분석합니다."
    },
    "wbg-agent-17": {
      personEmoji: "🎛️",
      domainEmoji: "💻",
      roleLabel: "JFET·MISFET 전문가",
      sublabel: "다이아몬드 트랜지스터 소자 담당",
      summary: "다이아몬드 기반 JFET, H-다이아몬드 MISFET 구조와 고온 동작 특성을 분석합니다."
    },
    "wbg-agent-18": {
      personEmoji: "🫧",
      domainEmoji: "💊",
      roleLabel: "Seed 기판·도핑 전문가",
      sublabel: "기판 도핑·전기적 특성 담당",
      summary: "Seed 기판 도핑 조건이 전기적 특성과 성장 품질에 미치는 영향을 분석합니다."
    },
    "wbg-agent-19": {
      personEmoji: "🏛️",
      domainEmoji: "💫",
      roleLabel: "EPFL 다이아몬드 핵생성 전문가",
      sublabel: "EPFL 연구 기반 Seed 핵생성 담당",
      summary: "EPFL 연구 결과를 기반으로 다이아몬드 Seed 핵생성 메커니즘의 최신 동향을 해석합니다."
    },
    "wbg-agent-20": {
      personEmoji: "🔌",
      domainEmoji: "🔆",
      roleLabel: "CVD 다이아몬드 전력소자 전문가",
      sublabel: "전력전자 응용·공정 최적화 담당",
      summary: "CVD 다이아몬드 전력전자 응용 요구 조건과 공정 최적화 방향을 통합 관점에서 분석합니다."
    }
  };

  const idPersona = agentIdPersonas[agent.agentId];
  if (idPersona) {
    return {
      displayName: `${idPersona.personEmoji} ${idPersona.domainEmoji} ${agent.role}`,
      roleLabel: idPersona.roleLabel,
      sublabel: idPersona.sublabel,
      summary: idPersona.summary,
      stanceLabel: stanceLabelMap[agent.stance] ?? agent.stance
    };
  }

  const normalized = `${agent.agentId} ${agent.role} ${agent.focus}`.toLowerCase();

  const personaRules = [
    {
      match: ["plasma physics", "plasma", "chemistry"],
      personEmoji: "🧑‍🔬",
      domainEmoji: "⚗️",
      roleLabel: "플라즈마 화학 전문가",
      sublabel: "플라즈마·가스상 반응 담당",
      summary: "플라즈마 물리, 라디칼 chemistry, gas-phase 반응 경로를 중심으로 해석합니다."
    },
    {
      match: ["nucleation theory", "nucleation", "seed"],
      personEmoji: "🧑‍🔬",
      domainEmoji: "🌱",
      roleLabel: "핵생성 전문가",
      sublabel: "핵생성·seed 메커니즘 담당",
      summary: "seed 형성, BEN, 초기 핵생성 메커니즘과 성장 개시 조건을 중점적으로 봅니다."
    },
    {
      match: ["surface science", "thin film", "surface", "interface"],
      personEmoji: "🧑‍🔬",
      domainEmoji: "🧫",
      roleLabel: "표면·박막 전문가",
      sublabel: "표면·계면 분석 담당",
      summary: "표면 termination, 박막 계면, 오염 및 interface 안정성을 중심으로 검토합니다."
    },
    {
      match: ["raman", "ftir", "spectroscopy"],
      personEmoji: "🧑‍🔬",
      domainEmoji: "🌈",
      roleLabel: "분광 분석 전문가",
      sublabel: "Raman·FTIR 분석 담당",
      summary: "Raman, FTIR, confocal 데이터와 성장 조건의 연결성을 중점적으로 해석합니다."
    },
    {
      match: ["imaging", "microscopy"],
      personEmoji: "🧑‍🔬",
      domainEmoji: "🖼️",
      roleLabel: "이미징 분석 전문가",
      sublabel: "구조 이미징 분석 담당",
      summary: "이미징 기반 미세구조 분포와 형상 특성을 비교해 구조적 변화를 해석합니다."
    },
    {
      match: ["defect", "impurity"],
      personEmoji: "🧑‍🔬",
      domainEmoji: "🩻",
      roleLabel: "결함 분석 전문가",
      sublabel: "결함·불순물 분석 담당",
      summary: "결함, impurity, 결함 기원의 전기적·광학적 영향을 중심으로 해석합니다."
    },
    {
      match: ["transport", "spin", "2dhg"],
      personEmoji: "🧑‍🔬",
      domainEmoji: "🔋",
      roleLabel: "전하 수송 전문가",
      sublabel: "전하 수송·스핀 담당",
      summary: "2D hole gas, spin interaction, transport property를 중심으로 해석합니다."
    },
    {
      match: ["jfet", "misfet"],
      personEmoji: "🧑‍💻",
      domainEmoji: "🎛️",
      roleLabel: "트랜지스터 전문가",
      sublabel: "JFET·MISFET 담당",
      summary: "JFET, MISFET 구조와 고온 동작 관점에서 성장 조건과 소자 연계를 판단합니다."
    },
    {
      match: ["power electronics"],
      personEmoji: "🧑‍💻",
      domainEmoji: "🔌",
      roleLabel: "전력소자 응용 전문가",
      sublabel: "전력소자 응용 담당",
      summary: "power electronics 응용을 기준으로 성장 공정과 소자 요구 조건을 함께 봅니다."
    },
    {
      match: ["sic", "wide bandgap"],
      personEmoji: "🧑‍💻",
      domainEmoji: "🧱",
      roleLabel: "와이드밴드갭 기판 전문가",
      sublabel: "와이드밴드갭 기판 담당",
      summary: "SiC 및 wide bandgap substrate/interface 관점에서 응용 가능성을 봅니다."
    },
    {
      match: ["afm", "probe"],
      personEmoji: "🧑‍🏭",
      domainEmoji: "📍",
      roleLabel: "프로브 셋업 전문가",
      sublabel: "AFM probe 셋업 담당",
      summary: "AFM probe와 측정 셋업 안정성을 중심으로 실험 재현성을 점검합니다."
    },
    {
      match: ["holder", "fixture"],
      personEmoji: "🧑‍🏭",
      domainEmoji: "🗜️",
      roleLabel: "홀더 셋업 전문가",
      sublabel: "holder·fixture 담당",
      summary: "holder, fixture, 장착 안정성과 공정 일관성을 중심으로 점검합니다."
    },
    {
      match: ["phosphorus", "doping", "doped"],
      personEmoji: "🧑‍🔬",
      domainEmoji: "🧪",
      roleLabel: "도핑 전문가",
      sublabel: "인 도핑 담당",
      summary: "phosphorus 도핑과 도핑에 따른 전기적 특성 변화를 중심으로 해석합니다."
    },
    {
      match: ["crystal growth"],
      personEmoji: "🧑‍🔬",
      domainEmoji: "💠",
      roleLabel: "결정 성장 전문가",
      sublabel: "결정 성장 분석 담당",
      summary: "seed 위 결정 성장과 품질 변화를 중심으로 구조적 완성도를 해석합니다."
    },
    {
      match: ["synthesis", "growth", "fabrication"],
      personEmoji: "🧑‍🔬",
      domainEmoji: "🔬",
      roleLabel: "합성·공정 전문가",
      sublabel: "재료 합성·공정 최적화 담당",
      summary: "합성 조건, 공정 파라미터 제어, 성장/반응 메커니즘 최적화를 중심으로 해석합니다."
    }
  ] as const;

  const matchedPersona = personaRules.find((rule) => rule.match.some((keyword) => normalized.includes(keyword)));


  const personEmoji = matchedPersona?.personEmoji ?? "🧑‍🔬";
  const domainEmoji = matchedPersona?.domainEmoji ?? "🧠";

  return {
    displayName: `${personEmoji} ${domainEmoji} ${agent.role}`,
    roleLabel: matchedPersona?.roleLabel ?? "연구 에이전트",
    sublabel: matchedPersona?.sublabel ?? "연구 분석 담당",
    summary: matchedPersona?.summary ?? "현재 질문과 연결된 근거, 가설, 실험 맥락을 종합해 해석합니다.",
    stanceLabel: stanceLabelMap[agent.stance] ?? agent.stance
  };
}

function toAgentCard(agent: DiscussionAgentPayload): ResearchAgentCard {
  return {
    agentId: agent.agent_id,
    role: agent.role,
    stance: agent.stance,
    focus: agent.focus,
    evidenceFocus: agent.evidence_focus ?? [],
    knowledgeScope: agent.knowledge_scope ?? [],
    retrievalTerms: agent.retrieval_terms ?? [],
    expertise: agent.focus,
    perspective: agent.focus
  };
}

function toAgentCardFromSeed(agent: AgentSummaryDto): ResearchAgentCard {
  return {
    ...agent,
    expertise: agent.focus,
    perspective: agent.focus
  };
}

function toEvidenceItem(item: DiscussionEvidencePayload): EvidenceItemDto {
  return {
    evidenceId: item.evidence_id,
    title: item.title,
    source: item.source,
    year: item.year,
    summary: item.summary,
    excerpt: item.excerpt,
    entityKeys: item.entity_keys ?? []
  };
}

function toDiscussionSourceChunk(item: StreamSourceChunk): DiscussionSourceChunkDto {
  return {
    chunkId: item.chunk_id,
    documentName: item.document_name,
    sectionTitle: item.section_title,
    contentPreview: item.content_preview
  };
}

function toHypothesisCandidate(item: StreamHypothesisCandidate): HypothesisCandidateDto {
  return {
    hypothesisId: item.hypothesis_id,
    title: item.title,
    family: item.family,
    trizPrinciple: item.triz_principle ?? null,
    statement: item.statement,
    rationale: item.rationale,
    proposedExperiment: item.proposed_experiment,
    analogySource: item.analogy_source ?? null,
    sourceEvidenceIds: item.source_evidence_ids ?? []
  };
}

function toHypothesisValidation(item: StreamHypothesisValidation): HypothesisValidationDto {
  return {
    hypothesisId: item.hypothesis_id,
    agentId: item.agent_id,
    agentName: item.agent_name,
    verdict: item.verdict,
    reasoning: item.reasoning,
    confidence: item.confidence,
    evidenceIds: item.evidence_ids ?? [],
    keyTest: item.key_test,
    validationPass: item.validation_pass ?? 1
  };
}

function toHypothesisRanking(item: StreamHypothesisRanking): HypothesisRankingDto {
  return {
    hypothesisId: item.hypothesis_id,
    rank: item.rank,
    plausibilityScore: item.plausibility_score,
    feasibilityScore: item.feasibility_score,
    evidenceScore: item.evidence_score,
    noveltyScore: item.novelty_score,
    recommendation: item.recommendation,
    summary: item.summary,
    riskNote: item.risk_note
  };
}

function toStructuredOutput(item?: StreamStructuredOutput): DiscussionTurnStructuredOutput | undefined {
  if (!item) {
    return undefined;
  }
  const output: DiscussionTurnStructuredOutput = {
    claim: item.claim,
    evidenceIds: Array.isArray(item.evidence_ids) ? item.evidence_ids : undefined,
    reasoning: item.reasoning,
    evidenceStrength: item.evidence_strength,
    unsupportedClaims: item.unsupported_claims ?? [],
    constraintRisks: item.constraint_risks ?? [],
    uncertainties: item.uncertainties ?? [],
    experimentProposal: item.experiment_proposal,
    confidence: item.confidence,
    boBridgeNote: item.bo_bridge_note
  };
  const hasValue = Object.values(output).some((value) => (Array.isArray(value) ? value.length > 0 : Boolean(value)));
  return hasValue ? output : undefined;
}

function toTurnBrief(item: StreamTurnBrief): DiscussionTurnBrief {
  return {
    speaker: item.speaker ?? "",
    role: item.role,
    roundNum: item.round_num,
    claim: item.claim,
    evidenceIds: Array.isArray(item.evidence_ids) ? item.evidence_ids : undefined,
    reasoning: item.reasoning,
    evidenceStrength: item.evidence_strength,
    unsupportedClaims: item.unsupported_claims ?? [],
    constraintRisks: item.constraint_risks ?? [],
    uncertainties: item.uncertainties ?? [],
    experimentProposal: item.experiment_proposal,
    confidence: item.confidence,
    boBridgeNote: item.bo_bridge_note
  };
}

function toRoundSummary(item: StreamRoundSummary): DiscussionRoundSummary {
  return {
    roundNum: item.round_num,
    summary: item.summary,
    consensus: item.consensus ?? [],
    disagreements: item.disagreements ?? [],
    gaps: item.gaps ?? [],
    alreadyStated: item.already_stated ?? []
  };
}

function toContextBudget(item?: StreamContextBudget): DiscussionContextBudget | undefined {
  if (!item) {
    return undefined;
  }
  return {
    agentCount: item.agent_count,
    roundCount: item.round_count,
    evidenceCount: item.evidence_count,
    rawTurnCount: item.raw_turn_count,
    compactedTurnCount: item.compacted_turn_count,
    roundSummaryCount: item.round_summary_count
  };
}

function toResearchContext(payload?: StreamResearchContext, contextBudget?: StreamContextBudget, roundSummaries?: StreamRoundSummary[]): DiscussionResearchContext | undefined {
  const nextBudget = toContextBudget(payload?.context_budget ?? contextBudget);
  const nextRoundSummaries = (payload?.round_summaries ?? roundSummaries ?? []).map(toRoundSummary);
  const nextTurnBriefs = (payload?.turn_briefs ?? []).map(toTurnBrief);
  if (!nextBudget && nextRoundSummaries.length === 0 && nextTurnBriefs.length === 0) {
    return undefined;
  }
  return {
    contextBudget: nextBudget,
    roundSummaries: nextRoundSummaries,
    turnBriefs: nextTurnBriefs
  };
}

function toGraphNode(node: DiscussionGraphNodePayload): ResearchGraphNodeDto {
  return {
    nodeId: node.node_id,
    label: node.label,
    nodeType: node.node_type,
    summary: node.summary,
    citations: []
  };
}

function toGraphEdge(edge: DiscussionGraphEdgePayload): ResearchGraphEdgeDto {
  return {
    edgeId: edge.edge_id,
    sourceNodeId: edge.source_node_id,
    targetNodeId: edge.target_node_id,
    relationshipType: edge.relationship_type,
    statement: edge.statement,
    evidenceIds: []
  };
}

function toGraphNodeFromApi(node: GraphApiResponse["nodes"][number]): RenderGraphNode {
  return {
    nodeId: node.id,
    id: node.id,
    name: node.label,
    label: node.label,
    nodeType: node.entity_type,
    color: GRAPH_NODE_COLORS[node.entity_type] ?? "#74839b",
    summary: node.description,
    description: node.description,
    citations: node.source_chunk_ids ?? [],
    attributes: node.attributes ?? {}
  };
}

function toGraphEdgeFromApi(edge: GraphApiResponse["edges"][number]): ResearchGraphEdgeDto {
  return {
    edgeId: edge.id,
    sourceNodeId: edge.source,
    targetNodeId: edge.target,
    relationshipType: edge.relation_type,
    statement: edge.description,
    evidenceIds: edge.evidence_chunk_ids ?? []
  };
}

function toAgentCardFromApi(agent: AgentApiResponse[number], index: number): ResearchAgentCard {
  return {
    agentId: agent.agent_id ?? `agent-${index + 1}`,
    role: agent.name,
    stance: "specialist",
    focus: agent.perspective || agent.expertise,
    evidenceFocus: agent.key_terminology ?? [],
    knowledgeScope: agent.knowledge_scope ?? [],
    retrievalTerms: agent.key_terminology ?? [],
    expertise: agent.expertise,
    perspective: agent.perspective
  };
}

function readHistory(): DiscussionHistoryEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as DiscussionHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistory(entries: DiscussionHistoryEntry[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries.slice(0, 10)));
  } catch {
    // ignore storage failures
  }
}

function readValidationRuns(): ValidationRunEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(VALIDATION_RUN_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as ValidationRunEntry[];
    return Array.isArray(parsed)
      ? parsed.map((entry) => ({
          ...entry,
          validationPasses: entry.validationPasses ?? 1,
          validationComplete: entry.validationComplete ?? true,
          validationGapReasons: entry.validationGapReasons ?? [],
          validations: (entry.validations ?? []).map((validation) => ({ ...validation, validationPass: validation.validationPass ?? 1 }))
        }))
      : [];
  } catch {
    return [];
  }
}

function writeValidationRuns(entries: ValidationRunEntry[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(VALIDATION_RUN_STORAGE_KEY, JSON.stringify(entries.slice(0, 10)));
  } catch {
    // ignore storage failures
  }
}

function readConstraintApprovalState() {
  if (typeof window === "undefined") {
    return { approvedConstraints: [] as ValidatedConstraintPayload[], rejectedConstraintIds: [] as string[] };
  }

  try {
    const raw = window.localStorage.getItem(CONSTRAINT_APPROVAL_STORAGE_KEY);
    if (!raw) {
      return { approvedConstraints: [] as ValidatedConstraintPayload[], rejectedConstraintIds: [] as string[] };
    }
    const parsed = JSON.parse(raw) as StoredConstraintApprovalState;
    return {
      approvedConstraints: Array.isArray(parsed.approved_constraints) ? parsed.approved_constraints.map(normalizeValidatedConstraint) : [],
      rejectedConstraintIds: Array.isArray(parsed.rejected_constraint_ids) ? parsed.rejected_constraint_ids : []
    };
  } catch {
    return { approvedConstraints: [] as ValidatedConstraintPayload[], rejectedConstraintIds: [] as string[] };
  }
}

function writeConstraintApprovalState(approvedConstraints: ValidatedConstraintPayload[], rejectedConstraintIds: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const state: StoredConstraintApprovalState = {
      approved_constraints: approvedConstraints,
      rejected_constraint_ids: rejectedConstraintIds,
      updated_at: new Date().toISOString()
    };
    window.localStorage.setItem(CONSTRAINT_APPROVAL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    return;
  }
}

function readAdvancedControlsEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(ADVANCED_CONTROLS_STORAGE_KEY) === "true";
}

function readDeveloperModeEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(DEVELOPER_MODE_STORAGE_KEY) === "true";
}

function toDiscussionTurnsFromApi(turns?: DiscussionApiResponse["turns"]): DiscussionPanelTurn[] {
  return (turns ?? []).map((turn) => {
    const fallbackOutput: DiscussionTurnStructuredOutput = {
      claim: turn.claim ?? undefined,
      evidenceIds: Array.isArray(turn.evidence_ids) ? turn.evidence_ids : undefined,
      reasoning: turn.reasoning ?? undefined,
      evidenceStrength: turn.evidence_strength ?? undefined,
      unsupportedClaims: turn.unsupported_claims ?? [],
      constraintRisks: turn.constraint_risks ?? [],
      uncertainties: turn.uncertainties ?? [],
      experimentProposal: turn.experiment_proposal ?? undefined,
      confidence: turn.confidence ?? undefined,
      boBridgeNote: turn.bo_bridge_note ?? undefined
    };
    const structuredOutput = toStructuredOutput(turn.structured_output) ?? fallbackOutput;
    return {
      agent: turn.speaker,
      stance: turn.stance ?? "insight",
      message: turn.message,
      references: turn.references ?? [],
      agentId: turn.agent_id ?? undefined,
      evidenceIds: Array.isArray(structuredOutput.evidenceIds) ? structuredOutput.evidenceIds : turn.evidence_ids ?? [],
      sourceChunks: (turn.source_chunks ?? []).map(toDiscussionSourceChunk),
      claim: structuredOutput.claim,
      reasoning: structuredOutput.reasoning,
      evidenceStrength: structuredOutput.evidenceStrength,
      unsupportedClaims: structuredOutput.unsupportedClaims,
      constraintRisks: structuredOutput.constraintRisks,
      uncertainties: structuredOutput.uncertainties,
      experimentProposal: structuredOutput.experimentProposal,
      confidence: structuredOutput.confidence,
      boBridgeNote: structuredOutput.boBridgeNote,
      structuredOutput
    } satisfies DiscussionPanelTurn;
  });
}

function toHistoryEntryFromApi(item: DiscussionApiResponse): DiscussionHistoryEntry {
  const researchContext = toResearchContext(item.research_context, item.context_budget, item.round_summaries);
  return {
    id: item.discussion_id,
    question: item.question,
    createdAt: item.created_at,
    summary: item.summary,
    nextActions: item.next_actions ?? [],
    openQuestions: item.open_questions ?? [],
    turns: toDiscussionTurnsFromApi(item.turns),
    agents: (item.agents ?? []).map(toAgentCard),
    hypotheses: (item.hypotheses ?? []).map(toHypothesisCandidate),
    validations: (item.validations ?? []).map(toHypothesisValidation),
    hypothesisRankings: (item.hypothesis_rankings ?? []).map(toHypothesisRanking),
    selectedHypothesisId: item.selected_hypothesis_id ?? null,
    validatedConstraints: (item.validated_constraints ?? []).map(normalizeValidatedConstraint),
    researchContext,
    contextBudget: researchContext?.contextBudget,
    roundSummaries: researchContext?.roundSummaries,
    evidence: (item.evidence ?? []).map(toEvidenceItem),
    graph: {
      nodes: (item.graph?.nodes ?? []).map(toGraphNode),
      edges: (item.graph?.edges ?? []).map(toGraphEdge)
    }
  };
}

function mergeHistoryEntries(
  serverEntries: DiscussionHistoryEntry[],
  localEntries: DiscussionHistoryEntry[]
): DiscussionHistoryEntry[] {
  const serverIds = new Set(serverEntries.map((entry) => entry.id));
  const manualEntries = localEntries.filter(
    (entry) => entry.id.startsWith("generated-") || entry.id.startsWith("session-") || !serverIds.has(entry.id)
  );

  return [...serverEntries, ...manualEntries]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 10);
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${month}-${day} ${hour}:${minute} UTC`;
}

function buildReportSections(item: ReportWorkspaceItem): GeneratedReportSection[] {
  const selectedHypothesis = item.hypotheses.find((entry) => entry.hypothesisId === item.selectedHypothesisId) ?? item.hypotheses[0];
  const selectedRanking = item.hypothesisRankings.find((entry) => entry.hypothesisId === item.selectedHypothesisId) ?? item.hypothesisRankings[0];
  const selectedHypothesisId = selectedHypothesis?.hypothesisId ?? item.selectedHypothesisId;
  const selectedValidations = selectedHypothesisId
    ? item.validations.filter((entry) => entry.hypothesisId === selectedHypothesisId)
    : item.validations.slice(0, 3);
  const contextBudget = item.contextBudget ?? item.researchContext?.contextBudget;
  const constraintRisks = Array.from(new Set(item.turns.flatMap((turn) => turn.constraintRisks ?? turn.structuredOutput?.constraintRisks ?? []))).slice(0, 5);
  const experimentProposals = Array.from(new Set(item.turns.map((turn) => turn.experimentProposal ?? turn.structuredOutput?.experimentProposal).filter(Boolean) as string[])).slice(0, 5);

  return [
    {
      id: "summary",
      title: "핵심 요약",
      body: item.summary,
      tone: "default",
      sources: item.evidence.slice(0, 3)
    },
    {
      id: "context-budget",
      title: "Context budget / 압축 상태",
      body: contextBudget
        ? [
            `Agents: ${contextBudget.agentCount}`,
            `Rounds: ${contextBudget.roundCount}`,
            `Evidence: ${contextBudget.evidenceCount}`,
            `Raw turns: ${contextBudget.rawTurnCount}`,
            `Compacted briefs: ${contextBudget.compactedTurnCount}`
          ].join("\n")
        : "이번 세션의 context budget 정보가 없습니다.",
      tone: "default",
      sources: item.evidence.slice(0, 2)
    },
    {
      id: "structured-actions",
      title: "Constraint risks / Experiment proposals",
      body: [
        constraintRisks.length > 0 ? `Constraint risks\n${constraintRisks.map((risk) => `- ${risk}`).join("\n")}` : "Constraint risks\n- 별도 표시된 constraint risk가 없습니다.",
        experimentProposals.length > 0 ? `Experiment proposals\n${experimentProposals.map((proposal) => `- ${proposal}`).join("\n")}` : "Experiment proposals\n- 별도 표시된 experiment proposal이 없습니다."
      ].join("\n\n"),
      tone: constraintRisks.length > 0 ? "warning" : "default",
      sources: item.evidence.slice(0, 4)
    },
    {
      id: "hypothesis",
      title: "핵심 가설",
      body: selectedHypothesis
        ? [
            selectedHypothesis.title,
            selectedHypothesis.statement,
            selectedHypothesis.rationale,
            selectedHypothesis.proposedExperiment ? `판별 실험: ${selectedHypothesis.proposedExperiment}` : ""
          ]
            .filter(Boolean)
            .join("\n\n")
        : "선택된 가설이 아직 없습니다.",
      tone: "default",
      sources: item.evidence.slice(0, 4)
    },
    {
      id: "validation",
      title: "검증 의견 요약",
      body:
        selectedValidations.length > 0
          ? selectedValidations
              .map(
                (entry) =>
                  `${entry.agentName} · ${entry.verdict} · ${entry.confidence}\n${entry.reasoning}${entry.keyTest ? `\n판별 포인트: ${entry.keyTest}` : ""}`
              )
              .join("\n\n")
          : "가설 검증 의견이 아직 정리되지 않았습니다.",
      tone: "default",
      sources: item.evidence.slice(0, 4)
    },
    {
      id: "findings",
      title: "주요 실행 항목",
      body: item.nextActions.length > 0 ? item.nextActions.join("\n") : "저장된 실행 항목이 없습니다.",
      tone: "default",
      sources: item.evidence.slice(0, 4)
    },
    {
      id: "risk",
      title: "가설 리스크와 비교 포인트",
      body: selectedRanking
        ? [selectedRanking.summary, selectedRanking.recommendation, selectedRanking.riskNote].filter(Boolean).join("\n\n")
        : "가설 ranking 정보가 아직 없습니다.",
      tone: "warning",
      sources: item.evidence.slice(0, 3)
    },
    {
      id: "questions",
      title: "열린 질문",
      body: item.openQuestions.length > 0 ? item.openQuestions.join("\n") : "열린 질문이 아직 정리되지 않았습니다.",
      tone: "warning",
      sources: item.evidence.slice(0, 2)
    },
    {
      id: "evidence",
      title: "근거 하이라이트",
      body:
        item.evidence.slice(0, 4).map((entry) => `${entry.title} — ${entry.summary}`).join("\n\n") ||
        "표시할 근거가 없습니다.",
      tone: "default",
      sources: item.evidence.slice(0, 6)
    }
  ];
}

function buildGeneratedReport(item: ReportWorkspaceItem, index: number): GeneratedReportWorkspaceItem {
  return {
    id: `report-${item.id}`,
    sourceSessionId: item.id,
    title: index === 0 ? "최신 보고서" : `저장 보고서 ${index + 1}`,
    createdAt: item.createdAt,
    question: item.question,
    executiveSummary: item.summary,
    keyFindings: item.nextActions,
    openQuestions: item.openQuestions,
    sections: buildReportSections(item),
    evidence: item.evidence,
    kind: item.id === "live-session" ? "auto" : "manual"
  };
}

function buildValidationRunEntry(goal: string, payload: StreamDonePayload): ValidationRunEntry {
  return {
    id: payload.run_id ?? `validation-${payload.created_at ?? new Date().toISOString()}`,
    goal,
    createdAt: payload.created_at ?? new Date().toISOString(),
    summary: payload.summary,
    nextActions: payload.next_actions ?? [],
    openQuestions: payload.open_questions ?? [],
    agents: (payload.agents ?? []).map(toAgentCard),
    hypotheses: (payload.hypotheses ?? []).map(toHypothesisCandidate),
    validations: (payload.validations ?? []).map(toHypothesisValidation),
    hypothesisRankings: (payload.hypothesis_rankings ?? []).map(toHypothesisRanking),
    selectedHypothesisId: payload.selected_hypothesis_id ?? null,
    validationPasses: payload.validation_passes ?? 1,
    validationComplete: payload.validation_complete ?? true,
    validationGapReasons: payload.validation_gap_reasons ?? [],
    evidence: (payload.evidence ?? []).map(toEvidenceItem)
  };
}

function mergeGraphs(baseGraph: ResearchGraphDto, nextGraph: ResearchGraphDto): ResearchGraphDto {
  const nodeMap = new Map(baseGraph.nodes.map((node) => [node.nodeId, node]));
  const edgeMap = new Map(baseGraph.edges.map((edge) => [edge.edgeId, edge]));

  nextGraph.nodes.forEach((node) => {
    nodeMap.set(node.nodeId, node);
  });
  nextGraph.edges.forEach((edge) => {
    edgeMap.set(edge.edgeId, edge);
  });

  return {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values())
  };
}

function HypothesisWorkspaceSection({
  hypotheses,
  validations,
  hypothesisRankings,
  selectedHypothesisId,
  compact = false
}: {
  hypotheses: HypothesisCandidateDto[];
  validations: HypothesisValidationDto[];
  hypothesisRankings: HypothesisRankingDto[];
  selectedHypothesisId: string | null;
  compact?: boolean;
}) {
  const initialHypothesisId = selectedHypothesisId ?? hypotheses[0]?.hypothesisId ?? null;
  const [focusedHypothesisId, setFocusedHypothesisId] = useState<string | null>(initialHypothesisId);
  const [workspaceTab, setWorkspaceTab] = useState<ValidationWorkspaceTab>("hypotheses");
  const [expandedValidationKeys, setExpandedValidationKeys] = useState<string[]>([]);

  useEffect(() => {
    setFocusedHypothesisId(initialHypothesisId);
    setWorkspaceTab("hypotheses");
    setExpandedValidationKeys([]);
  }, [initialHypothesisId]);

  if (hypotheses.length === 0) {
    return compact ? null : (
      <SurfaceCard className="rounded-panel p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-faint">브레인 스토밍</div>
            <h4 className="mt-2 text-xl font-semibold text-ink">AI 랜덤 가설 설정</h4>
            <p className="mt-2 text-sm leading-6 text-soft">목표를 입력하면 AI가 가설 후보를 만들고, 전문가 의견과 우선순위를 함께 정리합니다.</p>
          </div>
          <StatusBadge tone="neutral">대기중</StatusBadge>
        </div>
      </SurfaceCard>
    );
  }

  const focusedHypothesis = hypotheses.find((entry) => entry.hypothesisId === focusedHypothesisId) ?? hypotheses[0];
  const focusedRanking = hypothesisRankings.find((entry) => entry.hypothesisId === focusedHypothesis?.hypothesisId) ?? hypothesisRankings[0];
  const focusedValidations = focusedHypothesis
    ? validations.filter((entry) => entry.hypothesisId === focusedHypothesis.hypothesisId)
    : [];
  const formatValidationKey = (validation: HypothesisValidationDto, index: number) => `${validation.hypothesisId}-${validation.agentId}-${validation.validationPass ?? 1}-${index}`;
  const allValidationsExpanded =
    focusedValidations.length > 0 &&
    focusedValidations.every((validation, index) => expandedValidationKeys.includes(formatValidationKey(validation, index)));

  function toggleValidationExpansion(validationKey: string) {
    setExpandedValidationKeys((current) =>
      current.includes(validationKey) ? current.filter((item) => item !== validationKey) : [...current, validationKey]
    );
  }

  function toggleAllValidations() {
    if (allValidationsExpanded) {
      setExpandedValidationKeys((current) =>
        current.filter((item) => !focusedValidations.some((validation, index) => formatValidationKey(validation, index) === item))
      );
      return;
    }

    setExpandedValidationKeys((current) => {
      const next = new Set(current);
      focusedValidations.forEach((validation, index) => {
        next.add(formatValidationKey(validation, index));
      });
      return Array.from(next);
    });
  }

  return (
    <SurfaceCard className={`rounded-panel ${compact ? "p-5" : "p-6"}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-faint">{compact ? "브레인 스토밍 요약" : "브레인 스토밍"}</div>
          <h4 className="mt-2 text-xl font-semibold text-ink">{compact ? "AI 가설 생성 요약" : "AI 랜덤 가설 설정 워크스페이스"}</h4>
          <p className="mt-2 text-sm leading-6 text-soft">
            {compact
              ? "선택된 가설과 검증 의견을 먼저 정리한 뒤 전문가 토론으로 이어집니다."
              : "선택 가설을 먼저 읽고, 비교와 검증 의견을 분리해서 검토할 수 있도록 정리했습니다."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone="research">가설 {hypotheses.length}개</StatusBadge>
          <StatusBadge tone="neutral">검증 {validations.length}건</StatusBadge>
        </div>
      </div>

      {compact && focusedHypothesis ? (
        <div className="mt-4 rounded-[1.1rem] border border-line/70 bg-white/78 px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-faint">선택된 가설</div>
              <div className="mt-2 text-sm font-semibold text-ink">{focusedHypothesis.title}</div>
              <p className="mt-2 text-sm leading-6 text-soft">{focusedHypothesis.statement}</p>
            </div>
            <Link href="/dashboard/research?view=validation" className="text-xs font-medium uppercase tracking-[0.22em] text-research">
              브레인 스토밍에서 보기
            </Link>
          </div>
        </div>
      ) : null}

      {!compact && focusedHypothesis ? (
        <>
          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
            <div className="rounded-[1.2rem] border border-research/24 bg-[rgba(228,239,255,0.84)] px-5 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs uppercase tracking-[0.22em] text-faint">선택된 가설</div>
                  <div className="mt-2 text-xl font-semibold text-ink">{focusedHypothesis.title}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge tone="research">{focusedRanking ? `#${focusedRanking.rank}` : "선택"}</StatusBadge>
                  <StatusBadge tone="neutral">검증 {focusedValidations.length}건</StatusBadge>
                </div>
              </div>
              <p className="mt-4 text-base leading-7 text-ink">{focusedHypothesis.statement}</p>
              {focusedHypothesis.rationale ? <p className="mt-3 text-sm leading-6 text-soft">{focusedHypothesis.rationale}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {focusedHypothesis.family ? <StatusBadge tone="neutral">{focusedHypothesis.family}</StatusBadge> : null}
                {focusedHypothesis.trizPrinciple ? <StatusBadge tone="research">TRIZ {focusedHypothesis.trizPrinciple}</StatusBadge> : null}
                {focusedHypothesis.analogySource ? <StatusBadge tone="neutral">Analogy {focusedHypothesis.analogySource}</StatusBadge> : null}
              </div>
            </div>

            <div className="grid gap-3">
              <div className="rounded-[1rem] border border-line/70 bg-white/84 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.22em] text-faint">판별 실험</div>
                <p className="mt-2 text-sm leading-6 text-soft">{focusedHypothesis.proposedExperiment || "판별 실험이 아직 정리되지 않았습니다."}</p>
              </div>
              <div className="rounded-[1rem] border border-line/70 bg-white/84 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.22em] text-faint">추천과 리스크</div>
                <div className="mt-2 space-y-2 text-sm leading-6 text-soft">
                  <p>{focusedRanking?.recommendation ?? "추천 코멘트가 아직 정리되지 않았습니다."}</p>
                  {focusedRanking?.riskNote ? <p className="text-faint">{focusedRanking.riskNote}</p> : null}
                </div>
              </div>
              {focusedRanking ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-[0.95rem] border border-line/70 bg-white/78 px-3 py-3">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-faint">plausibility</div>
                    <div className="mt-1 text-base font-semibold text-ink">{focusedRanking.plausibilityScore.toFixed(2)}</div>
                  </div>
                  <div className="rounded-[0.95rem] border border-line/70 bg-white/78 px-3 py-3">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-faint">feasibility</div>
                    <div className="mt-1 text-base font-semibold text-ink">{focusedRanking.feasibilityScore.toFixed(2)}</div>
                  </div>
                  <div className="rounded-[0.95rem] border border-line/70 bg-white/78 px-3 py-3">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-faint">evidence</div>
                    <div className="mt-1 text-base font-semibold text-ink">{focusedRanking.evidenceScore.toFixed(2)}</div>
                  </div>
                  <div className="rounded-[0.95rem] border border-line/70 bg-white/78 px-3 py-3">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-faint">novelty</div>
                    <div className="mt-1 text-base font-semibold text-ink">{focusedRanking.noveltyScore.toFixed(2)}</div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-5 inline-flex flex-wrap gap-2 rounded-full border border-line bg-white/70 p-1">
            {[
              { key: "hypotheses" as const, label: "가설 비교" },
              { key: "validations" as const, label: "검증 의견" }
            ].map((tab) => {
              const isActive = tab.key === workspaceTab;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setWorkspaceTab(tab.key)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    isActive ? "bg-research text-white shadow-card" : "text-soft hover:bg-surface-muted"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {workspaceTab === "hypotheses" ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {hypotheses.map((hypothesis) => {
                const isFocused = focusedHypothesis.hypothesisId === hypothesis.hypothesisId;
                const ranking = hypothesisRankings.find((entry) => entry.hypothesisId === hypothesis.hypothesisId);
                const relatedValidations = validations.filter((entry) => entry.hypothesisId === hypothesis.hypothesisId);
                return (
                  <button
                    key={hypothesis.hypothesisId}
                    type="button"
                    onClick={() => setFocusedHypothesisId(hypothesis.hypothesisId)}
                    className={`rounded-[1.15rem] border px-4 py-4 text-left transition ${
                      isFocused
                        ? "border-research/32 bg-[rgba(228,239,255,0.82)] shadow-card"
                        : "border-line/70 bg-white/82 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-ink">{hypothesis.title}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {hypothesis.family ? <StatusBadge tone="neutral">{hypothesis.family}</StatusBadge> : null}
                          {hypothesis.trizPrinciple ? <StatusBadge tone="research">TRIZ {hypothesis.trizPrinciple}</StatusBadge> : null}
                        </div>
                      </div>
                      <StatusBadge tone={isFocused ? "research" : "neutral"}>{ranking ? `#${ranking.rank}` : "후보"}</StatusBadge>
                    </div>
                    <p className="mt-3 line-clamp-3 text-sm leading-6 text-soft">{hypothesis.statement}</p>
                    {ranking ? (
                      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-faint">
                        <div>plausibility {ranking.plausibilityScore.toFixed(2)}</div>
                        <div>feasibility {ranking.feasibilityScore.toFixed(2)}</div>
                        <div>evidence {ranking.evidenceScore.toFixed(2)}</div>
                        <div>novelty {ranking.noveltyScore.toFixed(2)}</div>
                      </div>
                    ) : null}
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-faint">
                      <span>검증 {relatedValidations.length}건</span>
                      {hypothesis.proposedExperiment ? <span className="line-clamp-1 max-w-[70%]">{hypothesis.proposedExperiment}</span> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-[1.15rem] border border-line/70 bg-white/76 px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-faint">선택 가설 검증 의견</div>
                  <div className="mt-1 text-sm font-semibold text-ink">{focusedHypothesis.title}</div>
                </div>
                {focusedValidations.length > 0 ? (
                  <button type="button" onClick={toggleAllValidations} className="text-xs font-medium uppercase tracking-[0.22em] text-research">
                    {allValidationsExpanded ? "모두 접기" : "모두 펼치기"}
                  </button>
                ) : null}
              </div>

              {focusedValidations.length > 0 ? (
                <div className="mt-4 grid gap-3 xl:grid-cols-2">
                  {focusedValidations.map((validation, index) => {
                    const validationKey = formatValidationKey(validation, index);
                    const isExpanded = expandedValidationKeys.includes(validationKey);
                    return (
                      <div key={validationKey} className="rounded-[1rem] border border-line/70 bg-white/84 px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-semibold text-ink">{validation.agentName}</div>
                            <div className="mt-1 text-xs text-faint">{validation.verdict} · {validation.confidence}</div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {(validation.validationPass ?? 1) > 1 ? <StatusBadge tone="neutral">2차 검증</StatusBadge> : null}
                            <StatusBadge tone="neutral">{validation.agentId}</StatusBadge>
                          </div>
                        </div>
                        <p className={`mt-3 text-sm leading-6 text-soft ${isExpanded ? "" : "line-clamp-4"}`}>{validation.reasoning}</p>
                        {validation.keyTest ? (
                          <div className="mt-3 rounded-[0.9rem] border border-line/60 bg-surface-muted/65 px-3 py-3 text-xs leading-5 text-faint">
                            판별 포인트 · {validation.keyTest}
                          </div>
                        ) : null}
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div className="text-xs text-faint">전문가 의견 전문</div>
                          <button
                            type="button"
                            onClick={() => toggleValidationExpansion(validationKey)}
                            className="text-xs font-medium uppercase tracking-[0.22em] text-research"
                          >
                            {isExpanded ? "의견 접기" : "의견 펼치기"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-4 rounded-[1rem] border border-dashed border-line/70 bg-white/60 px-4 py-4 text-sm text-soft">
                  아직 이 가설에 대한 검증 의견을 수집하는 중입니다.
                </div>
              )}
            </div>
          )}
        </>
      ) : null}
    </SurfaceCard>
  );
}

function formatGraphAttributeValue(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

export function ResearchPanel({ data, view }: ResearchPanelProps) {
  const router = useRouter();
  const [question, setQuestion] = useState(data.query);
  const [validationGoal, setValidationGoal] = useState(data.query);
  const [activeDiscussion, setActiveDiscussion] = useState<DiscussionPanelTurn[]>(data.discussion);
  const [status, setStatus] = useState<string>("전문가 토론 세션을 불러오는 중입니다.");
  const [isRunning, setIsRunning] = useState(false);
  const [discussionView, setDiscussionView] = useState<DiscussionViewState>({
    summary: data.summary ?? emptyDiscussionView.summary,
    nextActions: data.nextActions ?? [],
    openQuestions: data.openQuestions ?? [],
    agents: (data.agents ?? []).map(toAgentCardFromSeed),
    hypotheses: data.hypotheses ?? [],
    validations: data.validations ?? [],
    hypothesisRankings: data.hypothesisRankings ?? [],
    selectedHypothesisId: data.selectedHypothesisId ?? null,
    validatedConstraints: [],
    evidence: data.evidence ?? [],
    graph: data.graph ?? emptyGraph
  });
  const [projectAgents, setProjectAgents] = useState<ResearchAgentCard[]>((data.agents ?? []).map(toAgentCardFromSeed));
  const [projectGraph, setProjectGraph] = useState<{ nodes: RenderGraphNode[]; edges: ResearchGraphEdgeDto[] }>({
    nodes: (data.graph?.nodes ?? []).map((node) => ({
      ...node,
      id: node.nodeId,
      name: node.label,
      color: GRAPH_NODE_COLORS[node.nodeType] ?? "#74839b",
      description: node.summary,
      attributes: {}
    })),
    edges: data.graph?.edges ?? []
  });
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(data.agents?.[0]?.agentId ?? null);
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(data.agents?.[0]?.agentId ?? null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [graphDetailMode, setGraphDetailMode] = useState<"node" | "edge" | null>(null);
  const [graphSearch, setGraphSearch] = useState("");
  const [graphTypeFilter, setGraphTypeFilter] = useState<string[]>([]);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [discussionPhase, setDiscussionPhase] = useState<DiscussionPhase>(activeDiscussion.length > 0 ? "completed" : "input");
  const [validationPhase, setValidationPhase] = useState<ValidationPhase>(data.hypotheses?.length ? "completed" : "idle");
  const [discussionOptions, setDiscussionOptions] = useState<DiscussionOptions>({ rounds: 3, experts: 6, webSearch: true });
  const [validationOptions, setValidationOptions] = useState<ValidationOptions>({ experts: 6, maxValidationPasses: 2 });
  const [refinedQuestion, setRefinedQuestion] = useState("");
  const [needsClarification, setNeedsClarification] = useState(false);
  const [followUpQuestion, setFollowUpQuestion] = useState<string | null>(null);
  const [followUpAnswer, setFollowUpAnswer] = useState("");
  const [clarifyReasoning, setClarifyReasoning] = useState("");
  const [constraintCandidates, setConstraintCandidates] = useState<ConstraintCandidatePayload[]>([]);
  const [seedConstraintCandidates, setSeedConstraintCandidates] = useState<ConstraintCandidatePayload[]>([]);
  const [approvedConstraints, setApprovedConstraints] = useState<ValidatedConstraintPayload[]>([]);
  const [persistedRejectedConstraintIds, setPersistedRejectedConstraintIds] = useState<string[]>([]);
  const [isAdvancedMode, setIsAdvancedMode] = useState(false);
  const [isDeveloperMode, setIsDeveloperMode] = useState(false);
  const [constraintMissingInputs, setConstraintMissingInputs] = useState<string[]>([]);
  const [constraintFollowUps, setConstraintFollowUps] = useState<string[]>([]);
  const [constraintReviewState, setConstraintReviewState] = useState<ConstraintReviewStatePayload>({
    review_status: "pending",
    review_required: false,
    approved_constraint_ids: [],
    rejected_constraint_ids: [],
    last_reviewed_at: null
  });
  const [expandedTurnKey, setExpandedTurnKey] = useState<string | null>(null);
  const [history, setHistory] = useState<DiscussionHistoryEntry[]>([]);
  const [validationRuns, setValidationRuns] = useState<ValidationRunEntry[]>([]);
  const [selectedValidationRunId, setSelectedValidationRunId] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [reportQuestion, setReportQuestion] = useState("");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [expandedReportSectionIds, setExpandedReportSectionIds] = useState<string[]>(["summary"]);
  const [expandedReportSourceIds, setExpandedReportSourceIds] = useState<string[]>([]);
  const [isReportEvidenceExpanded, setIsReportEvidenceExpanded] = useState(false);
  const [sessionGeneratedAt, setSessionGeneratedAt] = useState<string | null>(null);
  const graphContainerRef = useRef<HTMLDivElement | null>(null);
  const fullscreenGraphContainerRef = useRef<HTMLDivElement | null>(null);
  const forceGraphRef = useRef<any>(null);
  const activeDiscussionRef = useRef<DiscussionPanelTurn[]>(activeDiscussion);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [graphSize, setGraphSize] = useState({ width: 920, height: 640 });
  const [isGraphFullscreen, setIsGraphFullscreen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const hasBootstrapped = useRef(false);
  const hasLoadedGraph = useRef(false);
  const [graphLoadState, setGraphLoadState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [graphDisplayLimit, setGraphDisplayLimit] = useState(200);

  const workspaceView = normalizeView(view);
  const graphNodeLabelMap = useMemo(
    () => new Map(projectGraph.nodes.map((node) => [node.nodeId, node.label])),
    [projectGraph.nodes]
  );
  const selectedNode = projectGraph.nodes.find((node) => node.nodeId === selectedNodeId) ?? null;
  const selectedEdge = projectGraph.edges.find((edge) => edge.edgeId === selectedEdgeId) ?? null;
  const selectedEdgeDetail = useMemo<GraphEdgeDetailView | null>(() => {
    if (!selectedEdge) {
      return null;
    }
    return {
      ...selectedEdge,
      sourceName: graphNodeLabelMap.get(selectedEdge.sourceNodeId) ?? selectedEdge.sourceNodeId,
      targetName: graphNodeLabelMap.get(selectedEdge.targetNodeId) ?? selectedEdge.targetNodeId
    };
  }, [graphNodeLabelMap, selectedEdge]);
  const graphTypes = useMemo(
    () => Array.from(new Set(projectGraph.nodes.map((node) => node.nodeType))).sort(),
    [projectGraph.nodes]
  );
  const adjacentNodeIds = useMemo(() => {
    if (!hoveredNodeId) {
      return new Set<string>();
    }

    return projectGraph.edges.reduce((acc, edge) => {
      if (edge.sourceNodeId === hoveredNodeId) {
        acc.add(edge.targetNodeId);
      }
      if (edge.targetNodeId === hoveredNodeId) {
        acc.add(edge.sourceNodeId);
      }
      return acc;
    }, new Set<string>([hoveredNodeId]));
  }, [projectGraph.edges, hoveredNodeId]);
  const filteredGraphNodes = useMemo(() => {
    const keyword = graphSearch.trim().toLowerCase();
    const matchedNodeIds = new Set(
      projectGraph.nodes
        .filter((node) => {
          const matchesType = graphTypeFilter.length === 0 || graphTypeFilter.includes(node.nodeType);
          const matchesKeyword =
            !keyword ||
            node.label.toLowerCase().includes(keyword) ||
            node.summary.toLowerCase().includes(keyword) ||
            node.nodeType.toLowerCase().includes(keyword);
          return matchesType && matchesKeyword;
        })
        .map((node) => node.nodeId)
    );

    if (!keyword) {
      return projectGraph.nodes.filter((node) => matchedNodeIds.has(node.nodeId));
    }

    const expandedNodeIds = new Set(matchedNodeIds);
    projectGraph.edges.forEach((edge) => {
      if (matchedNodeIds.has(edge.sourceNodeId) || matchedNodeIds.has(edge.targetNodeId)) {
        expandedNodeIds.add(edge.sourceNodeId);
        expandedNodeIds.add(edge.targetNodeId);
      }
    });

    return projectGraph.nodes.filter((node) => expandedNodeIds.has(node.nodeId));
  }, [projectGraph.nodes, projectGraph.edges, graphSearch, graphTypeFilter]);
  const filteredNodeIds = useMemo(() => new Set(filteredGraphNodes.map((node) => node.nodeId)), [filteredGraphNodes]);
  const filteredGraphEdges = useMemo(
    () =>
      projectGraph.edges.filter(
        (edge) => filteredNodeIds.has(edge.sourceNodeId) && filteredNodeIds.has(edge.targetNodeId)
      ),
    [projectGraph.edges, filteredNodeIds]
  );
  const filteredGraphSummary = useMemo(
    () => `${filteredGraphNodes.length} entities, ${filteredGraphEdges.length} relationships`,
    [filteredGraphEdges.length, filteredGraphNodes.length]
  );
  const { graphDegreeMap, graphNeighborMap } = useMemo(() => {
    const degreeMap = new Map<string, number>();
    const neighborMap = new Map<string, Set<string>>();
    filteredGraphNodes.forEach((node) => {
      degreeMap.set(node.nodeId, 0);
      neighborMap.set(node.nodeId, new Set());
    });
    filteredGraphEdges.forEach((edge) => {
      degreeMap.set(edge.sourceNodeId, (degreeMap.get(edge.sourceNodeId) ?? 0) + 1);
      degreeMap.set(edge.targetNodeId, (degreeMap.get(edge.targetNodeId) ?? 0) + 1);
      neighborMap.get(edge.sourceNodeId)?.add(edge.targetNodeId);
      neighborMap.get(edge.targetNodeId)?.add(edge.sourceNodeId);
    });
    return { graphDegreeMap: degreeMap, graphNeighborMap: neighborMap };
  }, [filteredGraphEdges, filteredGraphNodes]);
  const renderGraphData = useMemo(() => {
    const sorted = [...filteredGraphNodes].sort(
      (a, b) => (graphDegreeMap.get(b.nodeId) ?? 0) - (graphDegreeMap.get(a.nodeId) ?? 0)
    );
    const capped = sorted.slice(0, graphDisplayLimit);
    const cappedIds = new Set(capped.map((n) => n.nodeId));
    return {
      nodes: capped.map((node) => ({
        ...node,
        id: node.nodeId,
        name: node.label,
        color: GRAPH_NODE_COLORS[node.nodeType] ?? "#74839b",
        __degree: graphDegreeMap.get(node.nodeId) ?? 0
      })),
      links: filteredGraphEdges
        .filter((e) => cappedIds.has(e.sourceNodeId) && cappedIds.has(e.targetNodeId))
        .map((edge) => ({
          ...edge,
          source: edge.sourceNodeId,
          target: edge.targetNodeId,
          color: GRAPH_EDGE_COLORS[edge.relationshipType] ?? "#9aa4b2",
          label: edge.relationshipType.replaceAll("_", " ")
        }))
    };
  }, [filteredGraphEdges, filteredGraphNodes, graphDegreeMap, graphDisplayLimit]);
  const linkedEvidence = useMemo(() => {
    const nodeId = selectedNode?.nodeId;
    return discussionView.evidence.filter((item) => (nodeId ? item.entityKeys.includes(nodeId) : false));
  }, [discussionView.evidence, selectedNode?.nodeId]);
  const selectedEdgeEvidence = useMemo(() => {
    if (!selectedEdge?.evidenceIds?.length) {
      return [];
    }
    const evidenceIdSet = new Set(selectedEdge.evidenceIds);
    return discussionView.evidence.filter((item) => evidenceIdSet.has(item.evidenceId));
  }, [discussionView.evidence, selectedEdge]);
  const reportItems = useMemo<ReportWorkspaceItem[]>(() => {
    const items: ReportWorkspaceItem[] = [];

    if (activeDiscussion.length > 0) {
      items.push({
        id: "live-session",
        title: "현재 세션",
        createdAt: sessionGeneratedAt,
        question,
        summary: discussionView.summary,
        nextActions: discussionView.nextActions,
        openQuestions: discussionView.openQuestions,
        turns: activeDiscussion,
        hypotheses: discussionView.hypotheses,
        validations: discussionView.validations,
        hypothesisRankings: discussionView.hypothesisRankings,
        selectedHypothesisId: discussionView.selectedHypothesisId,
        validatedConstraints: discussionView.validatedConstraints,
        researchContext: discussionView.researchContext,
        contextBudget: discussionView.contextBudget,
        roundSummaries: discussionView.roundSummaries,
        evidence: discussionView.evidence
      });
    }

    history.forEach((entry, index) => {
      items.push({
        id: entry.id,
        title: index === 0 ? "가장 최근 저장 세션" : `저장 세션 ${history.length - index}`,
        createdAt: entry.createdAt,
        question: entry.question,
        summary: entry.summary,
        nextActions: entry.nextActions,
        openQuestions: entry.openQuestions,
        turns: entry.turns,
        hypotheses: entry.hypotheses,
        validations: entry.validations,
        hypothesisRankings: entry.hypothesisRankings,
        selectedHypothesisId: entry.selectedHypothesisId,
        validatedConstraints: entry.validatedConstraints ?? [],
        researchContext: entry.researchContext,
        contextBudget: entry.contextBudget,
        roundSummaries: entry.roundSummaries,
        evidence: entry.evidence
      });
    });

    return items;
  }, [
    activeDiscussion,
    discussionView.evidence,
    discussionView.hypotheses,
    discussionView.hypothesisRankings,
    discussionView.contextBudget,
    discussionView.nextActions,
    discussionView.openQuestions,
    discussionView.selectedHypothesisId,
    discussionView.researchContext,
    discussionView.roundSummaries,
    discussionView.summary,
    discussionView.validatedConstraints,
    discussionView.validations,
    history,
    question,
    sessionGeneratedAt
  ]);
  const generatedReports = useMemo(
    () => reportItems.map((item, index) => buildGeneratedReport(item, index)),
    [reportItems]
  );
  const selectedReport = generatedReports.find((item) => item.id === selectedReportId) ?? generatedReports[0] ?? null;
  const selectedValidationRun = validationRuns.find((item) => item.id === selectedValidationRunId) ?? validationRuns[0] ?? null;
  const isValidationRequestRunning = isRunning && workspaceView === "validation" && (validationPhase === "hypothesizing" || validationPhase === "validating");
  const approvedConstraintIdSet = useMemo(
    () => new Set(approvedConstraints.map((item) => item.constraint_id)),
    [approvedConstraints]
  );
  const previewApprovedCount = constraintCandidates.filter((item) => approvedConstraintIdSet.has(item.constraint_id)).length;
  const seedApprovedCount = seedConstraintCandidates.filter((item) => approvedConstraintIdSet.has(item.constraint_id)).length;

  function toggleReportSection(sectionId: string) {
    setExpandedReportSectionIds((current) =>
      current.includes(sectionId) ? current.filter((item) => item !== sectionId) : [...current, sectionId]
    );
  }

  function toggleReportSources(sectionId: string) {
    setExpandedReportSourceIds((current) =>
      current.includes(sectionId) ? current.filter((item) => item !== sectionId) : [...current, sectionId]
    );
  }

  function handleGenerateReport() {
    const baseSession = reportItems[0];
    if (!baseSession) {
      setStatus("생성할 토론 세션이 아직 없습니다.");
      return;
    }

    setIsGeneratingReport(true);
    const nextQuestion = reportQuestion.trim() || baseSession.question;
    const nextSession: ReportWorkspaceItem = {
      ...baseSession,
      id: `generated-${baseSession.id}`,
      title: "새로 생성한 보고서",
      createdAt: new Date().toISOString(),
      question: nextQuestion,
      summary: baseSession.summary,
      nextActions: baseSession.nextActions,
      openQuestions: baseSession.openQuestions,
      turns: baseSession.turns,
      evidence: baseSession.evidence
    };

    const nextEntry: DiscussionHistoryEntry = {
      id: nextSession.id,
      question: nextSession.question,
      createdAt: nextSession.createdAt ?? new Date().toISOString(),
      summary: nextSession.summary,
      nextActions: nextSession.nextActions,
      openQuestions: nextSession.openQuestions,
      turns: nextSession.turns,
      agents: discussionView.agents,
      hypotheses: discussionView.hypotheses,
      validations: discussionView.validations,
      hypothesisRankings: discussionView.hypothesisRankings,
      selectedHypothesisId: discussionView.selectedHypothesisId,
      validatedConstraints: discussionView.validatedConstraints,
      evidence: nextSession.evidence,
      graph: discussionView.graph
    };

    setHistory((current) => {
      const deduped = [nextEntry, ...current.filter((item) => item.id !== nextEntry.id)].slice(0, 10);
      writeHistory(deduped);
      return deduped;
    });
    setSelectedReportId(`report-${nextSession.id}`);
    setExpandedReportSectionIds(["summary"]);
    setExpandedReportSourceIds([]);
    setIsReportEvidenceExpanded(false);
    setStatus("세션 기반 보고서를 생성했습니다.");
    setIsGeneratingReport(false);
  }

  async function loadProjectGraph() {
    if (hasLoadedGraph.current) return;
    hasLoadedGraph.current = true;
    setGraphLoadState("loading");
    setGraphDisplayLimit(200);
    try {
      const graphResponse = await apiClient<GraphApiResponse>(`/api/projects/${DEFAULT_PROJECT_ID}/graph`);
      const allNodes = graphResponse.nodes.map(toGraphNodeFromApi);
      const allEdges = graphResponse.edges.map(toGraphEdgeFromApi);
      setProjectGraph({ nodes: allNodes, edges: allEdges });
      setGraphLoadState("done");
    } catch {
      hasLoadedGraph.current = false;
      setGraphLoadState("error");
    }
  }

  async function loadProjectContext() {
    const [agentsResponse, discussionsResponse] = await Promise.all([
      apiClient<AgentApiResponse>(`/api/projects/${DEFAULT_PROJECT_ID}/agents`),
      apiClient<DiscussionApiResponse[]>(`/api/projects/${DEFAULT_PROJECT_ID}/discussions`)
    ]);

    const nextProjectAgents = agentsResponse.map(toAgentCardFromApi);
    const serverHistory = discussionsResponse.map(toHistoryEntryFromApi);

    setProjectAgents(nextProjectAgents);
    setHistory((current) => {
      const nextHistory = mergeHistoryEntries(serverHistory, current);
      writeHistory(nextHistory);
      return nextHistory;
    });
    setSelectedAgentId((current) => current ?? nextProjectAgents[0]?.agentId ?? null);
    setExpandedAgentId((current) => current ?? nextProjectAgents[0]?.agentId ?? null);
  }

  async function loadSeedConstraints() {
    const response = await apiClient<ConstraintCandidatePayload[]>(`/api/projects/${DEFAULT_PROJECT_ID}/discussions/constraints/seeds`);
    const nextCandidates = response.map(normalizeConstraintCandidate);
    const storedApprovalState = readConstraintApprovalState();
    const rejectedIds = new Set(storedApprovalState.rejectedConstraintIds);
    setSeedConstraintCandidates(nextCandidates);
    setPersistedRejectedConstraintIds(storedApprovalState.rejectedConstraintIds);
    setApprovedConstraints((current) => {
      const merged = new Map((current.length > 0 ? current : storedApprovalState.approvedConstraints).map((item) => [item.constraint_id, item]));
      nextCandidates.forEach((candidate) => {
        if (!rejectedIds.has(candidate.constraint_id)) {
          merged.set(candidate.constraint_id, normalizeValidatedConstraint({ ...candidate, status: "approved" }));
        }
      });
      const next = Array.from(merged.values());
      writeConstraintApprovalState(next, storedApprovalState.rejectedConstraintIds);
      return next;
    });
  }

  async function runDiscussion(finalQuestion: string) {
    const trimmedQuestion = finalQuestion.trim();
    if (!trimmedQuestion) {
      return;
    }

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setDiscussionPhase("discussing");
    setIsRunning(true);
    setStatus("전문가 토론 스트림을 연결하고 있습니다.");
    setActiveDiscussion([]);
    setExpandedTurnKey(null);
    setDiscussionView((current) => ({
      ...current,
      summary: "토론 결과를 수집하는 중입니다.",
      nextActions: [],
      openQuestions: [],
      agents: [],
      hypotheses: [],
      validations: [],
      hypothesisRankings: [],
      selectedHypothesisId: null,
      validatedConstraints: [],
      evidence: [],
      graph: current.graph
    }));

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/projects/${DEFAULT_PROJECT_ID}/discussions/stream`, {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          question: trimmedQuestion,
          num_agents: E2E_FAST_VALIDATION_MODE ? 2 : discussionOptions.experts,
          num_rounds: E2E_FAST_VALIDATION_MODE ? 1 : discussionOptions.rounds,
          use_web_search: E2E_FAST_VALIDATION_MODE ? false : discussionOptions.webSearch,
          use_equipment_constraints: false,
          use_constraint_wiki: true,
          approved_constraints: approvedConstraints.map((item) => ({
            constraint_id: item.constraint_id,
            text: item.text,
            constraint_type: item.constraint_type,
            scope: item.scope,
            why: item.why,
            source: item.source,
            confidence: item.confidence ?? 0.5,
            numeric_bounds: item.numeric_bounds ?? []
          })),
          enable_hypothesis_stage: true,
          debug_mode: E2E_FAST_VALIDATION_MODE
        })
      });

      if (!response.ok || !response.body) {
        throw new Error(`API ${response.status} ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamedAgents: ResearchAgentCard[] = [];
      let streamedHypotheses: HypothesisCandidateDto[] = [];
      let streamedValidations: HypothesisValidationDto[] = [];
      let streamedRankings: HypothesisRankingDto[] = [];
      let streamedSelectedHypothesisId: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const eventBlock of events) {
          const lines = eventBlock.trim().split("\n");
          let eventType = "message";
          let dataLine = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7);
            } else if (line.startsWith("data: ")) {
              dataLine = line.slice(6);
            }
          }

          if (!dataLine) {
            continue;
          }

          const parsed = JSON.parse(dataLine) as Record<string, unknown>;

          if (eventType === "status") {
            setStatus(String(parsed.message ?? ""));
            continue;
          }

          if (eventType === "agents") {
            streamedAgents = ((parsed.agents_used as StreamAgent[] | undefined) ?? []).map((agent, index) =>
              toAgentCardFromApi(
                {
                  agent_id: `${agent.community_id || "stream-community"}-${index + 1}`,
                  name: agent.name,
                  expertise: agent.expertise,
                  perspective: agent.perspective,
                  key_terminology: [],
                  knowledge_scope: []
                },
                index
              )
            );
            setDiscussionView((current) => ({
              ...current,
              agents: streamedAgents
            }));
            setSelectedAgentId(streamedAgents[0]?.agentId ?? null);
            setExpandedAgentId(streamedAgents[0]?.agentId ?? null);
            continue;
          }

          if (eventType === "hypotheses") {
            streamedHypotheses = ((parsed.candidates as StreamHypothesisCandidate[] | undefined) ?? []).map(toHypothesisCandidate);
            setDiscussionPhase("hypothesizing");
            setDiscussionView((current) => ({
              ...current,
              hypotheses: streamedHypotheses,
              validations: [],
              hypothesisRankings: [],
              selectedHypothesisId: null
            }));
            setStatus(`가설 후보 ${streamedHypotheses.length}개를 정리했습니다.`);
            continue;
          }

          if (eventType === "hypothesis_start") {
            setDiscussionPhase("validating");
            setStatus(`${String(parsed.title ?? "가설")} 검증 의견을 수집 중입니다.`);
            continue;
          }

          if (eventType === "validation") {
            const payload = parsed as unknown as StreamHypothesisValidation;
            const nextValidation = toHypothesisValidation(payload);
            streamedValidations = [...streamedValidations, nextValidation];
            setDiscussionPhase("validating");
            setDiscussionView((current) => ({
              ...current,
              validations: streamedValidations
            }));
            setStatus(`${payload.agent_name} 검증 의견을 반영했습니다.`);
            continue;
          }

          if (eventType === "hypothesis_ranking") {
            streamedRankings = ((parsed.ranked_candidates as StreamHypothesisRanking[] | undefined) ?? []).map(toHypothesisRanking);
            setDiscussionView((current) => ({
              ...current,
              hypothesisRankings: streamedRankings
            }));
            setStatus("가설 우선순위를 정리했습니다.");
            continue;
          }

          if (eventType === "hypothesis_selected") {
            streamedSelectedHypothesisId = String(parsed.hypothesis_id ?? "") || null;
            setDiscussionView((current) => ({
              ...current,
              selectedHypothesisId: streamedSelectedHypothesisId
            }));
            setStatus(`${String(parsed.title ?? "선택 가설")}을 중심으로 토론을 이어갑니다.`);
            continue;
          }

          if (eventType === "round_start") {
            const roundNum = Number(parsed.round_num ?? 0);
            setDiscussionPhase("discussing");
            setStatus(`라운드 ${roundNum} 토론을 진행 중입니다.`);
            continue;
          }

          if (eventType === "message") {
            const payload = parsed as unknown as StreamMessage;
            const structuredOutput = toStructuredOutput(payload.structured_output);
            const evidenceIds = structuredOutput && Array.isArray(structuredOutput.evidenceIds)
              ? structuredOutput.evidenceIds
              : payload.source_chunks?.map((chunk) => chunk.chunk_id) ?? [];
            const turn = {
              agent: payload.agent_name,
              stance: payload.agent_expertise || "insight",
              message: payload.content,
              references: payload.source_chunks?.map((chunk) => chunk.section_title) ?? [],
              agentId: payload.agent_id ?? (payload.community_id === "moderator" ? "moderator" : undefined),
              evidenceIds,
              sourceChunks: (payload.source_chunks ?? []).map(toDiscussionSourceChunk),
              claim: structuredOutput?.claim,
              reasoning: structuredOutput?.reasoning,
              evidenceStrength: structuredOutput?.evidenceStrength,
              unsupportedClaims: structuredOutput?.unsupportedClaims,
              constraintRisks: structuredOutput?.constraintRisks,
              uncertainties: structuredOutput?.uncertainties,
              experimentProposal: structuredOutput?.experimentProposal,
              confidence: structuredOutput?.confidence,
              boBridgeNote: structuredOutput?.boBridgeNote,
              structuredOutput
            } satisfies DiscussionPanelTurn;
            setActiveDiscussion((current) => [...current, turn]);
            setStatus(`${payload.agent_name} 응답을 수신했습니다.`);
            continue;
          }

          if (eventType === "done") {
            const payload = parsed as unknown as StreamDonePayload;
            const researchContext = toResearchContext(payload.research_context, payload.context_budget, payload.round_summaries);
            const nextView: DiscussionViewState = {
              summary: payload.summary,
              nextActions: payload.next_actions ?? [],
              openQuestions: payload.open_questions ?? [],
              agents: (payload.agents ?? []).map(toAgentCard),
              hypotheses: (payload.hypotheses ?? []).map(toHypothesisCandidate),
              validations: (payload.validations ?? []).map(toHypothesisValidation),
              hypothesisRankings: (payload.hypothesis_rankings ?? []).map(toHypothesisRanking),
              selectedHypothesisId: payload.selected_hypothesis_id ?? null,
              validatedConstraints: (payload.validated_constraints ?? []).map(normalizeValidatedConstraint),
              researchContext,
              contextBudget: researchContext?.contextBudget,
              roundSummaries: researchContext?.roundSummaries,
              evidence: (payload.evidence ?? []).map(toEvidenceItem),
              graph: {
                nodes: (payload.graph?.nodes ?? []).map(toGraphNode),
                edges: (payload.graph?.edges ?? []).map(toGraphEdge)
              }
            };
            const generatedAt = payload.created_at ?? new Date().toISOString();
            const latestTurns = activeDiscussionRef.current;
            const historyEntry: DiscussionHistoryEntry = {
              id: payload.discussion_id ?? `session-${generatedAt}`,
              question: trimmedQuestion,
              createdAt: generatedAt,
              summary: nextView.summary,
              nextActions: nextView.nextActions,
              openQuestions: nextView.openQuestions,
              turns: latestTurns,
              agents: nextView.agents,
              hypotheses: nextView.hypotheses,
              validations: nextView.validations,
              hypothesisRankings: nextView.hypothesisRankings,
              selectedHypothesisId: nextView.selectedHypothesisId,
              validatedConstraints: nextView.validatedConstraints,
              researchContext: nextView.researchContext,
              contextBudget: nextView.contextBudget,
              roundSummaries: nextView.roundSummaries,
              evidence: nextView.evidence.slice(0, 8),
              graph: nextView.graph
            };

            setQuestion(trimmedQuestion);
            setRefinedQuestion(trimmedQuestion);
            setDiscussionView((current) => ({
              ...current,
              ...nextView,
              graph: mergeGraphs(current.graph, nextView.graph)
            }));
            setSelectedAgentId(nextView.agents[0]?.agentId ?? streamedAgents[0]?.agentId ?? null);
            setExpandedAgentId(nextView.agents[0]?.agentId ?? streamedAgents[0]?.agentId ?? null);
            setSelectedNodeId((current) => current ?? nextView.graph.nodes[0]?.nodeId ?? null);
            setSelectedEdgeId((current) => current ?? nextView.graph.edges[0]?.edgeId ?? null);
            setStatus(payload.summary);
            setDiscussionPhase("completed");
            setSessionGeneratedAt(generatedAt);
            setSelectedReportId("report-live-session");
            setHistory((current) => {
              const deduped = [historyEntry, ...current.filter((item) => item.id !== historyEntry.id)].slice(0, 10);
              writeHistory(deduped);
              return deduped;
            });
            continue;
          }

          if (eventType === "error") {
            throw new Error(String(parsed.detail ?? "토론 요청을 처리하지 못했습니다."));
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      setDiscussionPhase("input");
      setStatus(error instanceof Error ? error.message : "토론 요청을 처리하지 못했습니다.");
    } finally {
      setIsRunning(false);
    }
  }

  async function runHypothesisExploration(goal: string) {
    const trimmedGoal = goal.trim();
    if (!trimmedGoal) {
      return;
    }

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setValidationGoal(trimmedGoal);
    setValidationPhase("hypothesizing");
    setIsRunning(true);
    setStatus("브레인 스토밍 스트림을 연결하고 있습니다.");

    const baseRunId = `validation-${Date.now()}`;
    let streamedAgents: ResearchAgentCard[] = [];
    let streamedHypotheses: HypothesisCandidateDto[] = [];
    let streamedValidations: HypothesisValidationDto[] = [];
    let streamedRankings: HypothesisRankingDto[] = [];
    let streamedSelectedHypothesisId: string | null = null;

    setValidationRuns((current) => {
      const placeholder: ValidationRunEntry = {
        id: baseRunId,
        goal: trimmedGoal,
        createdAt: new Date().toISOString(),
        summary: "가설 후보를 준비하는 중입니다.",
        nextActions: [],
        openQuestions: [],
        agents: [],
        hypotheses: [],
        validations: [],
        hypothesisRankings: [],
        selectedHypothesisId: null,
        validationPasses: 1,
        validationComplete: true,
        validationGapReasons: [],
        evidence: []
      };
      const nextRuns = [placeholder, ...current].slice(0, 10);
      writeValidationRuns(nextRuns);
      return nextRuns;
    });
    setSelectedValidationRunId(baseRunId);

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/projects/${DEFAULT_PROJECT_ID}/hypothesis-exploration/stream`, {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          goal: trimmedGoal,
          num_agents: validationOptions.experts,
          num_candidates: E2E_FAST_VALIDATION_MODE ? 2 : 4,
          max_validation_passes: E2E_FAST_VALIDATION_MODE ? 1 : validationOptions.maxValidationPasses,
          use_web_search: E2E_FAST_VALIDATION_MODE ? false : discussionOptions.webSearch,
          debug_mode: E2E_FAST_VALIDATION_MODE
        })
      });

      if (!response.ok || !response.body) {
        throw new Error(`API ${response.status} ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const updateActiveRun = (updater: (current: ValidationRunEntry) => ValidationRunEntry) => {
        setValidationRuns((current) => {
          const baseEntry = current.find((entry) => entry.id === baseRunId) ?? {
            id: baseRunId,
            goal: trimmedGoal,
            createdAt: new Date().toISOString(),
            summary: "가설 후보를 준비하는 중입니다.",
            nextActions: [],
            openQuestions: [],
            agents: [],
            hypotheses: [],
            validations: [],
            hypothesisRankings: [],
            selectedHypothesisId: null,
            validationPasses: 1,
            validationComplete: true,
            validationGapReasons: [],
            evidence: []
          };
          const nextEntry = updater(baseEntry);
          const nextRuns = [nextEntry, ...current.filter((entry) => entry.id !== baseRunId)].slice(0, 10);
          writeValidationRuns(nextRuns);
          return nextRuns;
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const eventBlock of events) {
          const lines = eventBlock.trim().split("\n");
          let eventType = "message";
          let dataLine = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7);
            } else if (line.startsWith("data: ")) {
              dataLine = line.slice(6);
            }
          }

          if (!dataLine) {
            continue;
          }

          const parsed = JSON.parse(dataLine) as Record<string, unknown>;

          if (eventType === "status") {
            setStatus(String(parsed.message ?? ""));
            continue;
          }

          if (eventType === "agents") {
            streamedAgents = ((parsed.agents_used as StreamAgent[] | undefined) ?? []).map((agent, index) =>
              toAgentCardFromApi(
                {
                  agent_id: `${agent.community_id || "stream-community"}-${index + 1}`,
                  name: agent.name,
                  expertise: agent.expertise,
                  perspective: agent.perspective,
                  key_terminology: [],
                  knowledge_scope: []
                },
                index
              )
            );
            updateActiveRun((current) => ({
              ...current,
              agents: streamedAgents
            }));
            continue;
          }

          if (eventType === "hypotheses") {
            streamedHypotheses = ((parsed.candidates as StreamHypothesisCandidate[] | undefined) ?? []).map(toHypothesisCandidate);
            setValidationPhase("hypothesizing");
            updateActiveRun((current) => ({
              ...current,
              hypotheses: streamedHypotheses,
              validations: [],
              hypothesisRankings: [],
              selectedHypothesisId: null,
              summary: `가설 후보 ${streamedHypotheses.length}개를 정리했습니다.`
            }));
            setStatus(`가설 후보 ${streamedHypotheses.length}개를 정리했습니다.`);
            continue;
          }

          if (eventType === "hypothesis_start") {
            setValidationPhase("validating");
            setStatus(`${String(parsed.title ?? "가설")} 검증 의견을 수집 중입니다.`);
            continue;
          }

          if (eventType === "validation") {
            const payload = parsed as unknown as StreamHypothesisValidation;
            const nextValidation = toHypothesisValidation(payload);
            streamedValidations = [...streamedValidations, nextValidation];
            setValidationPhase("validating");
            updateActiveRun((current) => ({
              ...current,
              validations: streamedValidations
            }));
            setStatus(`${payload.agent_name} 검증 의견을 반영했습니다.`);
            continue;
          }

          if (eventType === "hypothesis_ranking") {
            streamedRankings = ((parsed.ranked_candidates as StreamHypothesisRanking[] | undefined) ?? []).map(toHypothesisRanking);
            updateActiveRun((current) => ({
              ...current,
              hypothesisRankings: streamedRankings
            }));
            setStatus("가설 우선순위를 정리했습니다.");
            continue;
          }

          if (eventType === "hypothesis_selected") {
            streamedSelectedHypothesisId = String(parsed.hypothesis_id ?? "") || null;
            updateActiveRun((current) => ({
              ...current,
              selectedHypothesisId: streamedSelectedHypothesisId
            }));
            setStatus(`${String(parsed.title ?? "선택 가설")}을 기준으로 검증을 정리했습니다.`);
            continue;
          }

          if (eventType === "done") {
            const payload = parsed as unknown as StreamDonePayload;
            const completedRun = buildValidationRunEntry(trimmedGoal, payload);
            setValidationRuns((current) => {
              const stabilizedRun = { ...completedRun, id: completedRun.id || baseRunId };
              const nextRuns = [stabilizedRun, ...current.filter((entry) => entry.id !== baseRunId && entry.id !== stabilizedRun.id)].slice(0, 10);
              writeValidationRuns(nextRuns);
              return nextRuns;
            });
            setSelectedValidationRunId(completedRun.id || baseRunId);
            setValidationPhase("completed");
            setStatus(payload.summary);
            continue;
          }

          if (eventType === "error") {
            throw new Error(String(parsed.detail ?? "브레인 스토밍 요청을 처리하지 못했습니다."));
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      setValidationPhase("idle");
      setStatus(error instanceof Error ? error.message : "브레인 스토밍 요청을 처리하지 못했습니다.");
      setValidationRuns((current) => {
        const nextRuns = current.filter((entry) => entry.id !== baseRunId);
        writeValidationRuns(nextRuns);
        return nextRuns;
      });
      setSelectedValidationRunId((current) => (current === baseRunId ? null : current));
    } finally {
      setIsRunning(false);
    }
  }

  function restoreHistory(entry: DiscussionHistoryEntry) {
    setQuestion(entry.question);
    setDiscussionPhase("completed");
    setStatus(entry.summary);
    setActiveDiscussion(entry.turns);
    setDiscussionView((current) => ({
      ...current,
      summary: entry.summary,
      nextActions: entry.nextActions,
      openQuestions: entry.openQuestions,
      agents: entry.agents,
      hypotheses: entry.hypotheses,
      validations: entry.validations,
      hypothesisRankings: entry.hypothesisRankings,
      selectedHypothesisId: entry.selectedHypothesisId,
      validatedConstraints: entry.validatedConstraints ?? [],
      researchContext: entry.researchContext,
      contextBudget: entry.contextBudget,
      roundSummaries: entry.roundSummaries,
      evidence: entry.evidence,
      graph: entry.graph
    }));
    setSelectedAgentId(entry.agents[0]?.agentId ?? null);
    setExpandedAgentId(entry.agents[0]?.agentId ?? null);
    setSessionGeneratedAt(entry.createdAt);
    setSelectedReportId(`report-${entry.id}`);
  }

  async function loadConstraintPreview(nextQuestion: string) {
    const response = await apiClient<ConstraintPreviewResponse>(`/api/projects/${DEFAULT_PROJECT_ID}/discussions/constraints/preview`, {
      method: "POST",
      body: JSON.stringify({ question: nextQuestion })
    });
    const candidates = (response.candidates ?? []).map(normalizeConstraintCandidate);
    const validated = (response.validated_constraints ?? []).map(normalizeValidatedConstraint);
    const approvedIds = new Set(response.review_state?.approved_constraint_ids ?? validated.map((item) => item.constraint_id));
    const storedApprovalState = readConstraintApprovalState();
    const rejectedIds = Array.from(new Set([...storedApprovalState.rejectedConstraintIds, ...persistedRejectedConstraintIds]));
    const rejectedIdSet = new Set(rejectedIds);
    setConstraintCandidates(candidates);
    setPersistedRejectedConstraintIds(rejectedIds);
    setApprovedConstraints((current) => {
      const previewApproved = validated.length > 0
        ? validated.filter((item) => !rejectedIdSet.has(item.constraint_id))
        : candidates
            .filter((item) => approvedIds.has(item.constraint_id) && !rejectedIdSet.has(item.constraint_id))
            .map((item) => normalizeValidatedConstraint({ ...item, status: "approved" }));
      const merged = new Map((current.length > 0 ? current : storedApprovalState.approvedConstraints).map((item) => [item.constraint_id, item]));
      previewApproved.forEach((item) => merged.set(item.constraint_id, item));
      const next = Array.from(merged.values());
      writeConstraintApprovalState(next, rejectedIds);
      return next;
    });
    setConstraintMissingInputs(response.missing_inputs ?? []);
    setConstraintFollowUps(response.follow_up_questions ?? []);
    setConstraintReviewState({
      review_status: response.review_state?.review_status ?? (candidates.length > 0 ? "pending" : "completed"),
      review_required: response.review_state?.review_required ?? candidates.length > 0,
      approved_constraint_ids: response.review_state?.approved_constraint_ids ?? [],
      rejected_constraint_ids: response.review_state?.rejected_constraint_ids ?? [],
      last_reviewed_at: response.review_state?.last_reviewed_at ?? null
    });
  }

  function toggleConstraintApproval(candidate: ConstraintCandidatePayload) {
    setApprovedConstraints((current) => {
      const exists = current.some((item) => item.constraint_id === candidate.constraint_id);
      const next = exists
        ? current.filter((item) => item.constraint_id !== candidate.constraint_id)
        : [...current, normalizeValidatedConstraint({ ...candidate, status: "approved", source: candidate.source || "user-approved" })];
      const nextRejectedIds = exists
        ? Array.from(new Set([...persistedRejectedConstraintIds, candidate.constraint_id]))
        : persistedRejectedConstraintIds.filter((item) => item !== candidate.constraint_id);
      setPersistedRejectedConstraintIds(nextRejectedIds);
      writeConstraintApprovalState(next, nextRejectedIds);
      setConstraintReviewState((state) => ({
        ...state,
        review_status: next.length > 0 ? "completed" : state.review_status,
        approved_constraint_ids: next.map((item) => item.constraint_id),
        rejected_constraint_ids: constraintCandidates
          .filter((item) => !next.some((approved) => approved.constraint_id === item.constraint_id))
          .map((item) => item.constraint_id),
        last_reviewed_at: next.length > 0 ? new Date().toISOString() : state.last_reviewed_at
      }));
      return next;
    });
  }

  async function handleDiscussionStart() {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      return;
    }

    setDiscussionPhase("clarifying");
    setIsRunning(true);
    setStatus("질문을 분석해 토론 질문을 정리하는 중입니다.");

    try {
      const response = await apiClient<ClarifyResponse>("/api/discussions/clarify", {
        method: "POST",
        body: JSON.stringify({ question: trimmedQuestion })
      });
      setRefinedQuestion(response.refined_question);
      setNeedsClarification(response.needs_clarification);
      setFollowUpQuestion(response.follow_up ?? null);
      setFollowUpAnswer("");
      setClarifyReasoning(response.reasoning);
      await loadConstraintPreview(response.refined_question);
      setStatus(response.reasoning);
      setDiscussionPhase("preview");
    } catch (error) {
      setRefinedQuestion(trimmedQuestion);
      setNeedsClarification(false);
      setFollowUpQuestion(null);
      setClarifyReasoning("질문 원문을 그대로 사용해 토론을 시작합니다.");
      await loadConstraintPreview(trimmedQuestion).catch(() => undefined);
      setStatus(error instanceof Error ? error.message : "질문 분석에 실패해 원문으로 진행합니다.");
      setDiscussionPhase("preview");
    } finally {
      setIsRunning(false);
    }
  }

  async function handlePreviewStart() {
    await runDiscussion(refinedQuestion || question);
  }

  async function handleHypothesisExplorationStart(goalOverride?: string) {
    await runHypothesisExploration(goalOverride ?? refinedQuestion ?? question);
  }

  async function handleReClarify() {
    const combinedQuestion = [question.trim(), followUpAnswer.trim() ? `추가 컨텍스트: ${followUpAnswer.trim()}` : ""]
      .filter(Boolean)
      .join("\n\n");

    setDiscussionPhase("clarifying");
    setIsRunning(true);
    setStatus("추가 컨텍스트를 반영해 질문을 다시 정리하는 중입니다.");

    try {
      const response = await apiClient<ClarifyResponse>("/api/discussions/clarify", {
        method: "POST",
        body: JSON.stringify({ question: combinedQuestion })
      });
      setRefinedQuestion(response.refined_question);
      setNeedsClarification(response.needs_clarification);
      setFollowUpQuestion(response.follow_up ?? null);
      setClarifyReasoning(response.reasoning);
      await loadConstraintPreview(response.refined_question);
      setStatus(response.reasoning);
      setDiscussionPhase("preview");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "질문 재분석에 실패했습니다.");
      setDiscussionPhase("preview");
    } finally {
      setIsRunning(false);
    }
  }

  function resetDiscussionSession() {
    setDiscussionPhase("input");
    setStatus("새 질문을 입력해 다음 토론 세션을 시작합니다.");
    setActiveDiscussion([]);
    setRefinedQuestion("");
    setNeedsClarification(false);
    setFollowUpQuestion(null);
    setFollowUpAnswer("");
    setClarifyReasoning("");
    setConstraintCandidates([]);
    setConstraintMissingInputs([]);
    setConstraintFollowUps([]);
    setConstraintReviewState({
      review_status: "pending",
      review_required: false,
      approved_constraint_ids: [],
      rejected_constraint_ids: [],
      last_reviewed_at: null
    });
    setExpandedTurnKey(null);
  }

  function toggleGraphType(nodeType: string) {
    setGraphTypeFilter((current) => {
      if (current.length === 0) {
        return graphTypes.filter((type) => type !== nodeType);
      }

      if (current.includes(nodeType)) {
        const next = current.filter((item) => item !== nodeType);
        return next.length === 0 ? [] : next;
      }

      const next = [...current, nodeType];
      return next.length === graphTypes.length ? [] : next;
    });
  }

  function toggleDeveloperMode() {
    const nextEnabled = !isDeveloperMode;
    setIsDeveloperMode(nextEnabled);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DEVELOPER_MODE_STORAGE_KEY, nextEnabled ? "true" : "false");
    }
  }

  useEffect(() => {
    activeDiscussionRef.current = activeDiscussion;
  }, [activeDiscussion]);

  useEffect(() => {
    setIsMounted(true);
    const nextHistory = readHistory();
    const nextValidationRuns = readValidationRuns();
    const nextApprovalState = readConstraintApprovalState();
    setHistory(nextHistory);
    setValidationRuns(nextValidationRuns);
    setSelectedValidationRunId(nextValidationRuns[0]?.id ?? null);
    setApprovedConstraints(nextApprovalState.approvedConstraints);
    setPersistedRejectedConstraintIds(nextApprovalState.rejectedConstraintIds);
    setIsAdvancedMode(readAdvancedControlsEnabled());
    setIsDeveloperMode(readDeveloperModeEnabled());

    const handleAdvancedControlsChange = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
      setIsAdvancedMode(typeof detail?.enabled === "boolean" ? detail.enabled : readAdvancedControlsEnabled());
    };
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === ADVANCED_CONTROLS_STORAGE_KEY) {
        setIsAdvancedMode(event.newValue === "true");
      }
      if (event.key === DEVELOPER_MODE_STORAGE_KEY) {
        setIsDeveloperMode(event.newValue === "true");
      }
    };
    window.addEventListener(ADVANCED_CONTROLS_EVENT_NAME, handleAdvancedControlsChange);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener(ADVANCED_CONTROLS_EVENT_NAME, handleAdvancedControlsChange);
      window.removeEventListener("storage", handleStorageChange);
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (selectedReportId == null && generatedReports.length > 0) {
      setSelectedReportId(generatedReports[0].id);
      return;
    }

    if (selectedReportId && generatedReports.every((item) => item.id !== selectedReportId)) {
      setSelectedReportId(generatedReports[0]?.id ?? null);
    }
  }, [generatedReports, selectedReportId]);

  useEffect(() => {
    if (selectedValidationRunId == null && validationRuns.length > 0) {
      setSelectedValidationRunId(validationRuns[0].id);
      return;
    }

    if (selectedValidationRunId && validationRuns.every((item) => item.id !== selectedValidationRunId)) {
      setSelectedValidationRunId(validationRuns[0]?.id ?? null);
    }
  }, [selectedValidationRunId, validationRuns]);

  useEffect(() => {
    if (hasBootstrapped.current) {
      return;
    }

    hasBootstrapped.current = true;
    void (async () => {
      try {
        await Promise.all([loadProjectContext(), loadSeedConstraints()]);
        setStatus("질문을 입력해 전문가 토론 세션을 시작하세요.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "프로젝트 컨텍스트를 불러오지 못했습니다.");
      }
    })();
  }, []);

  useEffect(() => {
    if (workspaceView === "graph") {
      void loadProjectGraph();
    }
  }, [workspaceView]);

  useEffect(() => {
    const updateSize = () => {
      if (isGraphFullscreen) {
        setGraphSize({ width: window.innerWidth, height: window.innerHeight });
        return;
      }
      if (!graphContainerRef.current) {
        return;
      }
      setGraphSize({
        width: Math.max(graphContainerRef.current.clientWidth, 320),
        height: Math.max(graphContainerRef.current.clientHeight, 620)
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    if (graphContainerRef.current) {
      observer.observe(graphContainerRef.current);
    }
    window.addEventListener("resize", updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, [isGraphFullscreen]);

  useEffect(() => {
    if (!isGraphFullscreen) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsGraphFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isGraphFullscreen]);

  useEffect(() => {
    if (workspaceView !== "graph" || !forceGraphRef.current || renderGraphData.nodes.length === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      forceGraphRef.current?.zoomToFit(400, 60);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [isGraphFullscreen, renderGraphData, workspaceView]);

  const handleGraphNodeClick = useCallback((node: object) => {
    const current = node as RenderGraphNode;
    setGraphDetailMode("node");
    setSelectedNodeId(current.nodeId);
    setSelectedEdgeId(null);
  }, []);

  const handleGraphNodeHover = useCallback((node: object | null) => {
    const current = node as RenderGraphNode | null;
    setHoveredNodeId(current?.nodeId ?? null);
  }, []);

  const handleGraphLinkClick = useCallback((link: object) => {
    const current = link as RenderGraphLink;
    setGraphDetailMode("edge");
    setSelectedEdgeId(current.edgeId);
    setSelectedNodeId(null);
  }, []);

  const isGraphNodeHighlighted = useCallback(
    (nodeId: string) => {
      if (!hoveredNodeId) {
        return false;
      }
      return nodeId === hoveredNodeId || (graphNeighborMap.get(hoveredNodeId)?.has(nodeId) ?? false);
    },
    [graphNeighborMap, hoveredNodeId]
  );

  const drawGraphNode = useCallback(
    (node: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const current = node as RenderGraphNode;
      const label = current.label;
      const x = current.x ?? 0;
      const y = current.y ?? 0;
      const degree = current.__degree ?? 0;
      const radius = Math.min(3 + Math.sqrt(degree) * 1.5, 12);
      const highlighted = isGraphNodeHighlighted(current.nodeId);
      const isHovered = hoveredNodeId === current.nodeId;
      const isSelected = selectedNodeId === current.nodeId;
      const isDimmed = Boolean(hoveredNodeId) && !highlighted;

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
      ctx.fillStyle = isDimmed ? `${current.color}40` : current.color;
      ctx.fill();

      if (isHovered || isSelected) {
        ctx.strokeStyle = isHovered ? "#0ea5e9" : "#6366f1";
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
      }

      const showLabel = isHovered || (highlighted && hoveredNodeId) || isSelected || globalScale > 4;
      if (showLabel) {
        const fontSize = Math.max(11 / globalScale, 3.5);
        ctx.font = `${isHovered ? "bold " : ""}${fontSize}px sans-serif`;
        ctx.fillStyle = isDimmed ? "#94a3b8" : "#0f172a";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(label, x + radius + 3, y);
      }
    },
    [hoveredNodeId, isGraphNodeHighlighted, selectedNodeId]
  );

  const graphLinkColor = useCallback(
    (link: object) => {
      const current = link as RenderGraphLink;
      const baseColor = GRAPH_EDGE_COLORS[current.relationshipType] ?? "#64748b";
      if (!hoveredNodeId) {
        return `${baseColor}25`;
      }
      const sourceNodeId = typeof current.source === "string" ? current.source : current.source.nodeId;
      const targetNodeId = typeof current.target === "string" ? current.target : current.target.nodeId;
      const connected = sourceNodeId === hoveredNodeId || targetNodeId === hoveredNodeId;
      return connected ? baseColor : `${baseColor}10`;
    },
    [hoveredNodeId]
  );

  const graphLinkWidth = useCallback(
    (link: object) => {
      const current = link as RenderGraphLink;
      if (selectedEdgeId && current.edgeId === selectedEdgeId) {
        return 2.8;
      }
      if (!hoveredNodeId) {
        return 0.5;
      }
      const sourceNodeId = typeof current.source === "string" ? current.source : current.source.nodeId;
      const targetNodeId = typeof current.target === "string" ? current.target : current.target.nodeId;
      const connected = sourceNodeId === hoveredNodeId || targetNodeId === hoveredNodeId;
      return connected ? 2.5 : 0.3;
    },
    [hoveredNodeId, selectedEdgeId]
  );

  const drawGraphLinkLabel = useCallback(
    (link: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
      if (!hoveredNodeId) {
        return;
      }
      const current = link as RenderGraphLink;
      const sourceNodeId = typeof current.source === "string" ? current.source : current.source.nodeId;
      const targetNodeId = typeof current.target === "string" ? current.target : current.target.nodeId;
      if (sourceNodeId !== hoveredNodeId && targetNodeId !== hoveredNodeId) {
        return;
      }
      const source = typeof current.source === "string" ? null : current.source;
      const target = typeof current.target === "string" ? null : current.target;
      if (!source || !target) {
        return;
      }
      const fontSize = Math.max(9 / globalScale, 3);
      const midX = ((source.x ?? 0) + (target.x ?? 0)) / 2;
      const midY = ((source.y ?? 0) + (target.y ?? 0)) / 2;
      ctx.save();
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillStyle = GRAPH_EDGE_COLORS[current.relationshipType] ?? "#64748b";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(current.label, midX, midY - 4 / globalScale);
      ctx.restore();
    },
    [hoveredNodeId]
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
      <SurfaceCard className="rounded-panel p-5">
        <div className="space-y-5">
          <div className="rounded-[1.7rem] bg-[linear-gradient(135deg,#163b6f_0%,#1f5ea6_62%,#4c86d7_100%)] p-5 text-white shadow-card">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] uppercase tracking-[0.28em] text-white/70">AI 연구 가속</div>
              <StatusBadge tone="research" className="border-white/15 bg-white/10 text-white">
                연구 워크스페이스 실행중
              </StatusBadge>
            </div>
            <h3 className="mt-4 text-2xl font-semibold leading-tight">Multi-Agent AI 연구 콘솔</h3>
            <p className="mt-3 text-sm leading-6 text-white/80">원본형 연구 작업공간 구조 위에서 그래프, 토론, 보고서를 같은 맥락으로 탐색합니다.</p>
          </div>

          <SurfaceCard tone="muted" className="rounded-[1.5rem] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-faint">현재 프로젝트</div>
                <div className="mt-2 text-base font-semibold text-ink">{DEFAULT_PROJECT_ID}</div>
              </div>
              <StatusBadge tone="neutral">프로젝트 동기화됨</StatusBadge>
            </div>
            <div className="mt-3 text-sm leading-6 text-soft">프로젝트 컨텍스트를 유지한 채 각 섹션을 이동하며 연구 내용을 확인할 수 있습니다.</div>
          </SurfaceCard>

          <nav className="space-y-2">
            <WorkspaceSidebarLink href="/dashboard/research?view=discussion" active={workspaceView === "discussion"} label="토론" detail="실시간 세션" />
            <WorkspaceSidebarLink href="/dashboard/research?view=validation" active={workspaceView === "validation"} label="브레인 스토밍" detail="AI 랜덤 가설 설정" />
            <WorkspaceSidebarLink href="/dashboard/research?view=graph" active={workspaceView === "graph"} label="그래프" detail="지식 맵" />
            <WorkspaceSidebarLink href="/dashboard/research?view=agents" active={workspaceView === "agents"} label="에이전트" detail="전문가 목록" />
            <WorkspaceSidebarLink href="/dashboard/research?view=report" active={workspaceView === "report"} label="보고서" detail="저장 결과" />
          </nav>

          <SurfaceCard tone="contrast" className="rounded-[1.5rem] p-4">
            <div className="text-[11px] uppercase tracking-[0.24em] text-faint">프로젝트 안내</div>
            <div className="mt-3 space-y-2 text-sm leading-6 text-soft">
              <div>노드 {projectGraph.nodes.length.toString()} · 엣지 {projectGraph.edges.length.toString()}</div>
              <div>에이전트 {projectAgents.length}명 · 세션 {history.length + (activeDiscussion.length > 0 ? 1 : 0)}건</div>
              <div>토론 결과가 저장되면 보고서와 최근 세션에서 다시 이어볼 수 있습니다.</div>
            </div>
          </SurfaceCard>
        </div>
      </SurfaceCard>

      <div className="space-y-6">
        <SurfaceCard className="rounded-panel p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.28em] text-faint">{workspaceEyebrowMap[workspaceView]}</div>
              <h3 className="mt-2 text-2xl font-semibold text-ink">{workspaceTitleMap[workspaceView]}</h3>
              <p className="mt-2 text-sm leading-6 text-soft">{workspaceDescriptionMap[workspaceView]}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone="research">연구 API</StatusBadge>
              <StatusBadge tone="neutral">근거 {discussionView.evidence.length}건</StatusBadge>
              <StatusBadge tone="neutral">저장 {history.length}건</StatusBadge>
            </div>
          </div>
        </SurfaceCard>

        {workspaceView === "discussion" ? (
          <div className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
            <div className="space-y-6">
              <SurfaceCard className="rounded-panel p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.28em] text-faint">토론 준비</div>
                    <h4 className="mt-2 text-2xl font-semibold text-ink">질문 입력과 전문가 토론 실행</h4>
                  </div>
                  <StatusBadge tone="research">토론</StatusBadge>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <PhaseBadge label="질문" active={discussionPhase === "input" || discussionPhase === "clarifying" || discussionPhase === "preview" || discussionPhase === "hypothesizing" || discussionPhase === "validating" || discussionPhase === "discussing" || discussionPhase === "completed"} />
                  <PhaseBadge label="분석" active={discussionPhase === "clarifying" || discussionPhase === "preview" || discussionPhase === "hypothesizing" || discussionPhase === "validating" || discussionPhase === "discussing" || discussionPhase === "completed"} />
                  <PhaseBadge label="미리보기" active={discussionPhase === "preview" || discussionPhase === "hypothesizing" || discussionPhase === "validating" || discussionPhase === "discussing" || discussionPhase === "completed"} />
                  <PhaseBadge label="가설" active={discussionPhase === "hypothesizing" || discussionPhase === "validating" || discussionPhase === "discussing" || discussionPhase === "completed"} />
                  <PhaseBadge label="검증" active={discussionPhase === "validating" || discussionPhase === "discussing" || discussionPhase === "completed"} />
                  <PhaseBadge label="토론" active={discussionPhase === "discussing" || discussionPhase === "completed"} />
                  <PhaseBadge label="요약" active={discussionPhase === "completed"} />
                </div>

                {(discussionPhase === "input" || discussionPhase === "clarifying") ? (
                  <SurfaceCard tone="muted" className="mt-5 rounded-[1.4rem] p-5">
                    <label className="text-xs uppercase tracking-[0.28em] text-faint">토론 질문</label>
                    <textarea
                      value={question}
                      onChange={(event) => {
                        setQuestion(event.target.value);
                      }}
                      placeholder="연구 주제에 대한 질문을 입력하세요 — 문헌, 가설, 실험 조건 등 무엇이든..."
                      className="mt-3 min-h-36 w-full rounded-[1.3rem] border border-line bg-white/85 px-4 py-3 text-sm leading-6 text-ink outline-none transition focus:border-research/40 focus:ring-2 focus:ring-research/10"
                    />
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <label className="rounded-[1rem] border border-line/70 bg-white/70 px-3 py-3 text-sm text-soft">
                        <span className="text-[11px] uppercase tracking-[0.2em] text-faint">라운드 수</span>
                        <select
                          value={discussionOptions.rounds}
                          onChange={(event) => setDiscussionOptions((current) => ({ ...current, rounds: Number(event.target.value) }))}
                          className="mt-2 w-full bg-transparent text-sm text-ink outline-none"
                        >
                          {[2, 3, 4].map((round) => (
                            <option key={round} value={round}>
                              {round} 라운드
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="rounded-[1rem] border border-line/70 bg-white/70 px-3 py-3 text-sm text-soft">
                        <span className="text-[11px] uppercase tracking-[0.2em] text-faint">전문가 수</span>
                        <select
                          value={discussionOptions.experts}
                          onChange={(event) => setDiscussionOptions((current) => ({ ...current, experts: Number(event.target.value) }))}
                          className="mt-2 w-full bg-transparent text-sm text-ink outline-none"
                        >
                          {[3, 4, 5, 6, 8, 10, 12].map((count) => (
                            <option key={count} value={count}>
                              {count}명
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => setDiscussionOptions((current) => ({ ...current, webSearch: !current.webSearch }))}
                        className={`rounded-[1rem] border px-3 py-3 text-left text-sm transition ${
                          discussionOptions.webSearch ? "border-line-strong bg-white text-ink" : "border-line bg-white/60 text-soft"
                        }`}
                      >
                        <div className="text-[11px] uppercase tracking-[0.2em] text-faint">외부 검색</div>
                        <div className="mt-2 font-medium">{discussionOptions.webSearch ? "사용" : "중지"}</div>
                      </button>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-soft">{status}</p>
                      <div className="flex flex-wrap gap-2">
                        {activeDiscussion.length > 0 ? (
                          <ActionButton type="button" tone="neutral" variant="subtle" onClick={resetDiscussionSession}>
                            새 토론
                          </ActionButton>
                        ) : null}
                        <ActionButton
                          type="button"
                          tone="neutral"
                          variant="subtle"
                          onClick={() => {
                            setValidationGoal(question);
                            router.push("/dashboard/research?view=validation");
                          }}
                        >
                          브레인 스토밍으로 이동
                        </ActionButton>
                        <ActionButton type="button" tone="research" onClick={handleDiscussionStart} disabled={isRunning || !question.trim()}>
                          {discussionPhase === "clarifying" || isRunning ? "질문 분석 중..." : "토론 시작"}
                        </ActionButton>
                      </div>
                    </div>

                    {isAdvancedMode ? (
                      <div className="mt-5 rounded-[1.2rem] border border-line/70 bg-white/80 px-4 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-[0.22em] text-faint">초기 constraint 후보 전체 검토</div>
                          <p className="mt-2 text-sm leading-6 text-soft">50문항 seed에서 정리한 constraint 후보입니다. 숫자형 bounds는 문헌·도메인 prior 기반 후보이며 승인한 항목만 다음 토론 요청에 포함됩니다.</p>
                        </div>
                        <StatusBadge tone="neutral">{seedApprovedCount}/{seedConstraintCandidates.length}</StatusBadge>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <ActionButton
                          type="button"
                          tone="research"
                          variant="subtle"
                          onClick={() => {
                            const seedIds = new Set(seedConstraintCandidates.map((item) => item.constraint_id));
                            const nextRejectedIds = persistedRejectedConstraintIds.filter((item) => !seedIds.has(item));
                            setPersistedRejectedConstraintIds(nextRejectedIds);
                            setApprovedConstraints((current) => {
                              const merged = new Map(current.map((item) => [item.constraint_id, item]));
                              seedConstraintCandidates.forEach((candidate) => {
                                merged.set(candidate.constraint_id, normalizeValidatedConstraint({ ...candidate, status: "approved" }));
                              });
                              const next = Array.from(merged.values());
                              writeConstraintApprovalState(next, nextRejectedIds);
                              return next;
                            });
                          }}
                          disabled={seedConstraintCandidates.length === 0}
                        >
                          전체 승인
                        </ActionButton>
                        <ActionButton
                          type="button"
                          tone="neutral"
                          variant="subtle"
                          onClick={() => {
                            const seedIds = new Set(seedConstraintCandidates.map((item) => item.constraint_id));
                            const nextRejectedIds = Array.from(new Set([...persistedRejectedConstraintIds, ...seedIds]));
                            setPersistedRejectedConstraintIds(nextRejectedIds);
                            setApprovedConstraints((current) => {
                              const next = current.filter((item) => !seedIds.has(item.constraint_id));
                              writeConstraintApprovalState(next, nextRejectedIds);
                              return next;
                            });
                          }}
                          disabled={seedApprovedCount === 0}
                        >
                          전체 해제
                        </ActionButton>
                      </div>
                      {seedConstraintCandidates.length > 0 ? (
                        <div className="mt-4 max-h-[34rem] space-y-3 overflow-y-auto pr-1">
                          {seedConstraintCandidates.map((candidate) => {
                            const approved = approvedConstraintIdSet.has(candidate.constraint_id);
                            return (
                              <div key={candidate.constraint_id} className="rounded-[1rem] border border-line/70 bg-surface-muted/55 px-4 py-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap gap-2">
                                      <StatusBadge tone={approved ? "success" : "neutral"}>{approved ? "approved" : candidate.constraint_type}</StatusBadge>
                                      <StatusBadge tone="neutral">{candidate.scope}</StatusBadge>
                                      <span className="rounded-full bg-white/80 px-2 py-1 text-[11px] font-medium text-faint">{candidate.constraint_id}</span>
                                    </div>
                                    <p className="mt-3 text-sm font-medium leading-6 text-ink">{candidate.text}</p>
                                    {candidate.why ? <p className="mt-2 text-xs leading-5 text-soft">{candidate.why}</p> : null}
                                    <NumericBoundsList bounds={candidate.numeric_bounds} />
                                  </div>
                                  <ActionButton
                                    type="button"
                                    tone={approved ? "neutral" : "research"}
                                    variant={approved ? "subtle" : "solid"}
                                    onClick={() => toggleConstraintApproval(candidate)}
                                  >
                                    {approved ? "승인 해제" : "승인"}
                                  </ActionButton>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="mt-4 rounded-[1rem] border border-dashed border-line/70 bg-white/55 px-4 py-4 text-sm text-soft">
                          초기 constraint 후보를 불러오는 중입니다.
                        </div>
                      )}
                    </div>
                    ) : (
                      <div className="mt-5 rounded-[1.2rem] border border-research/15 bg-white/80 px-4 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-xs uppercase tracking-[0.22em] text-faint">안전 조건 자동 적용</div>
                            <p className="mt-2 text-sm leading-6 text-soft">승인된 공정 안전 범위를 다음 토론과 검증에 자동으로 적용합니다.</p>
                          </div>
                          <StatusBadge tone="success">{approvedConstraints.length} active</StatusBadge>
                        </div>
                        <div className="mt-4 grid gap-2 sm:grid-cols-3">
                          {approvedConstraints.slice(0, 3).map((constraint) => (
                            <div key={constraint.constraint_id} className="rounded-[0.9rem] border border-line/70 bg-surface-muted/55 px-3 py-3 text-sm leading-6 text-soft">
                              {constraint.text}
                            </div>
                          ))}
                          {approvedConstraints.length === 0 ? (
                            <div className="rounded-[0.9rem] border border-dashed border-line/70 bg-white/55 px-3 py-3 text-sm leading-6 text-soft sm:col-span-3">
                              기본 안전 조건을 불러오는 중입니다.
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </SurfaceCard>
                ) : null}

                {discussionPhase === "preview" ? (
                  <SurfaceCard tone="muted" className="mt-5 rounded-[1.4rem] p-5">
                    <div className="text-xs uppercase tracking-[0.28em] text-faint">토론 질문 미리보기</div>
                    <div className="mt-4 rounded-[1.1rem] border border-research/15 bg-white/85 px-4 py-4">
                      <p className="text-sm leading-7 text-ink">{refinedQuestion}</p>
                      {clarifyReasoning ? <p className="mt-3 text-xs leading-6 text-faint">{clarifyReasoning}</p> : null}
                    </div>
                    {needsClarification && followUpQuestion ? (
                      <div className="mt-4 rounded-[1.1rem] border border-line/70 bg-white/80 px-4 py-4">
                        <div className="text-xs uppercase tracking-[0.22em] text-faint">추가 정보 요청</div>
                        <p className="mt-2 text-sm leading-6 text-soft">{followUpQuestion}</p>
                        <textarea
                          value={followUpAnswer}
                          onChange={(event) => setFollowUpAnswer(event.target.value)}
                          placeholder="답변을 입력하세요."
                          className="mt-3 min-h-24 w-full rounded-[1rem] border border-line bg-white px-4 py-3 text-sm leading-6 text-ink outline-none transition focus:border-research/40 focus:ring-2 focus:ring-research/10"
                        />
                        <div className="mt-4 flex flex-wrap gap-2">
                          <ActionButton type="button" tone="neutral" variant="subtle" onClick={() => { setNeedsClarification(false); setFollowUpQuestion(null); }}>
                            건너뛰기
                          </ActionButton>
                          <ActionButton type="button" tone="research" onClick={handleReClarify} disabled={isRunning}>
                            {isRunning ? "재분석 중..." : "질문 재정리"}
                          </ActionButton>
                        </div>
                      </div>
                    ) : null}
                    {!needsClarification ? (
                      <>
                        {isAdvancedMode ? (
                          <div className="mt-4 rounded-[1.1rem] border border-line/70 bg-white/80 px-4 py-4">
                            <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-xs uppercase tracking-[0.22em] text-faint">적용 예정 제약</div>
                              <p className="mt-2 text-sm leading-6 text-soft">후보를 검토해 승인된 constraint만 토론과 가설 검증에 주입합니다.</p>
                            </div>
                            <StatusBadge tone="neutral">{previewApprovedCount}/{constraintCandidates.length}</StatusBadge>
                          </div>
                          {constraintCandidates.length > 0 ? (
                            <div className="mt-4 space-y-3">
                              {constraintCandidates.map((candidate) => {
                                const approved = approvedConstraints.some((item) => item.constraint_id === candidate.constraint_id);
                                return (
                                  <div key={candidate.constraint_id} className="rounded-[1rem] border border-line/70 bg-surface-muted/55 px-4 py-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div>
                                        <div className="flex flex-wrap gap-2">
                                          <StatusBadge tone={approved ? "success" : "neutral"}>{approved ? "approved" : candidate.constraint_type}</StatusBadge>
                                          <StatusBadge tone="neutral">{candidate.scope}</StatusBadge>
                                        </div>
                                        <p className="mt-3 text-sm font-medium leading-6 text-ink">{candidate.text}</p>
                                        {candidate.why ? <p className="mt-2 text-xs leading-5 text-soft">{candidate.why}</p> : null}
                                        <NumericBoundsList bounds={candidate.numeric_bounds} />
                                      </div>
                                      <ActionButton
                                        type="button"
                                        tone={approved ? "neutral" : "research"}
                                        variant={approved ? "subtle" : "solid"}
                                        onClick={() => toggleConstraintApproval(candidate)}
                                      >
                                        {approved ? "승인 해제" : "승인"}
                                      </ActionButton>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="mt-4 rounded-[1rem] border border-dashed border-line/70 bg-white/55 px-4 py-4 text-sm text-soft">
                              이번 질문에서 별도 검토가 필요한 constraint 후보가 아직 없습니다.
                            </div>
                          )}
                          {constraintMissingInputs.length > 0 ? (
                            <div className="mt-4 rounded-[0.95rem] border border-dashed border-line/70 bg-white/60 px-4 py-3 text-xs leading-5 text-soft">
                              누락 입력: {constraintMissingInputs.join(" · ")}
                            </div>
                          ) : null}
                          {constraintFollowUps.length > 0 ? (
                            <div className="mt-3 rounded-[0.95rem] border border-dashed border-line/70 bg-white/60 px-4 py-3 text-xs leading-5 text-soft">
                              후속 질문: {constraintFollowUps.join(" · ")}
                            </div>
                          ) : null}
                        </div>
                        ) : (
                          <div className="mt-4 rounded-[1.1rem] border border-research/15 bg-white/80 px-4 py-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="text-xs uppercase tracking-[0.22em] text-faint">적용 예정 안전 조건</div>
                                <p className="mt-2 text-sm leading-6 text-soft">승인된 공정 안전 범위를 그대로 적용해 토론을 준비합니다.</p>
                              </div>
                              <StatusBadge tone="success">{approvedConstraints.length} active</StatusBadge>
                            </div>
                            {constraintMissingInputs.length > 0 ? (
                              <div className="mt-4 rounded-[0.95rem] border border-dashed border-line/70 bg-white/60 px-4 py-3 text-xs leading-5 text-soft">
                                추가 입력: {constraintMissingInputs.join(" · ")}
                              </div>
                            ) : null}
                          </div>
                        )}
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                          <p className="text-sm text-soft">최대 전문가 {discussionOptions.experts}명, {discussionOptions.rounds}개 라운드 기준으로 세션을 준비했습니다.</p>
                          <div className="flex flex-wrap gap-2">
                            <ActionButton type="button" tone="neutral" variant="subtle" onClick={resetDiscussionSession}>
                              설정 변경
                            </ActionButton>
                            <ActionButton
                              type="button"
                              tone="neutral"
                              variant="subtle"
                              onClick={() => {
                                setValidationGoal(refinedQuestion || question);
                                router.push("/dashboard/research?view=validation");
                              }}
                              disabled={isRunning}
                            >
                              브레인 스토밍에서 탐색
                            </ActionButton>
                            <ActionButton type="button" tone="research" onClick={handlePreviewStart} disabled={isRunning}>
                              {isRunning ? "연결 중..." : "이 질문으로 토론 시작"}
                            </ActionButton>
                          </div>
                        </div>
                      </>
                    ) : null}
                  </SurfaceCard>
                ) : null}
              </SurfaceCard>

              <SurfaceCard className="rounded-panel p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.28em] text-faint">세션 참여자</div>
                    <h4 className="mt-2 text-xl font-semibold text-ink">세션 참여 전문가</h4>
                  </div>
                  <StatusBadge tone="neutral">{discussionView.agents.length}</StatusBadge>
                </div>
                <div className="mt-4 space-y-3">
                  {discussionView.agents.length > 0 ? (
                    [...discussionView.agents].sort((a, b) => b.knowledgeScope.length - a.knowledgeScope.length).map((agent) => {
                      const display = formatAgentDisplay(agent);
                      return (
                        <button
                          key={agent.agentId}
                          type="button"
                          onClick={() => {
                            setSelectedAgentId(agent.agentId);
                            setExpandedAgentId(agent.agentId);
                          }}
                          className={`w-full rounded-[1.1rem] border px-4 py-4 text-left transition ${
                            selectedAgentId === agent.agentId
                              ? "border-line-strong bg-white text-ink shadow-card"
                              : "border-line bg-surface-muted text-soft hover:bg-white"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-ink">{display.displayName}</div>
                              <div className="mt-1 text-xs text-faint">{display.roleLabel} · {display.sublabel}</div>
                              <p className="mt-2 text-sm text-soft">{display.summary}</p>
                            </div>
                            <StatusBadge tone="neutral">{agent.knowledgeScope.length}</StatusBadge>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="rounded-[1rem] border border-dashed border-line/70 bg-white/50 px-4 py-4 text-sm text-soft">
                      이 세션에 연결된 전문가가 아직 없습니다.
                    </div>
                  )}
                </div>

                <div className="mt-6 border-t border-line/70 pt-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.24em] text-faint">세션 기록</div>
                      <div className="mt-1 text-sm text-soft">저장된 세션을 다시 불러와 이어서 검토합니다.</div>
                    </div>
                    <StatusBadge tone="neutral">{history.length}</StatusBadge>
                  </div>
                  <div className="mt-4 space-y-2">
                    {history.length > 0 ? (
                      history.slice(0, 3).map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => restoreHistory(entry)}
                          className="w-full rounded-[1rem] border border-line/70 bg-white/70 px-3 py-3 text-left transition hover:bg-white"
                        >
                          <div className="text-sm font-semibold text-ink">{entry.question}</div>
                          <div className="mt-1 text-xs text-faint">{formatTimestamp(entry.createdAt)}</div>
                        </button>
                      ))
                    ) : (
                      <div className="rounded-[1rem] border border-dashed border-line/70 bg-white/50 px-3 py-4 text-sm text-soft">
                        첫 토론 세션이 저장되면 여기에서 다시 불러올 수 있습니다.
                      </div>
                    )}
                  </div>
                </div>
              </SurfaceCard>
            </div>

            <div className="space-y-6">
              <SurfaceCard tone="contrast" className="rounded-panel p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.28em] text-faint">세션 요약</div>
                    <h4 className="mt-2 text-xl font-semibold text-ink">핵심 요약</h4>
                  </div>
                  {sessionGeneratedAt ? <StatusBadge tone="neutral">{formatTimestamp(sessionGeneratedAt)}</StatusBadge> : null}
                </div>
                {(discussionPhase === "discussing" || discussionPhase === "completed") && (refinedQuestion || question) ? (
                  <div className="mt-4 rounded-[1.1rem] border border-line/70 bg-white/80 px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.22em] text-faint">토론 질문</div>
                    <p className="mt-2 text-sm leading-6 text-ink">{refinedQuestion || question}</p>
                  </div>
                ) : null}
                <p className="mt-4 text-sm leading-7 text-soft">{discussionView.summary}</p>

                {discussionView.contextBudget ? (
                  <div className="mt-5 rounded-[1.1rem] border border-research/15 bg-white/75 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.22em] text-faint">Context budget</div>
                        <p className="mt-1 text-sm text-soft">원문 전사를 다음 라운드와 synthesis에 compact brief로 압축했습니다.</p>
                      </div>
                      <StatusBadge tone="research">{discussionView.contextBudget.compactedTurnCount} briefs</StatusBadge>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-5">
                      {[
                        ["Agents", discussionView.contextBudget.agentCount],
                        ["Rounds", discussionView.contextBudget.roundCount],
                        ["Evidence", discussionView.contextBudget.evidenceCount],
                        ["Raw turns", discussionView.contextBudget.rawTurnCount],
                        ["Compacted", discussionView.contextBudget.compactedTurnCount]
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-[0.9rem] border border-line/70 bg-surface-muted/55 px-3 py-3">
                          <div className="text-[11px] uppercase tracking-[0.18em] text-faint">{label}</div>
                          <div className="mt-1 text-sm font-semibold text-ink">{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {discussionView.validatedConstraints.length > 0 ? (
                  <div className="mt-5 rounded-[1.1rem] border border-research/15 bg-white/75 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.22em] text-faint">{isAdvancedMode ? "적용된 승인 constraint" : "적용된 안전 조건"}</div>
                        <p className="mt-1 text-sm text-soft">{isAdvancedMode ? "이번 세션의 토론·가설 검증에 실제 주입된 numeric safe bounds입니다." : "토론과 가설 검증에 반영된 공정 안전 범위입니다."}</p>
                      </div>
                      <StatusBadge tone="success">{discussionView.validatedConstraints.length} {isAdvancedMode ? "approved" : "active"}</StatusBadge>
                    </div>
                    <div className="mt-4 space-y-3">
                      {discussionView.validatedConstraints.map((constraint) => (
                        <div key={constraint.constraint_id} className="rounded-[0.95rem] border border-line/70 bg-surface-muted/55 px-3 py-3">
                          {isAdvancedMode ? (
                            <div className="flex flex-wrap gap-2">
                              <StatusBadge tone="success">approved</StatusBadge>
                              <StatusBadge tone="neutral">{constraint.constraint_type}</StatusBadge>
                              <span className="rounded-full bg-white/80 px-2 py-1 text-[11px] font-medium text-faint">{constraint.constraint_id}</span>
                            </div>
                          ) : null}
                          <p className="mt-2 text-sm font-medium leading-6 text-ink">{constraint.text}</p>
                          <NumericBoundsList bounds={constraint.numeric_bounds} />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {discussionView.hypotheses.length > 0 ? (
                  <div className="mt-5">
                    <HypothesisWorkspaceSection
                      hypotheses={discussionView.hypotheses}
                      validations={discussionView.validations}
                      hypothesisRankings={discussionView.hypothesisRankings}
                      selectedHypothesisId={discussionView.selectedHypothesisId}
                      compact
                    />
                  </div>
                ) : null}

                <div className="mt-5 grid gap-5 lg:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-[0.22em] text-faint">다음 실행</div>
                    <div className="mt-3 space-y-2">
                      {discussionView.nextActions.length > 0 ? (
                        discussionView.nextActions.map((action) => (
                          <div key={action} className="rounded-[1rem] border border-line/70 bg-white/70 px-3 py-3 text-sm text-soft">
                            {action}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-[1rem] border border-dashed border-line/70 bg-white/50 px-3 py-3 text-sm text-soft">
                          다음 action이 아직 정리되지 않았습니다.
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.22em] text-faint">열린 질문</div>
                    <div className="mt-3 space-y-2">
                      {discussionView.openQuestions.length > 0 ? (
                        discussionView.openQuestions.map((item) => (
                          <div key={item} className="rounded-[1rem] border border-line/70 bg-white/70 px-3 py-3 text-sm text-soft">
                            {item}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-[1rem] border border-dashed border-line/70 bg-white/50 px-3 py-3 text-sm text-soft">
                          열린 질문이 아직 없습니다.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </SurfaceCard>

              <SurfaceCard className="rounded-panel p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.28em] text-faint">토론 전개</div>
                    <h4 className="mt-2 text-xl font-semibold text-ink">라운드 전사</h4>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {isAdvancedMode ? (
                      <button
                        type="button"
                        aria-pressed={isDeveloperMode}
                        onClick={toggleDeveloperMode}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition ${isDeveloperMode ? "border-research/30 bg-research/10 text-research" : "border-line/80 bg-white/70 text-soft hover:border-research/25 hover:text-research"}`}
                      >
                        개발자 모드 {isDeveloperMode ? "ON" : "OFF"}
                      </button>
                    ) : null}
                    <StatusBadge tone="neutral">{activeDiscussion.length}개 발언</StatusBadge>
                  </div>
                </div>
                <div className="mt-4 space-y-4">
                  {activeDiscussion.map((turn, index) => {
                    const turnKey = `${turn.agent}-${index}`;
                    const relatedEvidence = discussionView.evidence.filter((item) =>
                      turn.evidenceIds?.includes(item.evidenceId) || turn.references?.includes(item.title)
                    );
                    const isExpanded = expandedTurnKey === turnKey;
                    const isModeratorTurn = turn.agentId === "moderator" || turn.agent === "토론 진행자";
                    const matchedAgent = projectAgents.find((agent) => agent.agentId === turn.agentId) ?? discussionView.agents.find((agent) => agent.agentId === turn.agentId);
                    const turnDisplay = isModeratorTurn
                      ? {
                          displayName: "🧭 토론 진행자",
                          roleLabel: "라운드 중간 분석",
                          sublabel: "합의점·공백·후속 포인트 정리",
                          summary: "직전 라운드의 공통점과 아직 비어 있는 검증 포인트를 정리합니다.",
                          stanceLabel: "진행"
                        }
                      : matchedAgent
                        ? formatAgentDisplay(matchedAgent)
                        : {
                            displayName: `🧑‍🔬 🧠 ${turn.agent}`,
                            roleLabel: "연구 에이전트",
                            sublabel: turn.agent,
                            summary: "현재 질문과 연결된 근거와 관점을 바탕으로 응답했습니다.",
                            stanceLabel: turn.stance ?? "의견"
                          };
                    const structuredClaim = turn.claim ?? turn.structuredOutput?.claim;
                    const reasoning = turn.reasoning ?? turn.structuredOutput?.reasoning;
                    const evidenceStrength = turn.evidenceStrength ?? turn.structuredOutput?.evidenceStrength;
                    const unsupportedClaims = turn.unsupportedClaims ?? turn.structuredOutput?.unsupportedClaims ?? [];
                    const constraintRisks = turn.constraintRisks ?? turn.structuredOutput?.constraintRisks ?? [];
                    const uncertainties = turn.uncertainties ?? turn.structuredOutput?.uncertainties ?? [];
                    const experimentProposal = turn.experimentProposal ?? turn.structuredOutput?.experimentProposal;
                    const boBridgeNote = turn.boBridgeNote ?? turn.structuredOutput?.boBridgeNote;
                    const structuredEvidenceIds = turn.structuredOutput?.evidenceIds ?? turn.evidenceIds ?? [];
                    const developerChunks = turn.sourceChunks ?? [];

                    return (
                      <SurfaceCard key={turnKey} tone={isModeratorTurn ? "contrast" : "default"} className={`rounded-[1.2rem] p-4 ${isModeratorTurn ? "border border-research/20 bg-[rgba(228,239,255,0.74)]" : ""}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs uppercase tracking-[0.22em] text-faint">라운드 {index + 1}</div>
                            <div className="mt-1 text-sm font-semibold text-ink">{turnDisplay.displayName}</div>
                            <div className="mt-1 text-xs text-faint">{turnDisplay.sublabel}</div>
                          </div>
                          <StatusBadge tone={isModeratorTurn ? "research" : "neutral"}>{turnDisplay.stanceLabel}</StatusBadge>
                        </div>
                        <p className={`mt-3 text-sm leading-6 ${isModeratorTurn ? "text-ink" : "text-soft"}`}>{turn.message}</p>
                        {!isModeratorTurn && (structuredClaim || reasoning || evidenceStrength || unsupportedClaims.length > 0 || constraintRisks.length > 0 || uncertainties.length > 0 || experimentProposal || boBridgeNote || structuredEvidenceIds.length > 0) ? (
                          <div className="mt-4 rounded-[1rem] border border-line/70 bg-white/72 px-4 py-4">
                            <div className="text-xs uppercase tracking-[0.22em] text-faint">Structured brief</div>
                            {structuredClaim ? <p className="mt-2 text-sm font-semibold leading-6 text-ink">Claim · {structuredClaim}</p> : null}
                            {reasoning ? <p className="mt-2 text-xs leading-5 text-soft"><span className="font-semibold text-ink">Reasoning</span> · {reasoning}</p> : null}
                            {evidenceStrength ? (
                              <div className="mt-3">
                                <StatusBadge tone={evidenceStrength === "strong" ? "research" : "neutral"}>Evidence {evidenceStrength}</StatusBadge>
                              </div>
                            ) : null}
                            {constraintRisks.length > 0 ? (
                              <div className="mt-3 rounded-[0.9rem] border border-amber-200/70 bg-amber-50/70 px-3 py-3 text-xs leading-5 text-amber-900">
                                <span className="font-semibold">Constraint risk</span> · {constraintRisks[0]}
                              </div>
                            ) : null}
                            {uncertainties[0] || experimentProposal ? (
                              <div className="mt-3 grid gap-2 md:grid-cols-2">
                                {uncertainties[0] ? (
                                  <div className="rounded-[0.9rem] border border-line/70 bg-surface-muted/60 px-3 py-3 text-xs leading-5 text-soft">
                                    <span className="font-semibold text-ink">Uncertainty</span> · {uncertainties[0]}
                                  </div>
                                ) : null}
                                {experimentProposal ? (
                                  <div className="rounded-[0.9rem] border border-line/70 bg-surface-muted/60 px-3 py-3 text-xs leading-5 text-soft">
                                    <span className="font-semibold text-ink">Experiment proposal</span> · {experimentProposal}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                            {unsupportedClaims.length > 0 ? (
                              <div className="mt-3 rounded-[0.9rem] border border-amber-200/70 bg-amber-50/70 px-3 py-3 text-xs leading-5 text-amber-900">
                                <span className="font-semibold">Unsupported</span> · {unsupportedClaims[0]}
                              </div>
                            ) : null}
                            {boBridgeNote ? <p className="mt-3 text-xs leading-5 text-research">BO bridge · {boBridgeNote}</p> : null}
                            {structuredEvidenceIds.length > 0 ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {structuredEvidenceIds.slice(0, 4).map((evidenceId) => (
                                  <span key={`${turnKey}-${evidenceId}`} className="rounded-full bg-surface-muted px-2 py-1 text-[11px] font-medium text-faint">
                                    {evidenceId}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        {!isModeratorTurn && turn.references?.length ? (
                          <div className="mt-4">
                            <div className="text-xs uppercase tracking-[0.22em] text-faint">참고 근거</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {turn.references.map((reference) => (
                                <StatusBadge key={`${turn.agent}-${reference}`} tone="neutral">
                                  {reference}
                                </StatusBadge>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {isAdvancedMode && isDeveloperMode && !isModeratorTurn ? (
                          <div className="mt-4 rounded-[1rem] border border-slate-300/70 bg-slate-950 px-4 py-4 text-slate-100 shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Developer chunks</div>
                              <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-medium text-slate-300">{developerChunks.length} chunks</span>
                            </div>
                            {developerChunks.length > 0 ? (
                              <div className="mt-3 space-y-3">
                                {developerChunks.map((chunk) => (
                                  <div key={`${turnKey}-${chunk.chunkId}`} className="rounded-[0.85rem] border border-white/10 bg-white/[0.06] px-3 py-3">
                                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                                      <span className="font-mono text-slate-200">{chunk.chunkId}</span>
                                      <span>{chunk.documentName}</span>
                                      <span>·</span>
                                      <span>{chunk.sectionTitle}</span>
                                    </div>
                                    <p className="mt-2 text-xs leading-5 text-slate-300">{chunk.contentPreview}</p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-3 text-xs leading-5 text-slate-400">이 발언에 연결된 source chunk가 없습니다.</p>
                            )}
                          </div>
                        ) : null}
                        {!isModeratorTurn && relatedEvidence.length > 0 ? (
                          <div className="mt-4">
                            <button
                              type="button"
                              onClick={() => setExpandedTurnKey(isExpanded ? null : turnKey)}
                              className="text-xs font-medium uppercase tracking-[0.22em] text-research"
                            >
                              {isExpanded ? "근거 접기" : "근거 펼치기"}
                            </button>
                            {isExpanded ? (
                              <div className="mt-3 space-y-3">
                                {relatedEvidence.slice(0, 3).map((item) => (
                                  <div key={item.evidenceId} className="rounded-[1rem] border border-line/70 bg-white/70 px-4 py-4">
                                    <div className="text-sm font-semibold text-ink">{item.title}</div>
                                    <div className="mt-1 text-xs text-faint">
                                      {item.source} · {item.year}
                                    </div>
                                    <p className="mt-3 text-sm leading-6 text-soft">{item.excerpt}</p>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </SurfaceCard>
                    );
                  })}
                </div>
              </SurfaceCard>
            </div>
          </div>
        ) : null}

        {workspaceView === "validation" ? (
          <div className="space-y-6">
            <SurfaceCard className="rounded-panel p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.28em] text-faint">브레인 스토밍 목표</div>
                  <h4 className="mt-2 text-2xl font-semibold text-ink">AI 랜덤 가설 설정</h4>
                  <p className="mt-2 text-sm leading-6 text-soft">달성하고 싶은 목표를 입력하면 AI가 창의 가설 후보를 만들고, 전문가들이 근거 중심으로 의견을 붙입니다.</p>
                </div>
                <StatusBadge tone="research">브레인 스토밍</StatusBadge>
              </div>

              <div className="mt-5 rounded-[1.4rem] border border-line/70 bg-white/80 p-5">
                <label className="text-xs uppercase tracking-[0.22em] text-faint">목표 입력</label>
                <textarea
                  value={validationGoal}
                  onChange={(event) => setValidationGoal(event.target.value)}
                  placeholder="예: methane ratio를 안정화하면서 substrate 탐색 범위를 넓히는 가장 설득력 있는 실험 계획을 제안해 주세요."
                  className="mt-3 min-h-36 w-full rounded-[1.2rem] border border-line bg-white px-4 py-3 text-sm leading-6 text-ink outline-none transition focus:border-research/40 focus:ring-2 focus:ring-research/10"
                />
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="rounded-[1rem] border border-line/70 bg-surface-muted/60 px-3 py-3 text-sm text-soft">
                    <span className="text-[11px] uppercase tracking-[0.2em] text-faint">검증 전문가 수</span>
                    <select
                      value={validationOptions.experts}
                      onChange={(event) => setValidationOptions((current) => ({ ...current, experts: Number(event.target.value) }))}
                      className="mt-2 w-full bg-transparent text-sm text-ink outline-none"
                    >
                      {[3, 4, 5, 6, 8, 10, 12].map((count) => (
                        <option key={count} value={count}>
                          {count}명
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="rounded-[1rem] border border-line/70 bg-surface-muted/60 px-3 py-3 text-sm text-soft">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-faint">자동 추가 검증</div>
                    <div className="mt-2 font-medium text-ink">불완전하면 2차 pass</div>
                    <p className="mt-1 text-xs leading-5 text-faint">근거·신뢰도·판별 실험이 부족할 때 한 번 더 검증합니다.</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-soft">{status}</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedValidationRun ? (
                      <ActionButton type="button" tone="neutral" variant="subtle" onClick={() => handleHypothesisExplorationStart(selectedValidationRun.goal)} disabled={isRunning || !selectedValidationRun.goal.trim()}>
                        같은 목표 재실행
                      </ActionButton>
                    ) : null}
                    <ActionButton type="button" tone="research" onClick={() => handleHypothesisExplorationStart(validationGoal)} disabled={isRunning || !validationGoal.trim()}>
                      {isValidationRequestRunning ? "가설 생성 중..." : "검증 실행"}
                    </ActionButton>
                  </div>
                </div>
              </div>
            </SurfaceCard>

            <SurfaceCard className="rounded-panel p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-faint">최근 실행</div>
                  <h4 className="mt-2 text-xl font-semibold text-ink">브레인 스토밍 run 목록</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge tone="neutral">{validationRuns.length}</StatusBadge>
                  {selectedValidationRun ? <StatusBadge tone="research">선택됨</StatusBadge> : null}
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {validationRuns.length > 0 ? (
                  validationRuns.map((entry) => {
                    const selectedTitle = entry.hypotheses.find((item) => item.hypothesisId === entry.selectedHypothesisId)?.title ?? entry.hypotheses[0]?.title ?? "가설 준비 중";
                    const isSelected = entry.id === selectedValidationRun?.id;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => {
                          setSelectedValidationRunId(entry.id);
                          setValidationGoal(entry.goal);
                        }}
                        className={`rounded-[1.1rem] border px-4 py-4 text-left transition ${
                          isSelected ? "border-line-strong bg-white text-ink shadow-card" : "border-line bg-surface-muted text-soft hover:bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-ink line-clamp-2">{entry.goal}</div>
                            <div className="mt-1 text-xs text-faint">{formatTimestamp(entry.createdAt)}</div>
                          </div>
                          <StatusBadge tone={isSelected ? "research" : "neutral"}>{entry.hypotheses.length}</StatusBadge>
                        </div>
                        <div className="mt-3 text-xs leading-5 text-faint">선택 가설 · {selectedTitle}</div>
                        <div className="mt-2 text-xs leading-5 text-faint">검증 pass {entry.validationPasses}회 · {entry.validationComplete ? "충분" : "추가 검토 필요"}</div>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-[1rem] border border-dashed border-line/70 bg-white/50 px-4 py-4 text-sm text-soft md:col-span-2 xl:col-span-3">
                    아직 실행한 브레인 스토밍 run이 없습니다. 목표를 입력하고 첫 AI 가설 생성을 시작하세요.
                  </div>
                )}
              </div>
            </SurfaceCard>

            {selectedValidationRun ? (
              <>
                <SurfaceCard tone="contrast" className="rounded-panel p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.24em] text-faint">선택된 run</div>
                      <h4 className="mt-2 text-xl font-semibold text-ink">검증 요약</h4>
                    </div>
                    <StatusBadge tone={validationPhase === "completed" ? "research" : "neutral"}>{formatTimestamp(selectedValidationRun.createdAt)}</StatusBadge>
                  </div>
                  <div className="mt-4 rounded-[1.1rem] border border-line/70 bg-white/80 px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.22em] text-faint">목표</div>
                    <p className="mt-2 text-sm leading-6 text-ink">{selectedValidationRun.goal}</p>
                  </div>
                  <p className="mt-4 text-sm leading-7 text-soft">{selectedValidationRun.summary}</p>
                  <div className="mt-4 rounded-[1rem] border border-line/70 bg-white/70 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs uppercase tracking-[0.22em] text-faint">검증 pass</div>
                      <StatusBadge tone={selectedValidationRun.validationComplete ? "success" : "neutral"}>
                        {selectedValidationRun.validationPasses}회 · {selectedValidationRun.validationComplete ? "충분" : "추가 검토 필요"}
                      </StatusBadge>
                    </div>
                    {selectedValidationRun.validationGapReasons.length > 0 ? (
                      <div className="mt-3 space-y-1 text-xs leading-5 text-faint">
                        {selectedValidationRun.validationGapReasons.map((reason) => (
                          <div key={reason}>· {reason}</div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                    <div>
                      <div className="text-xs uppercase tracking-[0.22em] text-faint">다음 실행</div>
                      <div className="mt-3 space-y-2">
                        {selectedValidationRun.nextActions.length > 0 ? (
                          selectedValidationRun.nextActions.map((action) => (
                            <div key={action} className="rounded-[1rem] border border-line/70 bg-white/70 px-3 py-3 text-sm text-soft">
                              {action}
                            </div>
                          ))
                        ) : (
                          <div className="rounded-[1rem] border border-dashed border-line/70 bg-white/50 px-3 py-3 text-sm text-soft">
                            다음 action이 아직 정리되지 않았습니다.
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.22em] text-faint">열린 질문</div>
                      <div className="mt-3 space-y-2">
                        {selectedValidationRun.openQuestions.length > 0 ? (
                          selectedValidationRun.openQuestions.map((item) => (
                            <div key={item} className="rounded-[1rem] border border-line/70 bg-white/70 px-3 py-3 text-sm text-soft">
                              {item}
                            </div>
                          ))
                        ) : (
                          <div className="rounded-[1rem] border border-dashed border-line/70 bg-white/50 px-3 py-3 text-sm text-soft">
                            열린 질문이 아직 없습니다.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </SurfaceCard>

                <HypothesisWorkspaceSection
                  hypotheses={selectedValidationRun.hypotheses}
                  validations={selectedValidationRun.validations}
                  hypothesisRankings={selectedValidationRun.hypothesisRankings}
                  selectedHypothesisId={selectedValidationRun.selectedHypothesisId}
                  compact={false}
                />
              </>
            ) : (
              <HypothesisWorkspaceSection
                hypotheses={[]}
                validations={[]}
                hypothesisRankings={[]}
                selectedHypothesisId={null}
              />
            )}
          </div>
        ) : null}

        {workspaceView === "graph" ? (
          <div className="grid gap-6 2xl:grid-cols-[300px_minmax(0,1fr)_320px]">
            <div className="space-y-6">
              <SurfaceCard className="rounded-panel border border-white/70 bg-white/82 p-5 shadow-card backdrop-blur">
                <div className="text-xs uppercase tracking-[0.24em] text-faint">탐색 도구</div>
                <h4 className="mt-2 text-xl font-semibold text-ink">필터와 검색</h4>
                <input
                  value={graphSearch}
                  onChange={(event) => setGraphSearch(event.target.value)}
                  placeholder="엔티티명, 요약, 타입 검색"
                  className="mt-4 w-full rounded-[1.1rem] border border-line bg-surface-muted px-4 py-3 text-sm outline-none transition focus:border-research/40 focus:bg-white"
                />
                <div className="mt-4 space-y-3">
                  {graphTypes.map((type) => (
                    <label
                      key={type}
                      className="flex items-center justify-between rounded-[1.1rem] border border-line bg-white px-4 py-3"
                    >
                      <span className="flex items-center gap-3 text-sm font-medium text-soft">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: GRAPH_NODE_COLORS[type] ?? "#74839b" }} />
                        {type}
                      </span>
                      <input
                        type="checkbox"
                        checked={graphTypeFilter.length === 0 || graphTypeFilter.includes(type)}
                        onChange={() => toggleGraphType(type)}
                        className="h-4 w-4 rounded border-line text-research focus:ring-research"
                      />
                    </label>
                  ))}
                </div>
              </SurfaceCard>

              <SurfaceCard className="rounded-panel border border-white/70 bg-white/82 p-5 shadow-card backdrop-blur">
                <div className="text-xs uppercase tracking-[0.24em] text-faint">관계 범례</div>
                <div className="mt-4 space-y-3">
                  {Object.entries(GRAPH_EDGE_COLORS).map(([type, color]) => (
                    <div key={type} className="flex items-center gap-3 text-sm text-soft">
                      <span className="h-[3px] w-8 rounded-full" style={{ backgroundColor: color }} />
                      <span>{type}</span>
                    </div>
                  ))}
                </div>
              </SurfaceCard>

              <SurfaceCard className="rounded-panel border border-white/70 bg-white/82 p-5 shadow-card backdrop-blur">
                <div className="text-xs uppercase tracking-[0.24em] text-faint">사용법</div>
                <ul className="mt-3 space-y-2 text-xs leading-5 text-faint">
                  <li>노드에 마우스를 올리면 연결 라벨과 인접 엔티티가 강조됩니다.</li>
                  <li>노드나 엣지를 클릭하면 우측 선택 상세에 정보가 표시됩니다.</li>
                  <li>휠로 확대하면 더 많은 라벨을 볼 수 있습니다.</li>
                  <li>전체 화면에서는 ESC 키로 빠르게 닫을 수 있습니다.</li>
                </ul>
              </SurfaceCard>
            </div>

            <SurfaceCard className="relative rounded-panel border border-white/70 bg-white/82 p-4 shadow-card backdrop-blur">
              <button
                type="button"
                onClick={() => setIsGraphFullscreen(true)}
                className="absolute right-6 top-6 z-10 rounded-full border border-line bg-white/90 px-3 py-1.5 text-xs font-semibold text-soft shadow-sm transition hover:bg-white hover:text-ink"
                title="전체 화면"
              >
                ⛶ 전체 화면
              </button>
              <div className="mb-3 flex flex-col gap-3 px-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-faint">지식 그래프</div>
                  <div className="mt-1 text-sm text-soft">{filteredGraphSummary}</div>
                  {graphLoadState === "loading" ? (
                    <div className="mt-1 text-xs text-faint animate-pulse">그래프 로딩 중…</div>
                  ) : graphLoadState === "error" ? (
                    <button type="button" className="mt-1 text-xs text-red-500 underline" onClick={() => { hasLoadedGraph.current = false; void loadProjectGraph(); }}>불러오기 실패 — 재시도</button>
                  ) : filteredGraphNodes.length > graphDisplayLimit ? (
                    <div className="mt-1 flex items-center gap-3">
                      <span className="text-xs text-faint">전체 {filteredGraphNodes.length}개 중 상위 {graphDisplayLimit}개 표시</span>
                      <button type="button" className="text-xs font-medium text-research underline" onClick={() => setGraphDisplayLimit((n) => Math.min(n + 200, filteredGraphNodes.length))}>+200개 더 보기</button>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge tone="neutral">노드 {renderGraphData.nodes.length}</StatusBadge>
                  <StatusBadge tone="neutral">엣지 {renderGraphData.links.length}</StatusBadge>
                </div>
              </div>
              <div ref={graphContainerRef} className="h-[620px] overflow-hidden rounded-[1.5rem] bg-[rgba(235,241,249,0.78)]">
                {graphLoadState === "idle" || graphLoadState === "loading" ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-sm text-faint">{graphLoadState === "loading" ? "지식 그래프 불러오는 중…" : "그래프 탭을 열면 자동으로 로드됩니다."}</div>
                  </div>
                ) : !isGraphFullscreen ? (
                  <ForceGraph2D
                    ref={forceGraphRef}
                    width={graphSize.width}
                    height={graphSize.height}
                    graphData={renderGraphData}
                    backgroundColor="rgba(0,0,0,0)"
                    nodeRelSize={6}
                    cooldownTicks={120}
                    linkWidth={graphLinkWidth}
                    linkColor={graphLinkColor}
                    nodeLabel=""
                    onNodeHover={handleGraphNodeHover}
                    onNodeClick={handleGraphNodeClick}
                    onLinkClick={handleGraphLinkClick}
                    nodeCanvasObject={drawGraphNode}
                    linkCanvasObjectMode={() => "after"}
                    linkCanvasObject={drawGraphLinkLabel}
                  />
                ) : null}
              </div>

              {isGraphFullscreen && isMounted
                ? createPortal(
                    <div
                      ref={fullscreenGraphContainerRef}
                      className="fixed inset-0 z-[100] bg-[rgba(240,245,252,0.97)]"
                    >
                      <div className="absolute right-4 top-4 z-10 flex items-center gap-3">
                        <div className="flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-xs font-semibold text-soft shadow-sm">
                          <span>노드 {renderGraphData.nodes.length}</span>
                          <span className="text-line">|</span>
                          <span>엣지 {renderGraphData.links.length}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsGraphFullscreen(false)}
                          className="rounded-full border border-line bg-white/90 px-3 py-2 text-xs font-semibold text-soft shadow-sm transition hover:bg-white hover:text-ink"
                          title="전체 화면 닫기 (ESC)"
                        >
                          ✕ 닫기
                        </button>
                      </div>
                      <ForceGraph2D
                        ref={forceGraphRef}
                        width={graphSize.width}
                        height={graphSize.height}
                        graphData={renderGraphData}
                        backgroundColor="rgba(0,0,0,0)"
                        nodeRelSize={6}
                        cooldownTicks={120}
                        linkWidth={graphLinkWidth}
                        linkColor={graphLinkColor}
                        nodeLabel=""
                        onNodeHover={handleGraphNodeHover}
                        onNodeClick={handleGraphNodeClick}
                        onLinkClick={handleGraphLinkClick}
                        nodeCanvasObject={drawGraphNode}
                        linkCanvasObjectMode={() => "after"}
                        linkCanvasObject={drawGraphLinkLabel}
                      />

                      {(graphDetailMode === "node" && selectedNode) || (graphDetailMode === "edge" && selectedEdgeDetail) ? (
                        <div className="absolute bottom-4 left-4 z-10 w-80 max-h-[60vh] overflow-y-auto rounded-[24px] border border-white/70 bg-white/90 p-5 shadow-lg backdrop-blur">
                          <div className="flex items-center justify-between">
                            <div className="text-xs uppercase tracking-[0.24em] text-faint">상세 정보</div>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedNodeId(null);
                                setSelectedEdgeId(null);
                                setGraphDetailMode(null);
                              }}
                              className="text-xs text-faint hover:text-soft"
                            >
                              ✕
                            </button>
                          </div>
                          {graphDetailMode === "node" && selectedNode ? <GraphNodeDetailCard node={selectedNode} linkedEvidence={linkedEvidence} /> : null}
                          {graphDetailMode === "edge" && selectedEdgeDetail ? <GraphEdgeDetailCard edge={selectedEdgeDetail} evidence={selectedEdgeEvidence} /> : null}
                        </div>
                      ) : null}
                    </div>,
                    document.body
                  )
                : null}
            </SurfaceCard>

            <SurfaceCard className="rounded-panel border border-white/70 bg-white/82 p-5 shadow-card backdrop-blur">
              <div className="text-xs uppercase tracking-[0.24em] text-faint">선택 상세</div>
              <div className="mt-2 text-sm text-soft">선택한 노드 또는 관계의 세부 정보를 확인합니다.</div>
              {graphDetailMode === "node" && selectedNode ? (
                <GraphNodeDetailCard node={selectedNode} linkedEvidence={linkedEvidence} />
              ) : null}
              {graphDetailMode === "edge" && selectedEdgeDetail ? (
                <GraphEdgeDetailCard edge={selectedEdgeDetail} evidence={selectedEdgeEvidence} />
              ) : null}
              {graphDetailMode == null ? (
                <div className="mt-6 rounded-[24px] border border-dashed border-line px-4 py-8 text-sm leading-6 text-faint">
                  노드나 엣지를 클릭하면 상세 정보가 여기에 표시됩니다.
                </div>
              ) : null}
            </SurfaceCard>
          </div>
        ) : null}

        {workspaceView === "agents" ? (
          <div className="space-y-6">
            <SurfaceCard className="rounded-panel p-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.28em] text-faint">전문가 구성</div>
                  <h4 className="mt-2 text-2xl font-semibold text-ink">전문가 에이전트 패널</h4>
                  <p className="mt-2 text-sm leading-6 text-soft">지식 그래프와 토론 세션을 바탕으로 구성된 전체 전문가 목록을 접고 펼치는 행 구조로 확인합니다.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge tone="research">에이전트 {projectAgents.length}명</StatusBadge>
                  <StatusBadge tone="neutral">확장 가능</StatusBadge>
                </div>
              </div>
            </SurfaceCard>

            {(() => {
              const sorted = [...projectAgents].sort((a, b) => b.knowledgeScope.length - a.knowledgeScope.length);
              const pipelineAgents = sorted.filter((a) => a.agentId.startsWith("agent-"));
              const domainAgents = sorted.filter((a) => a.agentId.startsWith("wbg-"));

              const renderAgent = (agent: ResearchAgentCard) => {
                const isExpanded = expandedAgentId === agent.agentId;
                const display = formatAgentDisplay(agent);
                return (
                  <div key={agent.agentId} className="group bg-white/80">
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedAgentId(isExpanded ? null : agent.agentId);
                        setSelectedAgentId(agent.agentId);
                      }}
                      className="flex w-full items-start gap-4 px-6 py-4 text-left transition hover:bg-surface-muted/55"
                    >
                      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface-muted text-lg">
                        {display.displayName.split(" ").slice(0, 2).join(" ")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-ink">{agent.role}</span>
                          <StatusBadge tone="neutral">{display.stanceLabel}</StatusBadge>
                        </div>
                        <div className="mt-1 text-xs text-faint">{display.roleLabel}</div>
                        <p className="mt-1 text-xs leading-5 text-soft">{agent.expertise ?? agent.focus}</p>
                      </div>
                      <span className="hidden shrink-0 rounded-full bg-surface-muted px-2.5 py-0.5 text-[11px] font-medium text-faint sm:block">
                        청크 {agent.knowledgeScope.length}건
                      </span>
                      <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
                        {agent.evidenceFocus.slice(0, 3).map((term) => (
                          <span key={term} className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] text-faint">{term}</span>
                        ))}
                        {agent.evidenceFocus.length > 3 ? <span className="text-[11px] text-faint">+{agent.evidenceFocus.length - 3}</span> : null}
                      </div>
                      <span className="mt-1 shrink-0 text-xs text-faint transition group-hover:text-soft">{isExpanded ? "▲" : "▼"}</span>
                    </button>
                    {isExpanded ? (
                      <div className="border-t border-line/70 bg-surface-muted/45 px-6 py-5">
                        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">관점</div>
                            <p className="mt-1.5 text-sm leading-6 text-soft">{agent.perspective ?? agent.focus}</p>
                          </div>
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">도구·방법론</div>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {agent.retrievalTerms.length > 0 ? agent.retrievalTerms.slice(0, 8).map((item) => (
                                <span key={item} className="rounded-full bg-white px-2 py-0.5 text-xs text-soft">{item}</span>
                              )) : <span className="text-sm text-soft">표시 가능한 도구·방법론 정보가 없습니다.</span>}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">핵심 용어</div>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {agent.evidenceFocus.length > 0 ? agent.evidenceFocus.map((item) => (
                                <span key={item} className="rounded-full bg-white px-2 py-0.5 text-xs text-soft">{item}</span>
                              )) : <span className="text-sm text-soft">핵심 용어 정보가 없습니다.</span>}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">담당 역할</div>
                            <p className="mt-1.5 text-sm leading-6 text-soft">{display.sublabel}</p>
                          </div>
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">청크 범위</div>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {agent.knowledgeScope.length > 0 ? agent.knowledgeScope.slice(0, 10).map((item) => (
                                <span key={item} className="rounded-full bg-white px-2 py-0.5 text-xs text-faint">{item}</span>
                              )) : <span className="text-sm text-soft">청크 범위 정보가 없습니다.</span>}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">요약</div>
                            <p className="mt-1.5 text-sm leading-6 text-soft">{display.summary}</p>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              };

              return (
                <>
                  {pipelineAgents.length > 0 ? (
                    <SurfaceCard className="overflow-hidden rounded-panel p-0">
                      <div className="border-b border-line/70 bg-research/5 px-6 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-[11px] uppercase tracking-[0.24em] text-research/70">파이프라인 역할 에이전트</div>
                            <p className="mt-1 text-sm text-soft">토론·검증 세션에서 역할 기반으로 참여하는 에이전트</p>
                          </div>
                          <StatusBadge tone="research">{pipelineAgents.length}명</StatusBadge>
                        </div>
                      </div>
                      <div className="divide-y divide-line/70">
                        {pipelineAgents.map(renderAgent)}
                      </div>
                    </SurfaceCard>
                  ) : null}

                  {domainAgents.length > 0 ? (
                    <SurfaceCard className="overflow-hidden rounded-panel p-0">
                      <div className="border-b border-line/70 bg-surface-muted/60 px-6 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-[11px] uppercase tracking-[0.24em] text-faint">도메인 전문가 · WBG 논문 기반</div>
                            <p className="mt-1 text-sm text-soft">실제 연구 논문에서 추출된 MPCVD 다이아몬드 도메인 전문가</p>
                          </div>
                          <StatusBadge tone="neutral">{domainAgents.length}명</StatusBadge>
                        </div>
                      </div>
                      <div className="divide-y divide-line/70">
                        {domainAgents.map(renderAgent)}
                      </div>
                    </SurfaceCard>
                  ) : null}
                </>
              );
            })()}
          </div>
        ) : null}

        {workspaceView === "report" ? (
          <div className="space-y-6">
            <SurfaceCard className="rounded-panel p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-faint">보고서 생성</div>
                  <h4 className="mt-2 text-2xl font-semibold text-ink">세션 기반 보고서</h4>
                  <p className="mt-2 text-sm leading-6 text-soft">현재 토론 세션이나 저장 세션을 기반으로 구조화된 보고서 워크스페이스를 생성합니다.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge tone="research">보고서 {generatedReports.length}건</StatusBadge>
                  <StatusBadge tone="neutral">세션 {reportItems.length}건</StatusBadge>
                </div>
              </div>
              <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-faint">특정 질문으로 생성하기</label>
                  <textarea
                    value={reportQuestion}
                    onChange={(event) => setReportQuestion(event.target.value)}
                    placeholder="비워두면 최신 세션 질문을 기준으로 생성합니다."
                    rows={3}
                    className="mt-2 w-full rounded-[1.3rem] border border-line bg-surface-muted px-4 py-3 text-sm leading-6 text-ink outline-none transition focus:border-research/40 focus:bg-white"
                  />
                </div>
                <ActionButton type="button" tone="research" onClick={handleGenerateReport} disabled={isGeneratingReport || reportItems.length === 0}>
                  {isGeneratingReport ? "보고서 생성 중..." : "보고서 생성"}
                </ActionButton>
              </div>
            </SurfaceCard>

            <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
              <SurfaceCard className="rounded-panel p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.24em] text-faint">저장된 보고서</div>
                    <h4 className="mt-2 text-xl font-semibold text-ink">보고서 목록</h4>
                  </div>
                  <StatusBadge tone="neutral">{generatedReports.length}</StatusBadge>
                </div>
                <div className="mt-4 space-y-3">
                  {generatedReports.length > 0 ? (
                    generatedReports.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedReportId(item.id);
                          setExpandedReportSectionIds(["summary"]);
                          setExpandedReportSourceIds([]);
                          setIsReportEvidenceExpanded(false);
                        }}
                        className={`w-full rounded-[1rem] border px-4 py-4 text-left transition ${
                          selectedReport?.id === item.id
                            ? "border-line-strong bg-white text-ink shadow-card"
                            : "border-line bg-surface-muted text-soft hover:bg-white"
                        }`}
                      >
                        <div className="text-xs uppercase tracking-[0.2em] text-faint">{item.title}</div>
                        <div className="mt-2 line-clamp-3 text-sm font-semibold leading-6 text-ink">{item.question}</div>
                        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-faint">
                          <span>{formatTimestamp(item.createdAt)}</span>
                          <span>{item.kind === "auto" ? "자동 생성" : "저장 세션"}</span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-[1rem] border border-dashed border-line/70 bg-white/50 px-4 py-5 text-sm text-soft">
                      토론 세션이 생성되면 보고서 작업공간이 채워집니다.
                    </div>
                  )}
                </div>
              </SurfaceCard>

              <SurfaceCard tone="contrast" className="rounded-panel p-6">
                {selectedReport ? (
                  <>
                    <div className="flex flex-col gap-3 border-b border-line/70 pb-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-[0.24em] text-faint">핵심 요약</div>
                          <h4 className="mt-2 text-2xl font-semibold text-ink">{selectedReport.question}</h4>
                        </div>
                        <StatusBadge tone="research">세션 보고서</StatusBadge>
                      </div>
                      <p className="text-sm leading-6 text-soft">{selectedReport.executiveSummary}</p>
                    </div>

                    <div className="mt-6 grid gap-4 lg:grid-cols-2">
                      <SurfaceCard tone="default" className="rounded-[1.2rem] p-5">
                        <div className="text-xs uppercase tracking-[0.22em] text-faint">핵심 발견</div>
                        <div className="mt-3 space-y-2">
                          {selectedReport.keyFindings.length > 0 ? (
                            selectedReport.keyFindings.map((item, index) => (
                              <div key={`${item}-${index}`} className="rounded-[1rem] bg-white/80 px-4 py-3 text-sm leading-6 text-soft">
                                {item}
                              </div>
                            ))
                          ) : (
                            <div className="rounded-[1rem] border border-dashed border-line/70 bg-white/50 px-4 py-4 text-sm text-soft">
                              핵심 발견이 아직 정리되지 않았습니다.
                            </div>
                          )}
                        </div>
                      </SurfaceCard>

                      <SurfaceCard tone="default" className="rounded-[1.2rem] border border-amber-200 bg-[rgba(255,246,225,0.76)] p-5">
                        <div className="text-xs uppercase tracking-[0.22em] text-faint">열린 질문</div>
                        <div className="mt-3 space-y-2">
                          {selectedReport.openQuestions.length > 0 ? (
                            selectedReport.openQuestions.map((item, index) => (
                              <div key={`${item}-${index}`} className="rounded-[1rem] bg-white/80 px-4 py-3 text-sm leading-6 text-soft">
                                {item}
                              </div>
                            ))
                          ) : (
                            <div className="rounded-[1rem] border border-dashed border-line/70 bg-white/50 px-4 py-4 text-sm text-soft">
                              열린 질문이 아직 정리되지 않았습니다.
                            </div>
                          )}
                        </div>
                      </SurfaceCard>
                    </div>

                    <div className="mt-6 space-y-4">
                      {selectedReport.sections.map((section, sectionIndex) => {
                        const isOpen = expandedReportSectionIds.includes(section.id);
                        const isSourceOpen = expandedReportSourceIds.includes(section.id);
                        return (
                          <SurfaceCard key={section.id} tone="default" className={`rounded-[1.2rem] p-5 ${section.tone === "warning" ? "border border-amber-200 bg-[rgba(255,246,225,0.76)]" : ""}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-xs uppercase tracking-[0.22em] text-faint">섹션 {sectionIndex + 1}</div>
                                <div className="mt-1 text-lg font-semibold text-ink">{section.title}</div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => toggleReportSection(section.id)}
                                  className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-soft transition hover:bg-white hover:text-ink"
                                >
                                  {isOpen ? "접기" : "펼치기"}
                                </button>
                                {section.sources.length > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleReportSources(section.id)}
                                    className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-soft transition hover:bg-white hover:text-ink"
                                  >
                                    {isSourceOpen ? `출처 숨기기 (${section.sources.length})` : `출처 보기 (${section.sources.length})`}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                            {isOpen ? <div className="mt-3 whitespace-pre-line text-sm leading-7 text-soft">{section.body}</div> : null}
                            {isSourceOpen && section.sources.length > 0 ? (
                              <div className="mt-4 grid gap-3">
                                {section.sources.map((item) => (
                                  <SurfaceCard key={`${section.id}-${item.evidenceId}`} tone="default" className="rounded-[1rem] p-4">
                                    <div className="text-sm font-semibold text-ink">{item.title}</div>
                                    <div className="mt-1 text-xs text-faint">{item.source} · {item.year}</div>
                                    <p className="mt-3 text-sm leading-6 text-soft">{item.excerpt}</p>
                                  </SurfaceCard>
                                ))}
                              </div>
                            ) : null}
                          </SurfaceCard>
                        );
                      })}
                    </div>

                    <div className="mt-6">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-[0.22em] text-faint">근거 펼침</div>
                          <div className="mt-1 text-sm text-soft">보고서에 연결된 근거를 확장해 세부 출처를 확인합니다.</div>
                        </div>
                        {selectedReport.evidence.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setIsReportEvidenceExpanded((current) => !current)}
                            className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-soft transition hover:bg-white hover:text-ink"
                          >
                            {isReportEvidenceExpanded ? "근거 접기" : `근거 펼치기 (${selectedReport.evidence.length})`}
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-3 space-y-3">
                        {selectedReport.evidence.length > 0 ? (
                          selectedReport.evidence.slice(0, isReportEvidenceExpanded ? 8 : 3).map((item) => (
                            <SurfaceCard key={item.evidenceId} tone="default" className="rounded-[1rem] p-4">
                              <div className="text-sm font-semibold text-ink">{item.title}</div>
                              <div className="mt-1 text-xs text-faint">
                                {item.source} · {item.year}
                              </div>
                              <p className="mt-3 text-sm leading-6 text-soft">{item.excerpt}</p>
                            </SurfaceCard>
                          ))
                        ) : (
                          <div className="rounded-[1rem] border border-dashed border-line/70 bg-white/50 px-4 py-5 text-sm text-soft">
                            연결된 근거가 아직 없습니다.
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-[1rem] border border-dashed border-line/70 bg-white/50 px-4 py-5 text-sm text-soft">
                    선택 가능한 보고서가 없습니다.
                  </div>
                )}
              </SurfaceCard>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const workspaceEyebrowMap: Record<WorkspaceView, string> = {
  discussion: "토론 콘솔",
  validation: "브레인 스토밍",
  graph: "그래프 워크벤치",
  agents: "확장형 전문가 리스트",
  report: "보고서 상세"
};

const workspaceTitleMap: Record<WorkspaceView, string> = {
  discussion: "전문가 토론",
  validation: "AI 랜덤 가설 설정",
  graph: "지식 그래프",
  agents: "AI 전문가 에이전트",
  report: "연구 보고서"
};

const workspaceDescriptionMap: Record<WorkspaceView, string> = {
  discussion: "질문 입력, 정제, 토론, 세션 복원을 같은 흐름 안에서 다룹니다.",
  validation: "AI가 만든 가설 후보, 전문가 의견, 우선순위를 한 화면에서 정리합니다.",
  graph: "검색, 엔티티 목록, 관계 목록, 그래프 캔버스, 선택 상세를 함께 배치했습니다.",
  agents: "전체 전문가 목록을 접고 펼치는 행 구조로 확인합니다.",
  report: "보고서 생성 진입점과 저장된 보고서 작업공간을 같은 화면에서 다룹니다."
};

function WorkspaceSidebarLink({ href, active, label, detail }: { href: `/dashboard/research?view=${WorkspaceView}`; active: boolean; label: string; detail: string }) {
  return (
    <Link
      href={href}
      className={`flex items-center justify-between rounded-[1.1rem] border px-4 py-3 text-sm font-medium transition ${
        active ? "border-line-strong bg-white text-ink shadow-card" : "border-line bg-surface-muted text-soft hover:bg-white"
      }`}
    >
      <span>{label}</span>
      <span className="text-xs text-faint">{detail}</span>
    </Link>
  );
}

function PhaseBadge({ label, active }: { label: string; active?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.2em] ${
        active ? "border-research/18 bg-research/8 text-research" : "border-line bg-white/60 text-faint"
      }`}
    >
      {label}
    </span>
  );
}

function GraphNodeDetailCard({ node, linkedEvidence }: { node: RenderGraphNode; linkedEvidence?: EvidenceItemDto[] }) {
  const attributes = Object.entries(node.attributes ?? {}).filter(([, value]) => value != null && formatGraphAttributeValue(value) !== "");

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center gap-3">
        <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: node.color }} />
        <div>
          <h3 className="text-xl font-semibold text-ink">{node.label}</h3>
          <p className="text-sm text-faint">{node.nodeType}</p>
        </div>
      </div>
      <InfoBlock title="요약" body={node.summary} />
      <InfoBlock title="설명" body={node.description ?? node.summary} />
      {attributes.length > 0 ? (
        <div className="rounded-[24px] bg-surface-muted/80 p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-faint">속성</div>
          <div className="mt-3 space-y-2">
            {attributes.map(([key, value]) => (
              <div key={key} className="flex items-start justify-between gap-4 text-sm text-soft">
                <span className="font-medium text-faint">{key}</span>
                <span className="text-right text-ink">{formatGraphAttributeValue(value)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {node.citations?.length ? (
        <div className="rounded-[24px] bg-surface-muted/80 p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-faint">참고 문헌</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {node.citations.map((citation) => (
              <span key={citation} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-soft">
                {citation}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {linkedEvidence && linkedEvidence.length > 0 ? (
        <div className="rounded-[24px] bg-surface-muted/80 p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-faint">연결 근거</div>
          <div className="mt-3 space-y-3">
            {linkedEvidence.slice(0, 4).map((item) => (
              <div key={item.evidenceId} className="rounded-[18px] bg-white px-4 py-3">
                <div className="text-sm font-semibold text-ink">{item.title}</div>
                <div className="mt-1 text-xs text-faint">{item.source} · {item.year}</div>
                <p className="mt-2 text-sm leading-6 text-soft">{item.excerpt}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function GraphEdgeDetailCard({ edge, evidence }: { edge: GraphEdgeDetailView; evidence?: EvidenceItemDto[] }) {
  return (
    <div className="mt-4 space-y-4">
      <div>
        <h3 className="text-xl font-semibold text-ink">{edge.relationshipType.replaceAll("_", " ")}</h3>
        <p className="mt-1 text-sm text-faint">{edge.relationshipType}</p>
      </div>
      <InfoBlock title="관계 요약" body={edge.statement} />
      <InfoBlock title="관계 설명" body={edge.statement} />
      <div className="rounded-[24px] bg-surface-muted/80 p-4 text-sm text-soft">
        <div className="text-xs uppercase tracking-[0.2em] text-faint">연결</div>
        <div className="mt-3 space-y-2">
          <div>출발 노드: {edge.sourceName}</div>
          <div>도착 노드: {edge.targetName}</div>
        </div>
      </div>
      {(edge.evidenceIds?.length ?? 0) > 0 ? <InfoBlock title="관계 근거 ID" body={edge.evidenceIds!.join(", ")} /> : null}
      {evidence && evidence.length > 0 ? (
        <div className="rounded-[24px] bg-surface-muted/80 p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-faint">관계 근거</div>
          <div className="mt-3 space-y-3">
            {evidence.slice(0, 4).map((item) => (
              <div key={item.evidenceId} className="rounded-[18px] bg-white px-4 py-3">
                <div className="text-sm font-semibold text-ink">{item.title}</div>
                <div className="mt-1 text-xs text-faint">{item.source} · {item.year}</div>
                <p className="mt-2 text-sm leading-6 text-soft">{item.excerpt}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InfoBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[24px] bg-surface-muted/80 p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-faint">{title}</div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-soft">{body}</p>
    </div>
  );
}
