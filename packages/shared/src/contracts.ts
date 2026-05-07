export type PanelKey = 'overview' | 'research' | 'bo' | 'surrogate' | 'physical-ai' | 'x-ai';

export interface NavPanel {
  key: PanelKey;
  label: string;
  href: string;
  summary: string;
}

export interface Metric {
  label: string;
  value: string;
  delta?: string;
  tone?: 'neutral' | 'positive' | 'warning';
}

export interface TimelineStep {
  title: string;
  status: 'complete' | 'active' | 'queued';
  description: string;
}

export interface ResearchInsight {
  topic: string;
  source: string;
  confidence: string;
  note: string;
}

export interface AgentSummaryDto {
  agentId: string;
  role: string;
  stance: string;
  focus: string;
  evidenceFocus: string[];
  knowledgeScope: string[];
  retrievalTerms: string[];
}

export interface EvidenceItemDto {
  evidenceId: string;
  title: string;
  source: string;
  year: number;
  summary: string;
  excerpt: string;
  entityKeys: string[];
}

export interface ResearchGraphNodeDto {
  nodeId: string;
  label: string;
  nodeType: string;
  summary: string;
  citations?: string[];
}

export interface ResearchGraphEdgeDto {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationshipType: string;
  statement: string;
  evidenceIds?: string[];
}

export interface ResearchGraphDto {
  nodes: ResearchGraphNodeDto[];
  edges: ResearchGraphEdgeDto[];
}

export interface HypothesisCandidateDto {
  hypothesisId: string;
  title: string;
  family?: 'analogy' | 'novel' | 'mechanistic';
  trizPrinciple?: string | null;
  statement: string;
  rationale: string;
  proposedExperiment: string;
  analogySource?: string | null;
  sourceEvidenceIds: string[];
}

export interface HypothesisValidationDto {
  hypothesisId: string;
  agentId: string;
  agentName: string;
  verdict: 'support' | 'mixed' | 'challenge';
  reasoning: string;
  confidence: 'low' | 'medium' | 'high';
  evidenceIds: string[];
  keyTest: string;
  validationPass?: number;
}

export interface HypothesisRankingDto {
  hypothesisId: string;
  rank: number;
  plausibilityScore: number;
  feasibilityScore: number;
  evidenceScore: number;
  noveltyScore: number;
  recommendation: string;
  summary: string;
  riskNote: string;
}

export interface DiscussionTurnStructuredOutput {
  claim?: string;
  evidenceIds?: string[];
  reasoning?: string;
  evidenceStrength?: 'none' | 'weak' | 'medium' | 'strong';
  unsupportedClaims?: string[];
  constraintRisks?: string[];
  uncertainties?: string[];
  experimentProposal?: string;
  confidence?: string;
  boBridgeNote?: string;
}

export interface DiscussionTurnBrief extends DiscussionTurnStructuredOutput {
  speaker: string;
  role?: string;
  roundNum?: number;
}

export interface DiscussionRoundSummary {
  roundNum: number;
  summary: string;
  consensus?: string[];
  disagreements?: string[];
  gaps?: string[];
  alreadyStated?: string[];
}

export interface DiscussionContextBudget {
  agentCount: number;
  roundCount: number;
  evidenceCount: number;
  rawTurnCount: number;
  compactedTurnCount: number;
  roundSummaryCount?: number;
}

export interface DiscussionResearchContext {
  contextBudget?: DiscussionContextBudget;
  roundSummaries?: DiscussionRoundSummary[];
  turnBriefs?: DiscussionTurnBrief[];
}

export interface DiscussionSourceChunkDto {
  chunkId: string;
  documentName: string;
  sectionTitle: string;
  contentPreview: string;
}

export interface DiscussionPanelTurn {
  agent: string;
  stance: string;
  message: string;
  references?: string[];
  agentId?: string;
  evidenceIds?: string[];
  sourceChunks?: DiscussionSourceChunkDto[];
  claim?: string;
  reasoning?: string;
  evidenceStrength?: 'none' | 'weak' | 'medium' | 'strong';
  unsupportedClaims?: string[];
  constraintRisks?: string[];
  uncertainties?: string[];
  experimentProposal?: string;
  confidence?: string;
  boBridgeNote?: string;
  structuredOutput?: DiscussionTurnStructuredOutput;
}

export interface Recommendation {
  title: string;
  value: string;
  rationale: string;
}

export interface ExperimentPoint {
  label: string;
  value: string;
  detail: string;
}

export interface TwinSignal {
  system: string;
  state: string;
  detail: string;
}

export interface ExecutiveNote {
  audience: string;
  message: string;
  emphasis: string;
}

export interface OverviewModuleLink {
  label: string;
  href: string;
  summary: string;
  tone: 'research' | 'bo' | 'xai' | 'neutral' | 'success';
  status: string;
}

export interface OverviewTrustSignal {
  label: string;
  value: string;
  description: string;
}

export interface OverviewRoadmapItem {
  title: string;
  status: string;
  description: string;
}

export interface OverviewPanelData {
  heroTitle: string;
  heroSummary: string;
  metrics: Metric[];
  workflow: TimelineStep[];
  watchlist: string[];
  modules?: OverviewModuleLink[];
  trustSignals?: OverviewTrustSignal[];
  roadmap?: OverviewRoadmapItem[];
}

export interface ResearchPanelData {
  query: string;
  capabilities: string[];
  insights: ResearchInsight[];
  discussion: DiscussionPanelTurn[];
  summary?: string;
  nextActions?: string[];
  agents?: AgentSummaryDto[];
  evidence?: EvidenceItemDto[];
  graph?: ResearchGraphDto;
  openQuestions?: string[];
  hypotheses?: HypothesisCandidateDto[];
  validations?: HypothesisValidationDto[];
  hypothesisRankings?: HypothesisRankingDto[];
  selectedHypothesisId?: string | null;
}

export interface BOPanelData {
  objective: string;
  recommendations: Recommendation[];
  experiments: ExperimentPoint[];
}

export interface SurrogatePanelData {
  surrogateName: string;
  status: string;
  features: string[];
  predictions: ExperimentPoint[];
  spectroscopy?: SurrogateSpectroscopyWorkspaceDefaults;
}

export type SpectroscopyMode = 'auto' | 'xrd' | 'raman';

export type ResolvedSpectroscopyMode = Exclude<SpectroscopyMode, 'auto'>;

export interface SpectroscopyUploadFileDto {
  filename: string;
  label?: string;
  contentText: string;
}

export interface SpectroscopyPointDto {
  x: number;
  intensity: number;
}

export interface SpectroscopyPeakDto {
  id: string;
  seriesId: string;
  position: number;
  intensity: number;
  normalizedIntensity: number;
  label: string;
}

export interface SpectroscopySeriesDto {
  id: string;
  filename: string;
  label: string;
  rawPointCount: number;
  processedPointCount: number;
  xLabel: string;
  yLabel: string;
  points: SpectroscopyPointDto[];
  peaks: SpectroscopyPeakDto[];
  preprocessing: string[];
}

export interface SpectroscopyReferencePeakDto {
  position: number;
  relativeIntensity: number;
  hkl?: string;
  label: string;
}

export interface SpectroscopyReferenceCandidateDto {
  id: string;
  provider: 'Materials Project' | 'COD' | 'RRUFF' | 'local-template';
  material: string;
  source: string;
  provenance: string;
  caveat: string;
  peaks: SpectroscopyReferencePeakDto[];
  unavailableReason?: string;
}

export interface SpectroscopyComparisonDto {
  headline: string;
  observations: string[];
  sampleCount: number;
  renderMode: 'overlay' | 'stacked';
}

export interface SpectroscopyFigureArtifactDto {
  svg: string;
  processedCsv: string;
  raster: {
    filename: string;
    widthPx: number;
    heightPx: number;
    dpi: number;
    note: string;
  };
  caption: string;
  methodNote: string;
}

export interface SpectroscopyAdvisoryAnalysisDto {
  title: string;
  summary: string;
  caveats: string[];
  recommendedVerification: string[];
  provenanceNotes: string[];
  guardrail: string;
}

export interface SpectroscopyAnalysisResultDto {
  status: 'ready' | 'partial' | 'failed';
  mode: ResolvedSpectroscopyMode;
  expectedMaterial: string;
  series: SpectroscopySeriesDto[];
  comparison: SpectroscopyComparisonDto;
  references: SpectroscopyReferenceCandidateDto[];
  figure: SpectroscopyFigureArtifactDto;
  analysis: SpectroscopyAdvisoryAnalysisDto;
  warnings: string[];
}

export interface SurrogateSpectroscopyWorkspaceDefaults {
  expectedMaterial: string;
  mode: SpectroscopyMode;
  sampleFiles: SpectroscopyUploadFileDto[];
}

export interface PhysicalAIPanelData {
  twinName: string;
  readiness: string;
  signals: TwinSignal[];
  actions: string[];
}

export interface XAIPanelData {
  decision: string;
  riskLevel: string;
  notes: ExecutiveNote[];
  actions: string[];
}

export interface DashboardData {
  overview: OverviewPanelData;
  research: ResearchPanelData;
  bo: BOPanelData;
  surrogate: SurrogatePanelData;
  'physical-ai': PhysicalAIPanelData;
  'x-ai': XAIPanelData;
}

export type KiceticModuleKey =
  | 'overview'
  | 'multiagent'
  | 'boStudio'
  | 'surrogateSimulation'
  | 'physicalAi'
  | 'xAi';

export type KiceticMaterialFamily = string;

export type KiceticMaterialForm = 'substrate' | 'filler' | 'composite' | 'slurry' | 'solution' | 'film' | string;

export type KiceticReadiness = 'mock' | 'pilot' | 'production';

export type KiceticInsightTone = 'researcher' | 'teamLead' | 'executive';

export interface KiceticMetric {
  key: string;
  label: string;
  value: number;
  unit: string;
  changeRate?: number;
  direction?: 'up' | 'down' | 'flat';
  note?: string;
}

export interface KiceticMaterialProfile {
  id: string;
  name: string;
  family: KiceticMaterialFamily;
  form: KiceticMaterialForm;
  summary: string;
  composition: string[];
  targetApplications: string[];
  targetMetricValue: number;
  targetMetricUnit: string;
  secondaryMetricValue?: number;
  secondaryMetricUnit?: string;
  densityGcm3?: number;
  processTemperatureC?: number;
  readiness: KiceticReadiness;
  tags: string[];
}

export interface KiceticModuleStatus {
  module: KiceticModuleKey;
  title: string;
  description: string;
  readiness: KiceticReadiness;
  connectedCapabilities: string[];
  primaryMetric?: KiceticMetric;
}

export interface ResearchDocument {
  id: string;
  title: string;
  source: 'paper' | 'patent' | 'internal-db';
  year: number;
  authors: string[];
  materialIds: string[];
  highlights: string[];
  abstract: string;
}

export interface MultiagentCapabilitySummary {
  ragMode: 'embedded';
  uploadEnabled: boolean;
  discussionEnabled: boolean;
  knowledgeSources: Array<'paper' | 'patent' | 'internal-db' | 'experiment-log'>;
  systemPromptHint: string;
}

export interface DiscussionTurn {
  role: 'planner' | 'materialsExpert' | 'processEngineer' | 'analyst' | 'reviewer';
  message: string;
  citations?: string[];
}

export interface DiscussionSessionDto {
  id: string;
  topic: string;
  module: Extract<KiceticModuleKey, 'multiagent'>;
  materialIds: string[];
  question: string;
  turns: DiscussionTurn[];
  consensus: string;
  recommendedActions: string[];
}

export interface BoParameterRange {
  key: string;
  label: string;
  kind: 'continuous' | 'categorical';
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

export interface BoRecommendationDto {
  id: string;
  materialId: string;
  objective: string;
  score: number;
  confidence: number;
  expectedMetrics: KiceticMetric[];
  parameters: Record<string, string | number>;
  rationale: string[];
}

export interface SimulationSnapshotDto {
  id: string;
  materialId: string;
  model: 'surrogate' | 'dft' | 'md' | 'digital-twin';
  headline: string;
  status: 'queued' | 'running' | 'completed';
  summary: string;
  metrics: KiceticMetric[];
}

export interface DecisionBriefDto {
  id: string;
  tone: KiceticInsightTone;
  headline: string;
  summary: string;
  risks: string[];
  opportunities: string[];
  nextActions: string[];
}

export interface KiceticWorkspaceDto {
  workspaceName: string;
  northStarMetric: KiceticMetric;
  modules: KiceticModuleStatus[];
  materials: KiceticMaterialProfile[];
  researchDocuments: ResearchDocument[];
  multiagent: MultiagentCapabilitySummary;
  discussions: DiscussionSessionDto[];
  optimizationRanges: BoParameterRange[];
  recommendations: BoRecommendationDto[];
  simulations: SimulationSnapshotDto[];
  decisions: DecisionBriefDto[];
}
