import type {
  BoParameterRange,
  BoRecommendationDto,
  DecisionBriefDto,
  DiscussionSessionDto,
  KiceticMaterialProfile,
  KiceticModuleStatus,
  KiceticWorkspaceDto,
  MultiagentCapabilitySummary,
  ResearchDocument,
  SimulationSnapshotDto,
} from './contracts';

export const kiceticMaterials: KiceticMaterialProfile[] = [
  {
    id: 'mat-diamond-4hsic-01',
    name: 'MPCVD Diamond on 4H-SiC',
    family: 'Wide Bandgap Semiconductor',
    form: 'film',
    summary: 'MPCVD로 4H-SiC 기판 위에 성장시킨 다이아몬드 박막. 열전도도와 성장 안정성 동시 최적화를 목표로 한다.',
    composition: ['diamond (C)', '4H-SiC substrate', 'H2 carrier gas', 'CH4 precursor'],
    targetApplications: ['고출력 전력소자', '방열 기판', '다이아몬드 트랜지스터'],
    targetMetricValue: 18.5,
    targetMetricUnit: 'μm/h',
    secondaryMetricValue: 4.2,
    secondaryMetricUnit: 'cm⁻¹ (Raman FWHM)',
    processTemperatureC: 850,
    readiness: 'pilot',
    tags: ['MPCVD', 'homoepitaxy', 'wide-bandgap', 'BO-optimized'],
  },
  {
    id: 'mat-diamond-homo-01',
    name: 'Homoepitaxial Diamond (HPHT seed)',
    family: 'Wide Bandgap Semiconductor',
    form: 'film',
    summary: 'HPHT 다이아몬드 seed 위 동종 에피택시 성장. 결정 품질 우선, 낮은 결함 밀도 목표.',
    composition: ['diamond (C)', 'HPHT diamond seed', 'H2/CH4 plasma'],
    targetApplications: ['단결정 다이아몬드 기판', '전자소자 활성층'],
    targetMetricValue: 12.0,
    targetMetricUnit: 'μm/h',
    secondaryMetricValue: 2.8,
    secondaryMetricUnit: 'cm⁻¹ (Raman FWHM)',
    processTemperatureC: 800,
    readiness: 'pilot',
    tags: ['homoepitaxy', 'low-defect', 'crystal-quality'],
  },
  {
    id: 'mat-diamond-ntype-01',
    name: 'Phosphorus-doped n-type Diamond',
    family: 'Doped Diamond',
    form: 'film',
    summary: '인(P) 도핑으로 n형 전도성을 부여한 다이아몬드 박막. 전력소자 pn 접합 구현을 위한 핵심 소재.',
    composition: ['diamond (C)', 'phosphorus dopant', 'H2/CH4/PH3 plasma'],
    targetApplications: ['다이아몬드 pn 접합 다이오드', 'UV 광검출기'],
    targetMetricValue: 8.0,
    targetMetricUnit: 'μm/h',
    readiness: 'mock',
    tags: ['n-type', 'doping', 'PH3', 'power-device'],
  },
];

export const kiceticModules: KiceticModuleStatus[] = [
  {
    module: 'overview',
    title: 'Research Command Center',
    description: 'MPCVD 다이아몬드 연구 진행 현황, KPI 달성률, 모듈 연동 흐름을 단일 화면에서 실시간 모니터링.',
    readiness: 'pilot',
    connectedCapabilities: ['KPI dashboard', 'module health', 'cross-pipeline narrative'],
  },
  {
    module: 'multiagent',
    title: 'AI Research Intelligence',
    description: '다이아몬드 성장 메커니즘 문헌 자율 탐색, 가설 생성, 멀티에이전트 토론으로 연구 인사이트를 가속 합성.',
    readiness: 'pilot',
    connectedCapabilities: ['autonomous literature mining', 'hypothesis generation', 'expert debate orchestration', 'RAG-powered synthesis'],
  },
  {
    module: 'boStudio',
    title: 'Bayesian Optimization Studio',
    description: 'MPCVD 공정 파라미터(전력, 압력, 가스 유량, CH4 비율) 물리 제약 인지 베이지안 최적화.',
    readiness: 'pilot',
    connectedCapabilities: ['physics-informed BO', 'Optuna TPE sampler', 'parameter recommendation', 'convergence tracking'],
    primaryMetric: { key: 'growthRate', label: 'Growth rate', value: 18.5, unit: 'μm/h', direction: 'up' },
  },
  {
    module: 'surrogateSimulation',
    title: 'Surrogate & Simulation Layer',
    description: 'MPCVD 성장 속도·결정 품질 대리 모델과 시뮬레이션으로 실험 전 공정 창을 예측.',
    readiness: 'pilot',
    connectedCapabilities: ['growth rate surrogate', 'uncertainty quantification', 'Raman FWHM prediction', 'scenario comparison'],
  },
  {
    module: 'physicalAi',
    title: 'Physical AI & Digital Twin',
    description: 'MPCVD 반응기 디지털 트윈이 챔버 상태를 실시간 모니터링하고 BO 추천 레시피를 자율 실행 큐에 배치.',
    readiness: 'pilot',
    connectedCapabilities: ['reactor digital twin', 'autonomous execution queue', 'plasma anomaly detection', 'lab-in-the-loop'],
  },
  {
    module: 'xAi',
    title: 'Explainable AI Decision Hub',
    description: '동일 MPCVD 연구 결과를 연구원·팀장·경영진 관점으로 자동 재구성하는 다층 의사결정 지원.',
    readiness: 'pilot',
    connectedCapabilities: ['multi-audience summarization', 'risk-opportunity framing', 'XAI attribution', 'next action synthesis'],
  },
];

export const kiceticResearchDocuments: ResearchDocument[] = [
  {
    id: 'doc-mpcvd-growth-mechanism',
    title: 'Gas-phase chemistry and growth stability in MPCVD diamond: mechanisms and process windows',
    source: 'paper',
    year: 2024,
    authors: ['T. Teraji', 'S. Koizumi', 'H. Kanda'],
    materialIds: ['mat-diamond-4hsic-01', 'mat-diamond-homo-01'],
    highlights: [
      'CH4/H2 비율과 챔버 압력이 성장 속도와 결함 밀도에 가장 민감하게 작용',
      '성장 안정성 창(process window)이 전력-압력 조합에 따라 비선형적으로 변동',
      'Raman FWHM이 결정 품질의 신뢰 지표로 확인',
    ],
    abstract: 'MPCVD 다이아몬드 성장의 가스상 화학 반응과 공정 창 안정성에 대한 실험적 분석.',
  },
  {
    id: 'doc-diamond-bo-optimization',
    title: 'Bayesian optimization of MPCVD diamond growth parameters for high-rate homoepitaxy',
    source: 'paper',
    year: 2025,
    authors: ['J. Park', 'M. Kim', 'K. Lee'],
    materialIds: ['mat-diamond-4hsic-01'],
    highlights: [
      'BO TPE 샘플러로 51회 이내에 최적 성장 속도 조건 수렴 확인',
      '전력-압력 교호작용이 성장 속도 분산의 43%를 설명',
      'CH4/H2 비율 4~5% 구간이 성장 안정성-속도 동시 최적화 영역',
    ],
    abstract: '베이지안 최적화를 이용한 MPCVD 다이아몬드 고속 성장 공정 파라미터 최적화 연구.',
  },
  {
    id: 'doc-internal-optuna-study',
    title: 'Internal study log: mpcvd_optimization_v2 — 51 trials, TPE multivariate sampler',
    source: 'internal-db',
    year: 2026,
    authors: ['KICETIC Research Ops'],
    materialIds: ['mat-diamond-4hsic-01', 'mat-diamond-homo-01'],
    highlights: [
      '51회 트라이얼 완료, 4H-SiC / Diamond 기판별 최적 조건 분리 확인',
      '전력과 CH4 비율이 feature importance 상위 2개',
      '최고 성장 속도 조건은 압력 120~140 Torr, 전력 3.5~4.5 kW 구간에 집중',
    ],
    abstract: 'Optuna MPCVD 최적화 v2 내부 실험 이력 및 파라미터 중요도 분석 요약.',
  },
];

export const kiceticMultiagentCapability: MultiagentCapabilitySummary = {
  ragMode: 'embedded',
  uploadEnabled: true,
  discussionEnabled: true,
  knowledgeSources: ['paper', 'patent', 'internal-db', 'experiment-log'],
  systemPromptHint:
    'RAG는 별도 서비스가 아닌 Multiagent 내부 capability로 동작. MPCVD 다이아몬드 문헌·특허·내부 실험 이력을 통합 합성하여 연구 인사이트를 생성한다.',
};

export const kiceticDiscussionSessions: DiscussionSessionDto[] = [
  {
    id: 'discussion-mpcvd-growth-window',
    topic: 'MPCVD process window optimization',
    module: 'multiagent',
    materialIds: ['mat-diamond-4hsic-01'],
    question: 'CH4/H2 비율과 챔버 압력 조합에서 성장 속도와 결정 품질을 동시에 최적화할 수 있는 공정 창은 어디인가?',
    turns: [
      {
        role: 'planner',
        message: '내부 Optuna 이력과 문헌을 교차 검토해 전력-압력-CH4 비율 3차원 공정 창을 먼저 좁힌다.',
        citations: ['doc-internal-optuna-study', 'doc-mpcvd-growth-mechanism'],
      },
      {
        role: 'materialsExpert',
        message: 'CH4/H2 4~5% 구간에서 성장 속도가 정점이지만, 이를 초과하면 sp2 결함이 급증하는 경향이 문헌에서 반복적으로 보고된다.',
        citations: ['doc-mpcvd-growth-mechanism'],
      },
      {
        role: 'processEngineer',
        message: '압력 120~140 Torr 구간이 내부 데이터에서 성장 안정성 지표가 가장 높고, 이 구간에서 전력을 3.5~4.5 kW로 제한하면 열적 균일성도 확보된다.',
        citations: ['doc-internal-optuna-study'],
      },
      {
        role: 'analyst',
        message: 'BO feature importance에서 전력-CH4 비율 교호작용이 성장 속도 분산의 43%를 설명하므로, 이 두 변수를 축으로 2D 탐색 창을 우선 정밀화해야 한다.',
        citations: ['doc-diamond-bo-optimization'],
      },
    ],
    consensus: 'CH4/H2 4~5%, 압력 120~140 Torr, 전력 3.5~4.5 kW 삼각 구간이 성장 속도-결정 품질 동시 최적화의 1차 후보 공정 창이다.',
    recommendedActions: [
      '해당 공정 창 내 격자 실험 5~7회로 성장 속도-Raman FWHM 동시 측정',
      'BO 다음 트라이얼을 공정 창 경계 부근에 배치해 안정성 한계 확인',
    ],
  },
  {
    id: 'discussion-substrate-comparison',
    topic: '4H-SiC vs HPHT diamond substrate strategy',
    module: 'multiagent',
    materialIds: ['mat-diamond-4hsic-01', 'mat-diamond-homo-01'],
    question: '4H-SiC 기판과 HPHT 다이아몬드 기판 중 현재 연구 목표에 더 적합한 전략은 무엇인가?',
    turns: [
      {
        role: 'planner',
        message: '두 기판의 계면 결함, 격자 불일치, 성장 속도 데이터를 내부 이력 기준으로 분리 비교한다.',
        citations: ['doc-internal-optuna-study'],
      },
      {
        role: 'materialsExpert',
        message: '4H-SiC는 격자 불일치로 인한 계면 전위가 불가피하지만 대면적 기판 조달이 쉽고, HPHT는 결정 품질이 우수하나 비용과 면적에 제약이 있다.',
      },
      {
        role: 'reviewer',
        message: '전력소자 응용이 목표라면 계면 결함 허용 수준을 먼저 사양으로 정의해야 기판 선택 기준이 명확해진다.',
      },
    ],
    consensus: '단기 최적화(성장 속도 우선)에는 4H-SiC, 고품질 소자 시연에는 HPHT가 적합하며 두 기판 병행 트래킹이 전략적으로 유리하다.',
    recommendedActions: [
      '소자 규격서 기준으로 계면 결함 허용치 사전 정의',
      '4H-SiC Optuna 트라이얼과 HPHT 트라이얼 결과를 별도 스터디로 비교 분석',
    ],
  },
];

export const kiceticOptimizationRanges: BoParameterRange[] = [
  {
    key: 'substrate',
    label: 'Substrate',
    kind: 'categorical',
    options: ['4H SiC', 'Diamond'],
  },
  {
    key: 'power',
    label: 'Microwave power',
    kind: 'continuous',
    unit: 'kW',
    min: 0.6,
    max: 5.0,
    step: 0.1,
  },
  {
    key: 'pressure',
    label: 'Chamber pressure',
    kind: 'continuous',
    unit: 'Torr',
    min: 0,
    max: 200,
    step: 5,
  },
  {
    key: 'h_flow',
    label: 'H₂ flow rate',
    kind: 'continuous',
    unit: 'sccm',
    min: 0,
    max: 1000,
    step: 20,
  },
  {
    key: 'ch4_flow',
    label: 'CH₄ flow rate',
    kind: 'continuous',
    unit: 'sccm',
    min: 0,
    max: 100,
    step: 1,
  },
  {
    key: 'ch4_ratio',
    label: 'CH₄/H₂ ratio',
    kind: 'continuous',
    unit: '%',
    min: 0,
    max: 20,
    step: 0.5,
  },
];

export const kiceticRecommendations: BoRecommendationDto[] = [
  {
    id: 'bo-rec-diamond-4hsic-01',
    materialId: 'mat-diamond-4hsic-01',
    objective: 'growthRate',
    score: 0.91,
    confidence: 0.78,
    expectedMetrics: [
      {
        key: 'growthRate',
        label: 'Growth rate',
        value: 18.5,
        unit: 'μm/h',
        changeRate: 8.2,
        direction: 'up',
      },
      {
        key: 'ramanFwhm',
        label: 'Raman FWHM',
        value: 4.3,
        unit: 'cm⁻¹',
        changeRate: -5.5,
        direction: 'down',
      },
    ],
    parameters: {
      substrate: '4H SiC',
      power: 4.2,
      pressure: 130,
      h_flow: 480,
      ch4_flow: 22,
      ch4_ratio: 4.6,
    },
    rationale: [
      '압력 120~140 Torr, 전력 3.5~4.5 kW 구간이 내부 이력에서 성장 속도 최고점 클러스터',
      'CH4/H2 4.6%는 sp2 결함 임계 비율 이하이면서 성장 속도 정점 구간에 위치',
    ],
  },
  {
    id: 'bo-rec-diamond-homo-01',
    materialId: 'mat-diamond-homo-01',
    objective: 'crystalQuality',
    score: 0.87,
    confidence: 0.74,
    expectedMetrics: [
      {
        key: 'growthRate',
        label: 'Growth rate',
        value: 11.8,
        unit: 'μm/h',
        changeRate: -1.7,
        direction: 'down',
      },
      {
        key: 'ramanFwhm',
        label: 'Raman FWHM',
        value: 2.9,
        unit: 'cm⁻¹',
        changeRate: -12.1,
        direction: 'down',
      },
    ],
    parameters: {
      substrate: 'Diamond',
      power: 3.8,
      pressure: 120,
      h_flow: 500,
      ch4_flow: 18,
      ch4_ratio: 3.6,
    },
    rationale: [
      'HPHT seed 기판에서 낮은 CH4 비율이 sp3 결정 순도를 높이는 경향 확인',
      '전력 감소로 성장 속도는 소폭 하락하지만 Raman FWHM이 유의미하게 개선',
    ],
  },
];

export const kiceticSimulations: SimulationSnapshotDto[] = [
  {
    id: 'sim-growth-rate-surrogate',
    materialId: 'mat-diamond-4hsic-01',
    model: 'surrogate',
    headline: 'Surrogate identifies growth rate ridge at power 4.0–4.5 kW × pressure 125–140 Torr',
    status: 'completed',
    summary: '대리 모델이 전력 4.0~4.5 kW, 압력 125~140 Torr 교차 구간에서 성장 속도 최고점 릿지를 식별. 모델 불확실성 ±8% 이내.',
    metrics: [
      { key: 'predictedPeakRate', label: 'Predicted peak growth rate', value: 19.2, unit: 'μm/h' },
      { key: 'modelUncertainty', label: 'Model uncertainty', value: 8.1, unit: '%' },
    ],
  },
  {
    id: 'sim-reactor-twin',
    materialId: 'mat-diamond-4hsic-01',
    model: 'digital-twin',
    headline: 'Reactor twin detects plasma instability threshold above CH₄/H₂ 6.5%',
    status: 'running',
    summary: '디지털 트윈이 CH4/H2 6.5% 초과 시 플라즈마 불안정 패턴을 사전 감지 중. 해당 조건 근처 트라이얼은 우선 순위 하향 권장.',
    metrics: [
      { key: 'instabilityThreshold', label: 'CH₄/H₂ instability threshold', value: 6.5, unit: '%' },
      { key: 'reactorCycleTime', label: 'Reactor cycle time', value: 42, unit: 'min' },
    ],
  },
];

export const kiceticDecisionBriefs: DecisionBriefDto[] = [
  {
    id: 'decision-researcher-diamond',
    tone: 'researcher',
    headline: '전력-CH4 교호작용 정밀화가 다음 실험 설계의 1순위다.',
    summary: 'BO feature importance에서 전력과 CH4 비율의 교호작용이 성장 속도 분산의 43%를 설명한다. 이 두 변수를 축으로 2D 탐색을 집중하는 것이 실험 효율을 최대화하는 경로다.',
    risks: ['CH4 비율 6% 초과 시 sp2 결함 급증', '압력 과도 상승 시 성장 균일성 저하'],
    opportunities: ['공정 창 정밀화로 Raman FWHM과 성장 속도 동시 개선 가능', 'Surrogate 모델 예측 릿지와 실험 결과 교차 검증으로 트윈 정확도 업데이트'],
    nextActions: ['CH4 4~6% × 전력 3.5~4.5 kW 격자 실험 5회 설계', 'Raman FWHM 측정 배치를 모든 트라이얼에 필수 지표로 추가'],
  },
  {
    id: 'decision-teamlead-diamond',
    tone: 'teamLead',
    headline: 'BO 수렴 속도를 유지하면서 4H-SiC와 Diamond 기판 병행 트래킹을 지속한다.',
    summary: '4H-SiC 기판은 면적·비용 우위, Diamond 기판은 결정 품질 우위다. 두 기판을 별도 Optuna 스터디로 병행 추적하면 소자 사양 확정 시 빠르게 전략을 전환할 수 있다.',
    risks: ['기판별 공정 창이 달라 BO 결과를 교차 적용하면 오류 발생', '실험 자원 분산으로 각 기판의 수렴 속도 저하'],
    opportunities: ['소자 규격 확정 전에 두 기판 데이터를 동시 확보', '모듈 독립 구조로 기판 전환 비용 최소화'],
    nextActions: ['기판별 Optuna 스터디 분리 실행', '다음 5회 트라이얼 이후 기판별 최적 조건 비교 리뷰'],
  },
  {
    id: 'decision-executive-diamond',
    tone: 'executive',
    headline: 'MPCVD 최적화 파이프라인이 51회 실험으로 유의미한 성장 속도 향상을 달성했다.',
    summary: 'AI 기반 베이지안 최적화와 멀티에이전트 토론이 결합된 MPCVD 연구 파이프라인이 데모 단계에서 실제 성능 향상을 입증했다. 후속 도메인 확장은 지식 데이터 교체만으로 대응 가능하다.',
    risks: ['데모-운영 전환 시 실장비 연동 추가 개발 필요', '고품질 소자 요구 스펙 확정 전 기판 전략 분기 비용'],
    opportunities: ['51회 트라이얼 데이터로 이미 공정 창 윤곽 확보', '디지털 트윈 연동 완성 시 실험 사이클 추가 50% 단축 가능'],
    nextActions: ['1차 파일럿 성과 정량 보고서 작성', '디지털 트윈 실장비 연동 로드맵 수립'],
  },
];

export const kiceticWorkspaceFixture: KiceticWorkspaceDto = {
  workspaceName: 'KICETIC — MPCVD Diamond Research Platform',
  northStarMetric: {
    key: 'growthRate',
    label: 'Best growth rate',
    value: 18.5,
    unit: 'μm/h',
    changeRate: 8.2,
    direction: 'up',
    note: 'BO TPE sampler 51 trials — 4H-SiC substrate',
  },
  modules: kiceticModules,
  materials: kiceticMaterials,
  researchDocuments: kiceticResearchDocuments,
  multiagent: kiceticMultiagentCapability,
  discussions: kiceticDiscussionSessions,
  optimizationRanges: kiceticOptimizationRanges,
  recommendations: kiceticRecommendations,
  simulations: kiceticSimulations,
  decisions: kiceticDecisionBriefs,
};
