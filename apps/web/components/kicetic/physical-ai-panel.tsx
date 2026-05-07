import type { PhysicalAIPanelData } from "@kicetic/shared/contracts";
import { SurfaceCard } from "@/components/ui/surface-card";
import { StatusBadge } from "@/components/ui/status-badge";

type PhysicalAIPanelProps = {
  data: PhysicalAIPanelData;
};

const twinBlocks = [
  { label: "Reactor twin", detail: "챔버 조건과 plasma 상태를 디지털 모델로 맞춥니다." },
  { label: "Sensor sync", detail: "실험 로그·계측값을 시간축 기준으로 정렬합니다." },
  { label: "Control loop", detail: "BO 추천을 안전 경계 안에서 자동 실험 후보로 넘깁니다." }
];

const buildQueue = ["장비/센서 schema 정리", "시뮬레이션 상태판 연결", "safe boundary 기반 제어 검증"];

export function PhysicalAIPanel({ data }: PhysicalAIPanelProps) {
  return (
    <div className="space-y-6">
      <SurfaceCard tone="contrast" className="rounded-panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <StatusBadge tone="success">4. Physical AI · 공사중</StatusBadge>
            <h3 className="mt-4 text-3xl font-semibold text-ink">디지털 트윈 제어실 준비 중</h3>
            <p className="mt-3 text-sm leading-6 text-soft">
              실제 MPCVD 장비 상태를 디지털 트윈으로 옮기고, 추천 조건을 안전하게 실험으로 연결하는 공간으로 확장합니다.
            </p>
          </div>
          <StatusBadge tone="neutral">{data.readiness}</StatusBadge>
        </div>
      </SurfaceCard>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SurfaceCard className="rounded-panel p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-faint">Twin layers</div>
              <div className="mt-1 text-base font-semibold text-ink">구축 예정 모듈</div>
            </div>
            <StatusBadge tone="success">draft</StatusBadge>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {twinBlocks.map((block) => (
              <SurfaceCard key={block.label} tone="muted" className="px-4 py-4">
                <div className="text-base font-semibold text-ink">{block.label}</div>
                <p className="mt-2 text-sm leading-6 text-soft">{block.detail}</p>
              </SurfaceCard>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard className="rounded-panel p-6">
          <div className="text-xs uppercase tracking-[0.28em] text-faint">Build queue</div>
          <div className="mt-4 space-y-3">
            {buildQueue.map((item, index) => (
              <SurfaceCard key={item} tone="muted" className="flex items-center gap-3 px-4 py-3">
                <div className="rounded-full bg-success/10 px-2 py-1 text-xs font-semibold text-success">0{index + 1}</div>
                <div className="text-sm font-medium text-ink">{item}</div>
              </SurfaceCard>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-faint">현재는 화면 설계 단계이며, 이후 장비 데이터와 제어 로직을 단계적으로 연결합니다.</p>
        </SurfaceCard>
      </div>
    </div>
  );
}
