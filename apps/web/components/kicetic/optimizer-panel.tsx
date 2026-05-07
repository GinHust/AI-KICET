"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { SurfaceCard } from "@/components/ui/surface-card";
import { apiClient, getApiBaseUrl } from "@/lib/api-client";
import { getDataModeLabel } from "@/lib/mock-toggle";

// ── API types ─────────────────────────────────────────────────────────────────

type Stats = {
  total_trials: number;
  best_growth_rate: number | null;
  best_trial_number: number | null;
  substrate_counts: Record<string, number>;
};

type HistoryPoint = { trial_number: number; value: number; best_value: number };

type TrialRow = {
  trial_number: number;
  substrate: string;
  power: number | null;
  pressure: number | null;
  h_flow: number | null;
  ch4_flow: number | null;
  ch4_ratio: number | null;
  growth_rate: number | null;
  completed_at: string | null;
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

type BoValidatedConstraint = {
  constraint_id: string;
  numeric_bounds?: NumericConstraintBoundPayload[];
};

type AppliedBound = {
  parameter: string;
  source_parameter: string;
  source_constraint_id: string;
  unit?: string | null;
  min_value?: number | null;
  max_value?: number | null;
  recommended_min?: number | null;
  recommended_max?: number | null;
  basis?: string;
  source?: string;
  confidence?: number;
};

type Recommendation = {
  trial_number: number;
  substrate: string;
  power: number;
  pressure: number;
  h_flow: number;
  ch4_flow: number;
  ch4_ratio: number;
  applied_bounds?: AppliedBound[];
  safety_notes?: string[];
};

type ImportanceItem = { param: string; importance: number };

type OptimizerStatus = {
  storage: string;
  study_name: string;
  study_exists: boolean;
  total_trials: number;
  completed_trials: number;
  last_completed_trial_number: number | null;
  last_completed_at: string | null;
  source: "real" | "mock";
};

type LoadState = "idle" | "loading" | "ready" | "empty" | "error";

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <SurfaceCard tone="muted" className="p-5">
      <div className="text-xs uppercase tracking-[0.18em] text-faint">{label}</div>
      <div className="mt-3 text-2xl font-bold text-ink">{value}</div>
      {sub ? <div className="mt-1 text-xs text-soft">{sub}</div> : null}
    </SurfaceCard>
  );
}

const PARAM_LABELS: Record<string, string> = {
  power: "Power [kW]",
  pressure: "Pressure [Torr]",
  h_flow: "H₂ Flow [sccm]",
  ch4_flow: "CH₄ Flow [sccm]",
  ch4_ratio: "CH₄/H₂ [%]",
  substrate: "Substrate",
};
const RESEARCH_HISTORY_STORAGE_KEY = "kicetic-research-history-v4";

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

function readResearchSafeConstraints(): BoValidatedConstraint[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(RESEARCH_HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const entries = JSON.parse(raw) as Array<{ validatedConstraints?: BoValidatedConstraint[] }>;
    const merged = new Map<string, BoValidatedConstraint>();
    entries.forEach((entry) => {
      (entry.validatedConstraints ?? []).forEach((constraint) => {
        if ((constraint.numeric_bounds ?? []).length > 0) {
          merged.set(constraint.constraint_id, constraint);
        }
      });
    });
    return Array.from(merged.values());
  } catch {
    return [];
  }
}

function AppliedBoundsList({ bounds }: { bounds?: AppliedBound[] }) {
  if (!bounds?.length) {
    return null;
  }

  return (
    <div className="mt-4 rounded-[1rem] border border-bo/15 bg-white/75 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-faint">Applied safe boundary</div>
          <p className="mt-1 text-xs text-soft">Research에서 승인된 numeric bounds를 BO 탐색공간에 교집합으로 반영했습니다.</p>
        </div>
        <StatusBadge tone="success">{bounds.length} bounds</StatusBadge>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {bounds.map((bound) => (
          <div key={`${bound.source_constraint_id}-${bound.parameter}-${bound.source_parameter}`} className="rounded-[0.85rem] border border-line/70 bg-surface-muted/55 px-3 py-2 text-xs leading-5">
            <div className="font-semibold text-ink">{PARAM_LABELS[bound.parameter] ?? bound.parameter}</div>
            <div className="mt-1 text-soft">적용 범위: {formatBoundRange(bound.min_value, bound.max_value, bound.unit)}</div>
            <div className="text-faint">출처: {bound.source_constraint_id} · {bound.source_parameter}</div>
            {bound.basis ? <div className="mt-1 text-faint">근거: {bound.basis}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function ImportanceChart({ data }: { data: ImportanceItem[] }) {
  const max = Math.max(...data.map((d) => d.importance), 0.001);
  return (
    <div className="space-y-3">
      {data.map((item, i) => (
        <div key={item.param} className="flex items-center gap-3">
          <div className="w-32 shrink-0 text-xs text-soft">{PARAM_LABELS[item.param] ?? item.param}</div>
          <div className="relative h-6 flex-1 overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${(item.importance / max) * 100}%`,
                background: i === 0 ? "#F26522" : "#1A4FA0",
                opacity: 1 - i * 0.1,
              }}
            />
          </div>
          <div className="w-12 text-right text-xs font-semibold text-ink">
            {(item.importance * 100).toFixed(1)}%
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tab views ─────────────────────────────────────────────────────────────────

type View = "dashboard" | "submit" | "trials" | "optuna";

// ── Main panel ────────────────────────────────────────────────────────────────

export function OptimizerPanel() {
  const [view, setView] = useState<View>("dashboard");
  const apiBaseUrl = getApiBaseUrl();

  // dashboard data
  const [statusInfo, setStatusInfo] = useState<OptimizerStatus | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [importance, setImportance] = useState<ImportanceItem[]>([]);
  const [dashboardState, setDashboardState] = useState<LoadState>("idle");
  const [dashboardMessage, setDashboardMessage] = useState("");

  const [recommend, setRecommend] = useState<Recommendation | null>(null);
  const [recSubstrate, setRecSubstrate] = useState<"4H SiC" | "Diamond">("4H SiC");
  const [recommendState, setRecommendState] = useState<LoadState>("idle");
  const [recommendMessage, setRecommendMessage] = useState("");
  const [safeBoundaryConstraints, setSafeBoundaryConstraints] = useState<BoValidatedConstraint[]>([]);

  // trials
  const [trials, setTrials] = useState<TrialRow[]>([]);
  const [filterSub, setFilterSub] = useState<string>("");
  const [trialsState, setTrialsState] = useState<LoadState>("idle");
  const [trialsMessage, setTrialsMessage] = useState("");

  // submit form
  const [form, setForm] = useState({
    substrate: "4H SiC",
    power: 5.0,
    pressure: 120,
    h_flow: 480,
    ch4_flow: 20,
    ch4_ratio: 4.17,
    growth_rate: 0,
  });
  const [submitStatus, setSubmitStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const connectionTone = useMemo<"research" | "neutral" | "bo">(() => {
    if (dashboardState === "error") {
      return "neutral";
    }
    if (dashboardState === "empty") {
      return "neutral";
    }
    return "bo";
  }, [dashboardState]);

  // ── load dashboard ──────────────────────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    setDashboardState("loading");
    setDashboardMessage("BO study 상태를 불러오는 중입니다.");
    try {
      const [status, s, h, imp] = await Promise.all([
        apiClient<OptimizerStatus>("/api/optimizer/status"),
        apiClient<Stats>("/api/optimizer/stats"),
        apiClient<HistoryPoint[]>("/api/optimizer/history"),
        apiClient<ImportanceItem[]>("/api/optimizer/importance"),
      ]);
      setStatusInfo(status);
      setStats(s);
      setHistory(h);
      setImportance(imp);
      if (status.completed_trials === 0) {
        setDashboardState("empty");
        setDashboardMessage("완료된 BO trial이 없습니다. 실험 결과를 입력하거나 study 연결 상태를 확인하세요.");
      } else {
        setDashboardState("ready");
        setDashboardMessage(`완료된 trial ${status.completed_trials}건을 불러왔습니다.`);
      }
    } catch (e) {
      setDashboardState("error");
      setDashboardMessage(e instanceof Error ? e.message : `BO dashboard를 불러오지 못했습니다. API target: ${apiBaseUrl}`);
      setStatusInfo(null);
      setStats(null);
      setHistory([]);
      setImportance([]);
    }
  }, [apiBaseUrl]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  useEffect(() => {
    setSafeBoundaryConstraints(readResearchSafeConstraints());
  }, []);

  // ── load trials ─────────────────────────────────────────────────────────────
  const loadTrials = useCallback(async () => {
    const url = filterSub ? `/api/optimizer/trials?substrate=${encodeURIComponent(filterSub)}` : "/api/optimizer/trials";
    setTrialsState("loading");
    setTrialsMessage("Trial 목록을 불러오는 중입니다.");
    try {
      const data = await apiClient<TrialRow[]>(url);
      setTrials(data);
      if (data.length === 0) {
        setTrialsState("empty");
        setTrialsMessage("완료된 trial이 없습니다. 필터를 바꾸거나 실험 결과를 먼저 입력하세요.");
      } else {
        setTrialsState("ready");
        setTrialsMessage(`Trial ${data.length}건을 불러왔습니다.`);
      }
    } catch (e) {
      setTrials([]);
      setTrialsState("error");
      setTrialsMessage(e instanceof Error ? e.message : `Trial 목록을 불러오지 못했습니다. API target: ${apiBaseUrl}`);
    }
  }, [apiBaseUrl, filterSub]);

  useEffect(() => {
    if (view === "trials") void loadTrials();
  }, [view, loadTrials]);

  // ── recommend ───────────────────────────────────────────────────────────────
  async function handleRecommend() {
    const nextSafeConstraints = readResearchSafeConstraints();
    setSafeBoundaryConstraints(nextSafeConstraints);
    setRecommendState("loading");
    setRecommendMessage("다음 실험 조건을 계산하는 중입니다.");
    try {
      const data = await apiClient<Recommendation>("/api/optimizer/recommend", {
        method: "POST",
        body: JSON.stringify({
          substrate: recSubstrate,
          constraints: nextSafeConstraints.map((constraint) => ({
            constraint_id: constraint.constraint_id,
            numeric_bounds: constraint.numeric_bounds ?? []
          }))
        })
      });
      setRecommend(data);
      setRecommendState("ready");
      const appliedCount = data.applied_bounds?.length ?? 0;
      setRecommendMessage(`${recSubstrate} 기준 추천 조건을 계산했습니다.${appliedCount > 0 ? ` safe boundary ${appliedCount}개 적용.` : ""}`);
    } catch (e) {
      setRecommend(null);
      setRecommendState("error");
      setRecommendMessage(e instanceof Error ? e.message : `추천 계산에 실패했습니다. API target: ${apiBaseUrl}`);
    }
  }

  // ── submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setSubmitting(true);
    setSubmitStatus("제출 중...");
    try {
      await apiClient("/api/optimizer/submit", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setSubmitStatus("✓ 제출 완료. 대시보드를 새로고침하세요.");
      void loadDashboard();
    } catch (e) {
      setSubmitStatus(e instanceof Error ? e.message : "제출 실패");
    } finally {
      setSubmitting(false);
    }
  }

  // sync ch4_ratio when h_flow or ch4_flow changes
  function updateFlow(key: "h_flow" | "ch4_flow", val: number) {
    setForm((f) => {
      const next = { ...f, [key]: val };
      next.ch4_ratio = next.h_flow > 0 ? parseFloat(((next.ch4_flow / next.h_flow) * 100).toFixed(2)) : 0;
      return next;
    });
  }

  const tabCls = (t: View) =>
    `rounded-full px-4 py-1.5 text-sm font-medium transition ${
      view === t ? "bg-bo text-white shadow-card" : "text-soft hover:bg-surface-muted"
    }`;

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* header */}
      <SurfaceCard tone="contrast" className="rounded-panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <StatusBadge tone="bo">BO Studio · Research Optimizer</StatusBadge>
            <h3 className="mt-3 text-3xl font-semibold text-ink">Physics-Informed Bayesian Optimization</h3>
            <p className="mt-2 text-sm text-soft">TPE Sampler · Multivariate · Closed-loop autonomous experiment recommendation</p>
          </div>
          <div className="inline-flex gap-1 rounded-full border border-line bg-white/70 p-1">
            {(["dashboard", "submit", "trials", "optuna"] as View[]).map((t) => (
              <button key={t} type="button" onClick={() => setView(t)} className={tabCls(t)}>
                {t === "dashboard" ? "Dashboard" : t === "submit" ? "실험 입력" : t === "trials" ? "데이터" : "Optuna Dashboard"}
              </button>
            ))}
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard className="rounded-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-faint">BO 연결 상태</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge tone={connectionTone}>{{ ready: "connected", empty: "empty", error: "error", loading: "loading", idle: "idle" }[dashboardState]}</StatusBadge>
              <StatusBadge tone="neutral">모드 {getDataModeLabel()}</StatusBadge>
              {statusInfo ? <StatusBadge tone="neutral">completed {statusInfo.completed_trials}</StatusBadge> : null}
            </div>
            <p className="mt-3 text-sm leading-6 text-soft">{dashboardMessage || "BO 패널 연결 상태를 아직 확인하지 않았습니다."}</p>
          </div>
          <div className="min-w-[280px] rounded-[1rem] border border-line/70 bg-white/75 px-4 py-3 text-sm text-soft">
            <div className="text-[11px] uppercase tracking-[0.2em] text-faint">API target</div>
            <div className="mt-1 break-all font-mono text-xs text-ink">{apiBaseUrl}</div>
            {statusInfo ? (
              <div className="mt-3 space-y-1 text-xs text-faint">
                <div>Study · {statusInfo.study_name}</div>
                <div>Storage · {statusInfo.storage}</div>
                <div>Total trials · {statusInfo.total_trials}</div>
              </div>
            ) : null}
          </div>
        </div>
      </SurfaceCard>

      {/* ── DASHBOARD ── */}
      {view === "dashboard" && (
        <div className="space-y-6">
          {/* stats */}
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard label="총 실험 수" value={stats ? String(stats.total_trials) : dashboardState === "loading" ? "..." : "—"} />
            <MetricCard
              label="최고 성장 속도"
              value={stats?.best_growth_rate != null ? `${stats.best_growth_rate.toFixed(1)} μm/h` : dashboardState === "loading" ? "..." : "—"}
              sub={stats?.best_trial_number != null ? `Trial #${stats.best_trial_number}` : undefined}
            />
            <MetricCard
              label="기판별 실험"
              value={
                stats
                  ? Object.entries(stats.substrate_counts)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" / ")
                  : dashboardState === "loading"
                    ? "loading"
                    : "—"
              }
            />
          </div>

          {/* history chart */}
          <SurfaceCard className="rounded-panel p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.28em] text-faint">Optimization history</div>
                <div className="mt-1 text-base font-semibold text-ink">Trial별 성장 속도 추이</div>
              </div>
              <ActionButton type="button" tone="bo" onClick={loadDashboard}>Refresh</ActionButton>
            </div>
            {history.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={history} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis
                    dataKey="trial_number"
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    label={{ value: "Trial #", position: "insideBottom", offset: -2, fontSize: 11, fill: "#9ca3af" }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    label={{ value: "μm/h", angle: -90, position: "insideLeft", fontSize: 11, fill: "#9ca3af" }}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: "0.75rem", border: "1px solid #e5e7eb", fontSize: 12 }}
                    formatter={(value, name) => {
                      const numericValue = typeof value === "number" ? value : Number(value ?? 0);
                      return [`${numericValue.toFixed(2)} μm/h`, name === "value" ? "성장 속도" : "최고 기록"];
                    }}
                  />
                  <Line type="monotone" dataKey="value" stroke="#1A4FA0" strokeWidth={1.5} dot={{ r: 3, fill: "#1A4FA0" }} name="value" />
                  <Line type="monotone" dataKey="best_value" stroke="#F26522" strokeWidth={2} dot={false} strokeDasharray="5 3" name="best_value" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-40 items-center justify-center text-center text-sm text-faint">
                {dashboardState === "loading"
                  ? "Optimization history를 불러오는 중입니다."
                  : dashboardState === "error"
                    ? dashboardMessage
                    : "완료된 BO trial이 없습니다. 실험 결과를 입력하거나 study 연결 상태를 확인하세요."
                }
              </div>
            )}
          </SurfaceCard>

          <div className="grid gap-6 xl:grid-cols-2">
            {/* importance */}
            <SurfaceCard className="rounded-panel p-6">
              <div className="mb-5">
                <div className="text-xs uppercase tracking-[0.28em] text-faint">Parameter importance</div>
                <div className="mt-1 text-base font-semibold text-ink">성장 속도에 대한 변수 중요도</div>
              </div>
              {importance.length > 0 ? (
                <ImportanceChart data={importance} />
              ) : (
                <div className="text-sm text-faint">
                  {dashboardState === "error"
                    ? "변수 중요도를 계산하지 못했습니다. study 또는 API 연결 상태를 확인하세요."
                    : "변수 중요도는 완료된 trial 2개 이상부터 계산됩니다."
                  }
                </div>
              )}
            </SurfaceCard>

            {/* recommend */}
            <SurfaceCard className="rounded-panel p-6">
              <div className="mb-4">
                <div className="text-xs uppercase tracking-[0.28em] text-faint">Next recommendation</div>
                <div className="mt-1 text-base font-semibold text-ink">다음 실험 추천 조건</div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={recSubstrate}
                  onChange={(e) => setRecSubstrate(e.target.value as "4H SiC" | "Diamond")}
                  className="rounded-xl border border-line bg-surface-muted px-3 py-2 text-sm text-ink"
                >
                  <option value="4H SiC">4H SiC</option>
                  <option value="Diamond">Diamond</option>
                </select>
                <ActionButton type="button" tone="bo" onClick={handleRecommend} disabled={recommendState === "loading"}>
                  {recommendState === "loading" ? "계산 중..." : "추천 받기"}
                </ActionButton>
              </div>
              <div className="mt-3 rounded-[0.9rem] border border-line/70 bg-surface-muted/55 px-3 py-2 text-xs text-soft">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={safeBoundaryConstraints.length > 0 ? "success" : "neutral"}>
                    Research safe boundary {safeBoundaryConstraints.length}
                  </StatusBadge>
                  <span>
                    {safeBoundaryConstraints.length > 0
                      ? "최근 Research 세션에서 승인된 numeric bounds를 추천 요청에 포함합니다."
                      : "승인된 Research numeric bounds가 없으면 기본 BO 탐색공간을 사용합니다."
                    }
                  </span>
                </div>
              </div>
              {recommendMessage ? <div className="mt-3 text-sm text-soft">{recommendMessage}</div> : null}
              {recommend ? (
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ["Substrate", recommend.substrate],
                      ["Power", `${recommend.power} kW`],
                      ["Pressure", `${recommend.pressure} Torr`],
                      ["H₂ Flow", `${recommend.h_flow} sccm`],
                      ["CH₄ Flow", `${recommend.ch4_flow} sccm`],
                      ["CH₄/H₂", `${recommend.ch4_ratio} %`],
                    ].map(([k, v]) => (
                      <SurfaceCard key={k} tone="muted" className="px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.16em] text-faint">{k}</div>
                        <div className="mt-1 text-sm font-semibold text-ink">{v}</div>
                      </SurfaceCard>
                    ))}
                  </div>
                  <AppliedBoundsList bounds={recommend.applied_bounds} />
                  {recommend.safety_notes?.length ? (
                    <div className="rounded-[1rem] border border-line/70 bg-surface-muted/55 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-faint">Safety notes</div>
                      <ul className="mt-2 space-y-1 text-xs leading-5 text-soft">
                        {recommend.safety_notes.map((note) => <li key={note}>• {note}</li>)}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-4 text-sm text-faint">
                  {recommendState === "error"
                    ? "추천 계산에 실패했습니다. study 또는 API 연결 상태를 확인하세요."
                    : "기판을 선택하고 추천 받기를 눌러주세요."
                  }
                </div>
              )}
            </SurfaceCard>
          </div>
        </div>
      )}

      {/* ── SUBMIT ── */}
      {view === "submit" && (
        <SurfaceCard className="rounded-panel p-6">
          <div className="mb-6">
            <div className="text-xs uppercase tracking-[0.28em] text-faint">실험 결과 입력</div>
            <div className="mt-1 text-xl font-semibold text-ink">공정 파라미터 및 성장 속도 기록</div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {/* substrate */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs uppercase tracking-[0.18em] text-faint">Substrate</label>
              <select
                value={form.substrate}
                onChange={(e) => setForm((f) => ({ ...f, substrate: e.target.value }))}
                className="rounded-xl border border-line bg-surface-muted px-3 py-2.5 text-sm text-ink"
              >
                <option value="4H SiC">4H SiC</option>
                <option value="Diamond">Diamond</option>
              </select>
            </div>
            {/* numeric fields */}
            {([
              { key: "power", label: "Power [kW]", min: 0.6, max: 5.0, step: 0.1 },
              { key: "pressure", label: "Pressure [Torr]", min: 0, max: 200, step: 1 },
              { key: "h_flow", label: "H₂ Flow [sccm]", min: 0, max: 1000, step: 10 },
              { key: "ch4_flow", label: "CH₄ Flow [sccm]", min: 0, max: 100, step: 1 },
              { key: "growth_rate", label: "성장 속도 [μm/h]", min: -10, max: 200, step: 0.1 },
            ] as const).map(({ key, label, min, max, step }) => (
              <div key={key} className="flex flex-col gap-1.5">
                <label className="text-xs uppercase tracking-[0.18em] text-faint">{label}</label>
                <input
                  type="number"
                  min={min}
                  max={max}
                  step={step}
                  value={form[key]}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (key === "h_flow" || key === "ch4_flow") {
                      updateFlow(key, val);
                    } else {
                      setForm((f) => ({ ...f, [key]: val }));
                    }
                  }}
                  className="rounded-xl border border-line bg-surface-muted px-3 py-2.5 text-sm text-ink"
                />
              </div>
            ))}
            {/* ch4_ratio readonly */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs uppercase tracking-[0.18em] text-faint">CH₄/H₂ [%] (자동)</label>
              <input
                type="number"
                readOnly
                value={form.ch4_ratio}
                className="rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm text-faint"
              />
            </div>
          </div>
          <div className="mt-6 flex items-center gap-4">
            <ActionButton type="button" tone="bo" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "제출 중..." : "결과 제출"}
            </ActionButton>
            {submitStatus ? <span className="text-sm text-soft">{submitStatus}</span> : null}
          </div>
        </SurfaceCard>
      )}

      {/* ── TRIALS ── */}
      {view === "trials" && (
        <SurfaceCard className="rounded-panel p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-faint">실험 데이터</div>
              <div className="mt-1 text-xl font-semibold text-ink">전체 Trial 목록</div>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={filterSub}
                onChange={(e) => setFilterSub(e.target.value)}
                className="rounded-xl border border-line bg-surface-muted px-3 py-2 text-sm text-ink"
              >
                <option value="">전체 기판</option>
                <option value="4H SiC">4H SiC</option>
                <option value="Diamond">Diamond</option>
              </select>
              <ActionButton type="button" tone="bo" onClick={loadTrials}>조회</ActionButton>
            </div>
          </div>
          {trialsMessage ? <div className="mb-4 text-sm text-soft">{trialsMessage}</div> : null}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-[0.16em] text-faint">
                  {["#", "Substrate", "Power", "Pressure", "H₂", "CH₄", "CH₄/H₂", "Growth Rate"].map((h) => (
                    <th key={h} className="pb-3 pr-4 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trials.map((t) => (
                  <tr key={t.trial_number} className="border-b border-line/50 hover:bg-surface-muted/50">
                    <td className="py-3 pr-4 font-mono text-faint">{t.trial_number}</td>
                    <td className="py-3 pr-4 font-medium text-ink">{t.substrate}</td>
                    <td className="py-3 pr-4 text-soft">{t.power?.toFixed(2) ?? "—"}</td>
                    <td className="py-3 pr-4 text-soft">{t.pressure?.toFixed(0) ?? "—"}</td>
                    <td className="py-3 pr-4 text-soft">{t.h_flow?.toFixed(0) ?? "—"}</td>
                    <td className="py-3 pr-4 text-soft">{t.ch4_flow?.toFixed(1) ?? "—"}</td>
                    <td className="py-3 pr-4 text-soft">{t.ch4_ratio?.toFixed(2) ?? "—"}%</td>
                    <td className="py-3 pr-4 font-semibold" style={{ color: "#F26522" }}>
                      {t.growth_rate?.toFixed(2) ?? "—"} μm/h
                    </td>
                  </tr>
                ))}
                {trials.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-sm text-faint">
                      {trialsState === "loading"
                        ? "Trial 목록을 불러오는 중입니다."
                        : trialsState === "error"
                          ? "Trial 목록을 불러오지 못했습니다. API 서버와 포트를 확인하세요."
                          : "완료된 trial이 없습니다. 필터를 바꾸거나 실험 결과를 먼저 입력하세요."
                      }
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SurfaceCard>
      )}

      {/* ── OPTUNA DASHBOARD ── */}
      {view === "optuna" && (
        <SurfaceCard className="rounded-panel p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-faint">Optuna Official Dashboard</div>
              <div className="mt-1 text-xl font-semibold text-ink">Study 전체 시각화</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-faint">localhost:8080 필요</span>
              <a
                href="http://localhost:8080"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-line bg-surface-muted px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-white"
              >
                새 탭으로 열기 ↗
              </a>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-line bg-surface-muted" style={{ height: "75vh" }}>
            <iframe
              src="http://localhost:8080"
              className="h-full w-full"
              title="Optuna Dashboard"
            />
          </div>
          <p className="mt-3 text-xs text-faint">
            터미널에서{" "}
            <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono">
              optuna-dashboard sqlite:///C:/Users/t_y_p/OneDrive/6.%20programing/Optuna/mpcvd_study_v2.db
            </code>{" "}
            를 실행하면 대시보드가 활성화됩니다.
          </p>
        </SurfaceCard>
      )}
    </div>
  );
}
