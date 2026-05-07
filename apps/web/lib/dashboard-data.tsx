import { OptimizerPanel } from "@/components/kicetic/optimizer-panel";
import { OverviewPanel } from "@/components/kicetic/overview-panel";
import { PhysicalAIPanel } from "@/components/kicetic/physical-ai-panel";
import { ResearchPanel } from "@/components/kicetic/research-panel";
import { SurrogatePanel } from "@/components/kicetic/surrogate-panel";
import { XAIPanel } from "@/components/kicetic/xai-panel";
import type { DashboardData, NavPanel, PanelKey } from "@kicetic/shared/contracts";
import { kiceticWorkspaceFixture } from "@kicetic/shared/fixtures";

export const panels: NavPanel[] = [
  {
    key: "overview",
    label: "Home",
    href: "/dashboard/overview",
    summary: "KICETIC 전체 운영 상태와 연구 흐름을 한 번에 보는 홈 화면"
  },
  {
    key: "research",
    label: "1. Multi Agent",
    href: "/dashboard/research",
    summary: "실험 설계"
  },
  {
    key: "bo",
    label: "2. BO",
    href: "/dashboard/bo",
    summary: "공정 최적화"
  },
  {
    key: "surrogate",
    label: "3. Surrogate",
    href: "/dashboard/surrogate",
    summary: "대리 모델"
  },
  {
    key: "physical-ai",
    label: "4. Physical AI",
    href: "/dashboard/physical-ai",
    summary: "디지털 트윈"
  },
  {
    key: "x-ai",
    label: "5. X.AI",
    href: "/dashboard/x-ai",
    summary: "의사결정"
  }
];

const defaultResearchQuestion = "";

export const dashboardData: DashboardData = {
  overview: {
    heroTitle: "설계 → 공정 최적화 → 실행 → 분석",
    heroSummary: "MPCVD diamond 연구를 질문 정리, BO 추천, 실험 분석까지 한 흐름으로 연결합니다.",
    metrics: [
      {
        label: "Best growth rate",
        value: `${kiceticWorkspaceFixture.northStarMetric.value} ${kiceticWorkspaceFixture.northStarMetric.unit}`,
        delta: "+8.2% vs prev best",
        tone: "positive"
      },
      { label: "Completed BO trials", value: "51", delta: "4H-SiC + Diamond", tone: "positive" },
      { label: "Raman FWHM (best)", value: "2.9 cm⁻¹", delta: "Crystal quality target met", tone: "positive" }
    ],
    modules: [
      {
        label: "Multi Agent",
        href: "/dashboard/research",
        summary: "질문 정리 · constraint 검토 · 가설 검증",
        tone: "research",
        status: "Live discussion"
      },
      {
        label: "BO",
        href: "/dashboard/bo",
        summary: "safe boundary 안의 다음 실험 조건 추천",
        tone: "bo",
        status: "Recommendation-ready"
      },
      {
        label: "Surrogate",
        href: "/dashboard/surrogate",
        summary: "성장 속도·Raman 품질 사전 예측",
        tone: "neutral",
        status: "Model stage"
      },
      {
        label: "Physical AI",
        href: "/dashboard/physical-ai",
        summary: "챔버 상태와 실행 큐 연결",
        tone: "success",
        status: "Twin queue"
      },
      {
        label: "X.AI",
        href: "/dashboard/x-ai",
        summary: "결과 해석과 다음 action 설명",
        tone: "xai",
        status: "Decision layer"
      }
    ],
    trustSignals: [
      {
        label: "Grounded research",
        value: "RAG + expert roles",
        description: "근거 chunk와 constraint를 분리 표시합니다."
      },
      {
        label: "Safe optimization",
        value: "Constraint-aware BO",
        description: "승인 boundary 기준으로 추천합니다."
      },
      {
        label: "Closed loop",
        value: "Experiment → insight",
        description: "실험 결과가 다음 판단으로 환류합니다."
      }
    ],
    roadmap: [
      {
        title: "Available now",
        status: "Research + BO",
        description: "토론·constraint·가설 검증·BO 추천 사용 가능"
      },
      {
        title: "Build next",
        status: "Surrogate handoff",
        description: "실험 기록을 모델 학습과 우선순위에 연결"
      },
      {
        title: "Platform target",
        status: "Physical AI + X.AI",
        description: "장비 실행·측정·보고까지 closed-loop 확장"
      }
    ],
    workflow: [
      {
        title: "Design",
        status: "complete",
        description: "Multi-Agent가 MPCVD 문헌·내부 이력을 교차 분석해 전력-CH₄ 비율 교호작용을 핵심 인자로 특정했습니다."
      },
      {
        title: "Optimization",
        status: "active",
        description: "BO TPE 샘플러가 압력 120~140 Torr, 전력 3.5~4.5 kW 공정 창을 집중 탐색 중입니다."
      },
      {
        title: "Execution",
        status: "queued",
        description: "MPCVD 반응기 Digital Twin이 챔버 상태를 모니터링하고 BO 추천 레시피를 실행 큐에 배치합니다."
      },
      {
        title: "Analysis",
        status: "queued",
        description: "Surrogate 모델과 X.AI가 Raman·성장 속도 데이터를 계층별 인사이트로 변환하고 다음 실험 방향을 제시합니다."
      }
    ],
    watchlist: [
      "CH₄/H₂ 6.5% 초과 트라이얼에서 플라즈마 불안정 패턴 감지 — 해당 구간 트라이얼 우선순위 하향 검토",
      "4H-SiC와 Diamond 기판 간 최적 공정 창이 다름 — 기판별 결과 교차 적용 주의",
      "Raman FWHM 측정 누락 트라이얼 7건 — 결정 품질 지표 일관성 확보 필요"
    ]
  },
  research: {
    query: defaultResearchQuestion,
    capabilities: [
      "Literature retrieval",
      "Existing DB cross-check",
      "Question decomposition",
      "Expert debate",
      "Embedded RAG capability"
    ],
    insights: kiceticWorkspaceFixture.researchDocuments.slice(0, 3).map((document) => ({
      topic: document.title,
      source: `${document.source} · ${document.year}`,
      confidence: document.source === "internal-db" ? "Operational confidence" : "Literature-backed",
      note: document.highlights.join(" · ")
    })),
    discussion: [],
    summary: "Live discussion을 불러오는 중입니다.",
    nextActions: [],
    agents: [],
    evidence: [],
    graph: {
      nodes: [],
      edges: []
    },
    openQuestions: []
  },
  bo: {
    objective: "MPCVD 다이아몬드 성장 속도(μm/h)를 최대화하면서 Raman FWHM을 유지할 다음 공정 파라미터 조합을 추천합니다.",
    recommendations: kiceticWorkspaceFixture.recommendations.map((recommendation) => ({
      title: recommendation.id,
      value: `${Math.round(recommendation.score * 100)} score`,
      rationale: recommendation.rationale.join(" · ")
    })),
    experiments: kiceticWorkspaceFixture.recommendations.map((recommendation) => ({
      label: recommendation.id,
      value: `${recommendation.expectedMetrics[0]?.value ?? "n/a"} ${recommendation.expectedMetrics[0]?.unit ?? ""}`.trim(),
      detail: recommendation.rationale[0] ?? "Recommended next trial"
    }))
  },
  surrogate: {
    surrogateName: "MPCVD Growth Rate Surrogate",
    status: "Prediction-ready",
    features: [
      "전력·압력·CH₄ 비율·H₂ 유량을 입력으로 성장 속도와 Raman FWHM을 동시 예측",
      "Optuna 51회 트라이얼 데이터 학습 — 공정 창 릿지 및 불안정 경계 식별",
      "예측 불확실성 ±8% 정량화로 다음 BO 트라이얼 우선순위 자동 산출"
    ],
    predictions: kiceticWorkspaceFixture.simulations.map((simulation) => ({
      label: simulation.headline,
      value: simulation.status,
      detail: simulation.summary
    })),
    spectroscopy: {
      expectedMaterial: "diamond carbon",
      mode: "auto",
      sampleFiles: [
        {
          filename: "diamond_xrd_reference_like.csv",
          label: "Sample A · baseline",
          contentText: "2theta,intensity\n20,4\n30,8\n38,15\n43.9,100\n50,18\n64.1,58\n75.3,34\n82,12"
        },
        {
          filename: "diamond_xrd_shifted_trial.csv",
          label: "Sample B · N₂ trial",
          contentText: "2theta,intensity\n20,5\n30,7\n38,18\n44.2,92\n50,20\n64.4,65\n75.6,40\n82,14"
        }
      ]
    }
  },
  "physical-ai": {
    twinName: "MPCVD Reactor Digital Twin",
    readiness: "Execution queued",
    signals: [
      {
        system: "Plasma chamber",
        state: "Stable",
        detail: "마이크로파 전력 4.2 kW, 압력 132 Torr — BO 추천 조건이 트윈 검증을 통과해 실행 준비 완료."
      },
      {
        system: "Gas flow controller",
        state: "Running",
        detail: "H₂ 480 sccm / CH₄ 22 sccm (비율 4.6%) — 플라즈마 불안정 임계(6.5%) 대비 안전 구간 확인."
      },
      {
        system: "Metrology (Raman)",
        state: "Needs calibration",
        detail: "Raman 측정 반복성 편차 ±0.3 cm⁻¹ 초과 감지 — 캘리브레이션 배치 우선 실행 권장."
      }
    ],
    actions: [
      "Raman 캘리브레이션 완료 후 Trial B-52 자동 트리거",
      "Surrogate 예측 성장 속도 19.2 μm/h와 실측값 비교해 트윈 정확도 업데이트",
      "실험 완료 즉시 X.AI 레이어로 기판별 결과 요약 자동 전달"
    ]
  },
  "x-ai": {
    decision: kiceticWorkspaceFixture.decisions[2]?.headline ?? "Executive decision pending",
    riskLevel: "Moderate",
    notes: kiceticWorkspaceFixture.decisions.map((decision) => ({
      audience: decision.tone,
      emphasis: decision.headline,
      message: decision.summary
    })),
    actions: kiceticWorkspaceFixture.decisions.flatMap((decision) => decision.nextActions).slice(0, 3)
  }
};

export function renderPanel(panel: PanelKey, view?: string) {
  switch (panel) {
    case "overview":
      return <OverviewPanel data={dashboardData.overview} />;
    case "research":
      return <ResearchPanel data={dashboardData.research} view={view} />;
    case "bo":
      return <OptimizerPanel />;
    case "surrogate":
      return <SurrogatePanel data={dashboardData.surrogate} />;
    case "physical-ai":
      return <PhysicalAIPanel data={dashboardData["physical-ai"]} />;
    case "x-ai":
      return <XAIPanel data={dashboardData["x-ai"]} />;
    default:
      return <OverviewPanel data={dashboardData.overview} />;
  }
}
