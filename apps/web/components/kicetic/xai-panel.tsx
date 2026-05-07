"use client";

import { useMemo, useState } from "react";
import type { XAIPanelData } from "@kicetic/shared/contracts";
import { StatusBadge } from "@/components/ui/status-badge";
import { SurfaceCard } from "@/components/ui/surface-card";
import { getDataModeLabel } from "@/lib/mock-toggle";

type AudienceKey = "researcher" | "teamLead" | "executive";

type XAIPanelProps = {
  data: XAIPanelData;
};

const audienceTabs: Array<{ key: AudienceKey; label: string; emphasis: string; message: string }> = [
  {
    key: "researcher",
    label: "연구원",
    emphasis: "메커니즘",
    message: "가설·근거·constraint를 함께 보여주는 실험 해석 뷰로 확장합니다."
  },
  {
    key: "teamLead",
    label: "팀장",
    emphasis: "실행",
    message: "다음 실험, 리스크, 필요한 리소스를 한 장으로 정리하는 뷰를 준비합니다."
  },
  {
    key: "executive",
    label: "임원",
    emphasis: "의사결정",
    message: "성과 지표와 go/no-go 판단 근거를 짧게 요약하는 레이어로 발전시킵니다."
  }
];

const buildSteps = ["관점별 요약 계약 정리", "Research·BO 근거 연결", "승인 가능한 의사결정 카드화"];

export function XAIPanel({ data }: XAIPanelProps) {
  const [activeAudience, setActiveAudience] = useState<AudienceKey>("executive");
  const selectedNote = useMemo(
    () => audienceTabs.find((note) => note.key === activeAudience) ?? audienceTabs[0],
    [activeAudience]
  );

  return (
    <div className="space-y-6">
      <SurfaceCard tone="contrast" className="rounded-panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <StatusBadge tone="xai">5. X.AI · 공사중</StatusBadge>
            <h3 className="mt-4 text-3xl font-semibold text-ink">의사결정 레이어 준비 중</h3>
            <p className="mt-3 text-sm leading-6 text-soft">
              Research와 BO 결과를 이해관계자별로 요약하고, 승인 가능한 판단 카드로 묶는 방향으로 구축합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="neutral">모드 {getDataModeLabel()}</StatusBadge>
            <StatusBadge tone="xai">리스크: {data.riskLevel}</StatusBadge>
          </div>
        </div>

        <div className="mt-6 inline-flex flex-wrap gap-2 rounded-full border border-line bg-white/70 p-1">
          {audienceTabs.map((tab) => {
            const isActive = tab.key === activeAudience;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveAudience(tab.key)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  isActive ? "bg-xai text-white shadow-card" : "text-soft hover:bg-surface-muted"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </SurfaceCard>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <SurfaceCard className="rounded-panel p-6">
          <div className="text-xs uppercase tracking-[0.28em] text-faint">Preview card</div>
          <SurfaceCard tone="muted" className="mt-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xl font-semibold text-ink">{selectedNote.label} 관점</div>
              <StatusBadge tone="xai">{selectedNote.emphasis}</StatusBadge>
            </div>
            <p className="mt-4 text-sm leading-7 text-soft">{selectedNote.message}</p>
          </SurfaceCard>
        </SurfaceCard>

        <SurfaceCard className="rounded-panel p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-faint">Next build</div>
              <div className="mt-1 text-base font-semibold text-ink">구현 방향</div>
            </div>
            <StatusBadge tone="neutral">prototype</StatusBadge>
          </div>
          <div className="mt-4 space-y-3">
            {buildSteps.map((step, index) => (
              <SurfaceCard key={step} tone="muted" className="flex items-center gap-3 px-4 py-3">
                <div className="rounded-full bg-xai/10 px-2 py-1 text-xs font-semibold text-xai">0{index + 1}</div>
                <div className="text-sm font-medium text-ink">{step}</div>
              </SurfaceCard>
            ))}
          </div>
        </SurfaceCard>
      </section>
    </div>
  );
}
