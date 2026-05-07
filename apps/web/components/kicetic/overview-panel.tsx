import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import type { OverviewPanelData } from "@kicetic/shared/contracts";
import { SurfaceCard } from "@/components/ui/surface-card";
import { StatusBadge } from "@/components/ui/status-badge";

type OverviewPanelProps = {
  data: OverviewPanelData;
};

type ModuleTone = NonNullable<OverviewPanelData["modules"]>[number]["tone"];

const moduleToneClasses: Record<ModuleTone, string> = {
  research: "border-research/20 bg-research/8 hover:border-research/34 hover:bg-research/12",
  bo: "border-bo/20 bg-bo/10 hover:border-bo/34 hover:bg-bo/14",
  xai: "border-xai/20 bg-xai/10 hover:border-xai/34 hover:bg-xai/14",
  success: "border-success/20 bg-success/10 hover:border-success/34 hover:bg-success/14",
  neutral: "border-line/80 bg-white/72 hover:border-line-strong hover:bg-white"
};

const workflowStatusClasses = {
  complete: "border-success/18 bg-success/10 text-success",
  active: "border-research/18 bg-research/8 text-research",
  queued: "border-line bg-white/70 text-soft"
} as const;

export function OverviewPanel({ data }: OverviewPanelProps) {
  const modules = data.modules ?? [];
  const trustSignals = data.trustSignals ?? [];
  const roadmap = data.roadmap ?? [];

  return (
    <div className="space-y-6">
      <SurfaceCard className="relative overflow-hidden rounded-panel p-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(74,104,179,0.16),transparent_34%),radial-gradient(circle_at_88%_12%,rgba(153,104,72,0.12),transparent_30%)]" />
        <div className="relative grid gap-8 p-6 lg:grid-cols-[1.1fr_0.9fr] xl:p-8">
          <div className="flex min-h-[430px] flex-col justify-between gap-10">
            <div>
              <StatusBadge tone="research">MPCVD Diamond AI</StatusBadge>
              <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.22em] text-faint">
                <span className="font-bold text-ink">K</span>nowledge-based{" "}
                <span className="font-bold text-ink">I</span>ntelligent{" "}
                <span className="font-bold text-ink">C</span>yber{" "}
                <span className="font-bold text-ink">E</span>xperimental{" "}
                <span className="font-bold text-ink">T</span>win{" "}
                <span className="font-bold text-ink">I</span>ntegrated{" "}
                <span className="font-bold text-ink">C</span>ontrol
              </p>
              <h3 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.04em] text-ink md:text-5xl md:leading-[1.06]">
                {data.heroTitle}
              </h3>
              <p className="mt-5 max-w-2xl text-base leading-7 text-soft">
                {data.heroSummary}
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href="/dashboard/research"
                  className="inline-flex items-center justify-center rounded-full border border-research/20 bg-research px-5 py-2.5 text-sm font-medium text-white shadow-card transition hover:bg-research/90"
                >
                  Multi Agent 시작
                </Link>
                <Link
                  href="/dashboard/bo"
                  className="inline-flex items-center justify-center rounded-full border border-line bg-white/78 px-5 py-2.5 text-sm font-medium text-ink shadow-card transition hover:bg-white"
                >
                  BO 추천 보기
                </Link>
              </div>
            </div>

          </div>

          <SurfaceCard tone="contrast" className="flex min-h-[430px] flex-col justify-between overflow-hidden rounded-[1.7rem] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-faint">Platform map</div>
                <h4 className="mt-2 text-2xl font-semibold text-ink">모듈은 독립 실행, 결과는 한 흐름</h4>
              </div>
            </div>
            <div className="mt-5 overflow-hidden rounded-[1.35rem] border border-line/70 bg-white/68">
              <Image
                src="/home-roadmap.png"
                alt="KICETIC AI Research Framework Roadmap"
                width={1600}
                height={900}
                className="w-full object-contain"
                priority
              />
            </div>
          </SurfaceCard>
        </div>
      </SurfaceCard>

      {modules.length > 0 ? (
        <section aria-label="KICETIC module entry points" className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {modules.map((module) => (
            <Link
              key={module.label}
              href={module.href as Route}
              className={`group rounded-[1.45rem] border p-5 shadow-card transition ${moduleToneClasses[module.tone]}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-xs uppercase tracking-[0.22em] text-faint">{module.status}</div>
                <StatusBadge tone={module.tone}>{module.label}</StatusBadge>
              </div>
              <p className="mt-5 text-sm leading-6 text-soft">{module.summary}</p>
              <div className="mt-5 text-sm font-semibold text-ink transition group-hover:translate-x-1">모듈 열기 →</div>
            </Link>
          ))}
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <SurfaceCard className="rounded-panel p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.26em] text-faint">Closed-loop workflow</div>
              <h4 className="mt-2 text-2xl font-semibold text-ink">모듈별 실행 흐름</h4>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-soft">
                세부 근거는 각 모듈에서 확인합니다.
              </p>
            </div>
            <StatusBadge tone="neutral">Orchestrated modules</StatusBadge>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
            {data.workflow.map((step, index) => (
              <SurfaceCard key={step.title} tone="muted" className="relative overflow-hidden p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-faint">Step 0{index + 1}</div>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${workflowStatusClasses[step.status]}`}>
                    {step.status}
                  </span>
                </div>
                <div className="mt-4 text-lg font-semibold text-ink">{step.title}</div>
                <p className="mt-3 text-sm leading-6 text-soft">{step.description}</p>
              </SurfaceCard>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard tone="contrast" className="rounded-panel p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.26em] text-faint">Trust signals</div>
              <h4 className="mt-2 text-2xl font-semibold text-ink">연구 판단에 필요한 근거 계층</h4>
            </div>
            <StatusBadge tone="success">Traceable</StatusBadge>
          </div>
          <div className="mt-5 space-y-3">
            {trustSignals.map((signal) => (
              <SurfaceCard key={signal.label} tone="default" className="p-4">
                <div className="text-[11px] uppercase tracking-[0.2em] text-faint">{signal.label}</div>
                <div className="mt-2 text-base font-semibold text-ink">{signal.value}</div>
                <p className="mt-2 text-sm leading-6 text-soft">{signal.description}</p>
              </SurfaceCard>
            ))}
          </div>
        </SurfaceCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <SurfaceCard className="rounded-panel p-6">
          <div className="text-xs uppercase tracking-[0.26em] text-faint">Build roadmap</div>
          <h4 className="mt-2 text-2xl font-semibold text-ink">현재 가능한 기능과 다음 확장</h4>
          <div className="mt-5 space-y-3">
            {roadmap.map((item) => (
              <SurfaceCard key={item.title} tone="muted" className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-base font-semibold text-ink">{item.title}</div>
                  <StatusBadge tone="neutral">{item.status}</StatusBadge>
                </div>
                <p className="mt-3 text-sm leading-6 text-soft">{item.description}</p>
              </SurfaceCard>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard tone="contrast" className="rounded-panel p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.26em] text-faint">Watchlist</div>
              <h4 className="mt-2 text-2xl font-semibold text-ink">운영 전에 확인할 연구 리스크</h4>
            </div>
            <StatusBadge tone="neutral">Review queue</StatusBadge>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {data.watchlist.map((item) => (
              <SurfaceCard key={item} tone="default" className="p-4">
                <p className="text-sm leading-6 text-soft">{item}</p>
              </SurfaceCard>
            ))}
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
}
