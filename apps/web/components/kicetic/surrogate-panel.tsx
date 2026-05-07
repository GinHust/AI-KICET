"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import type {
  ResolvedSpectroscopyMode,
  SpectroscopyAnalysisResultDto,
  SpectroscopyMode,
  SpectroscopyPeakDto,
  SpectroscopyPointDto,
  SpectroscopyReferenceCandidateDto,
  SpectroscopySeriesDto,
  SpectroscopyUploadFileDto,
  SurrogatePanelData
} from "@kicetic/shared/contracts";
import { ActionButton } from "@/components/ui/action-button";
import { SurfaceCard } from "@/components/ui/surface-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiClient } from "@/lib/api-client";

type SurrogatePanelProps = {
  data: SurrogatePanelData;
};

type EstimatorInputs = {
  temperatureK: number;
  pressureTorr: number;
  hMoleFraction: number;
  h2FlowSccm: number;
  ch4FlowSccm: number;
  nitrogenFlowSccm: number;
  activationFactor: number;
  residenceFactor: number;
};

type SensitivityPoint = {
  hMoleFraction: number;
  growthRateUmPerHour: number;
};

type NitrogenSensitivityPoint = {
  nitrogenRatioPpm: number;
  growthRateUmPerHour: number;
  qualityRiskIndex: number;
};

type EstimatorResult = {
  growthRateUmPerHour: number;
  surfaceCoverage: number;
  carbonSupplyIndex: number;
  hydrogenActivationIndex: number;
  ch4RatioPercent: number;
  nitrogenRatioPpm: number;
  totalFlowSccm: number;
  nitrogenGrowthBoost: number;
  qualityRiskIndex: number;
  confidence: "high" | "medium" | "low";
  riskNotes: string[];
  sensitivity: SensitivityPoint[];
  nitrogenSensitivity: NitrogenSensitivityPoint[];
};

type CanteraCoverage = {
  species: string;
  coverage: number;
};

type CanteraRunResponse = {
  status: "ready" | "unavailable" | "failed";
  message: string;
  growthRateUmPerHour: number | null;
  mechanism: string | null;
  mechanismSource: "repo" | "cantera-package" | "missing";
  canteraVersion: string | null;
  gasPhase: string | null;
  surfacePhase: string | null;
  nitrogenApplied: boolean;
  surfaceCoverages: CanteraCoverage[];
  notes: string[];
};

type CanteraRunState = "idle" | "loading" | CanteraRunResponse["status"];

type InputKey = keyof EstimatorInputs;

const roadmap = [
  { label: "데이터 연결", detail: "BO trial과 Research constraint를 학습 데이터로 묶습니다." },
  { label: "대리 모델", detail: "성장률·품질 KPI를 빠르게 예측하는 surrogate를 붙입니다." },
  { label: "불확실성", detail: "추천 조건마다 신뢰 구간과 추가 실험 필요도를 표시합니다." }
];

const initialInputs: EstimatorInputs = {
  temperatureK: 1200,
  pressureTorr: 120,
  hMoleFraction: 0.00045,
  h2FlowSccm: 100,
  ch4FlowSccm: 4.2,
  nitrogenFlowSccm: 0.00105,
  activationFactor: 1,
  residenceFactor: 1
};

const inputFields: Array<{ key: InputKey; label: string; min: number; max: number; step: number; helper: string }> = [
  { key: "temperatureK", label: "Temperature [K]", min: 900, max: 1500, step: 10, helper: "surface temperature" },
  { key: "pressureTorr", label: "Pressure [Torr]", min: 10, max: 260, step: 5, helper: "process pressure" },
  { key: "hMoleFraction", label: "H mole fraction", min: 0.00005, max: 0.0016, step: 0.00005, helper: "near-surface H" },
  { key: "h2FlowSccm", label: "H₂ flow [sccm]", min: 10, max: 1000, step: 5, helper: "carrier flow" },
  { key: "ch4FlowSccm", label: "CH₄ flow [sccm]", min: 0.05, max: 80, step: 0.05, helper: "carbon precursor" },
  { key: "nitrogenFlowSccm", label: "N₂ flow [sccm]", min: 0, max: 10, step: 0.0005, helper: "nitrogen co-flow" },
  { key: "activationFactor", label: "Activation factor", min: 0.6, max: 1.4, step: 0.05, helper: "rate constant proxy" },
  { key: "residenceFactor", label: "Residence factor", min: 0.6, max: 1.4, step: 0.05, helper: "gas refresh proxy" }
];

type SpectroscopyUploadDraft = SpectroscopyUploadFileDto & {
  sizeBytes?: number;
};

const defaultSpectroscopyFiles: SpectroscopyUploadDraft[] = [
  {
    filename: "diamond_xrd_reference_like.csv",
    label: "Sample A · baseline",
    contentText: `2theta,intensity
20,4
30,8
38,15
43.9,100
50,18
64.1,58
75.3,34
82,12`
  },
  {
    filename: "diamond_xrd_shifted_trial.csv",
    label: "Sample B · N₂ trial",
    contentText: `2theta,intensity
20,5
30,7
38,18
44.2,92
50,20
64.4,65
75.6,40
82,14`
  }
];

const spectroscopyModeLabels: Record<ResolvedSpectroscopyMode, { x: string; unit: string; title: string }> = {
  xrd: { x: "2θ", unit: "°", title: "XRD" },
  raman: { x: "Raman shift", unit: "cm⁻¹", title: "Raman" }
};

const spectroscopyColors = ["#7c3aed", "#059669", "#2563eb", "#dc2626"];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function deriveFlowRatios(inputs: EstimatorInputs) {
  const h2FlowSccm = Math.max(inputs.h2FlowSccm, 1e-9);
  const ch4FlowSccm = Math.max(inputs.ch4FlowSccm, 1e-9);
  const nitrogenFlowSccm = Math.max(inputs.nitrogenFlowSccm, 0);

  return {
    ch4RatioPercent: Number(clamp((ch4FlowSccm / h2FlowSccm) * 100, 0, 30).toFixed(2)),
    nitrogenRatioPpm: Number(clamp((nitrogenFlowSccm / ch4FlowSccm) * 1_000_000, 0, 10_000).toFixed(0)),
    totalFlowSccm: Number((h2FlowSccm + ch4FlowSccm + nitrogenFlowSccm).toFixed(4))
  };
}

function estimateNitrogenEffects(nitrogenRatioPpm: number, ch4RatioPercent: number) {
  const normalizedNitrogen = clamp(nitrogenRatioPpm / 500, 0, 2.4);
  const nitrogenGrowthBoost = 1 + 0.28 * (1 - Math.exp(-normalizedNitrogen * 1.15));
  const highNitrogenPenalty = nitrogenRatioPpm > 900 ? clamp(1 - (nitrogenRatioPpm - 900) / 3000, 0.88, 1) : 1;
  const qualityRiskIndex = clamp(0.06 + Math.pow(nitrogenRatioPpm / 900, 1.2) * 0.78 + (ch4RatioPercent > 6.5 ? 0.1 : 0), 0.03, 0.98);

  return {
    nitrogenGrowthBoost: nitrogenGrowthBoost * highNitrogenPenalty,
    qualityRiskIndex
  };
}

function estimateGrowthRate(inputs: EstimatorInputs): EstimatorResult {
  const { ch4RatioPercent, nitrogenRatioPpm, totalFlowSccm } = deriveFlowRatios(inputs);
  const temperatureFactor = clamp(Math.exp(-6200 / inputs.temperatureK) / Math.exp(-6200 / 1200), 0.35, 2.2);
  const pressureFactor = clamp(Math.sqrt(inputs.pressureTorr / 120), 0.45, 1.45);
  const carbonSupplyIndex = clamp(ch4RatioPercent / 4.5, 0.2, 2.2);
  const hydrogenActivationIndex = clamp(Math.log1p(inputs.hMoleFraction * 1100) / Math.log1p(0.0014 * 1100), 0.02, 1.15);
  const methanePenalty = ch4RatioPercent > 6.5 ? clamp(1 - (ch4RatioPercent - 6.5) * 0.12, 0.55, 1) : 1;
  const leanMethanePenalty = ch4RatioPercent < 1.5 ? 0.78 : 1;
  const { nitrogenGrowthBoost, qualityRiskIndex } = estimateNitrogenEffects(nitrogenRatioPpm, ch4RatioPercent);
  const coverage = clamp(hydrogenActivationIndex * 0.7 + clamp(carbonSupplyIndex, 0, 1) * 0.16 + temperatureFactor * 0.12 + Math.min(nitrogenGrowthBoost - 1, 0.22) * 0.1, 0.04, 0.98);
  const growthRate = 0.58 * hydrogenActivationIndex * temperatureFactor * pressureFactor * clamp(carbonSupplyIndex, 0.55, 1.25) * methanePenalty * leanMethanePenalty * nitrogenGrowthBoost * inputs.activationFactor * inputs.residenceFactor;
  const riskNotes: string[] = [];

  if (inputs.hMoleFraction < 0.00015) {
    riskNotes.push("H radical proxy가 낮아 surface activation이 부족할 수 있습니다.");
  }
  if (ch4RatioPercent > 6.5) {
    riskNotes.push("CH₄/H₂가 높은 편이라 non-diamond carbon 또는 plasma instability를 확인해야 합니다.");
  }
  if (nitrogenRatioPpm > 0) {
    riskNotes.push(`N₂ co-flow가 ${nitrogenRatioPpm} ppm으로 환산되어 성장속도 boost ${nitrogenGrowthBoost.toFixed(2)}×로 반영되었습니다.`);
  }
  if (nitrogenRatioPpm > 650) {
    riskNotes.push("N₂/CH₄가 높아 결함, 색 중심, surface morphology 리스크를 같이 확인해야 합니다.");
  }
  if (inputs.temperatureK < 1050 || inputs.temperatureK > 1400) {
    riskNotes.push("temperature가 screening 기준 범위를 벗어나 rate constant 보정이 필요합니다.");
  }
  if (inputs.pressureTorr < 20 || inputs.pressureTorr > 250) {
    riskNotes.push("pressure가 현재 validated safe boundary 밖에 있습니다.");
  }
  if (qualityRiskIndex > 0.72) {
    riskNotes.push("quality risk index가 높아 성장속도만 보고 조건을 고르면 위험합니다.");
  }
  if (riskNotes.length === 0) {
    riskNotes.push("입력 조건은 screening 기준 안정 구간에 있습니다.");
  }

  const sensitivity = [0.00008, 0.00016, 0.0003, 0.00045, 0.00065, 0.0009, 0.0012, 0.0015].map((hMoleFraction) => ({
    hMoleFraction,
    growthRateUmPerHour: Number(
      estimateGrowthRateWithoutSensitivity({
        ...inputs,
        hMoleFraction
      }).toFixed(3)
    )
  }));
  const nitrogenSensitivity = [0, 50, 100, 250, 500, 800, 1000, 1200].map((nextNitrogenRatioPpm) => {
    const nextInputs = { ...inputs, nitrogenFlowSccm: inputs.ch4FlowSccm * nextNitrogenRatioPpm / 1_000_000 };
    const nitrogenEffects = estimateNitrogenEffects(nextNitrogenRatioPpm, ch4RatioPercent);

    return {
      nitrogenRatioPpm: nextNitrogenRatioPpm,
      growthRateUmPerHour: Number(estimateGrowthRateWithoutSensitivity(nextInputs).toFixed(3)),
      qualityRiskIndex: Number(nitrogenEffects.qualityRiskIndex.toFixed(2))
    };
  });

  return {
    growthRateUmPerHour: Number(growthRate.toFixed(3)),
    surfaceCoverage: Number(coverage.toFixed(2)),
    carbonSupplyIndex: Number(carbonSupplyIndex.toFixed(2)),
    hydrogenActivationIndex: Number(hydrogenActivationIndex.toFixed(2)),
    ch4RatioPercent,
    nitrogenRatioPpm,
    totalFlowSccm,
    nitrogenGrowthBoost: Number(nitrogenGrowthBoost.toFixed(2)),
    qualityRiskIndex: Number(qualityRiskIndex.toFixed(2)),
    confidence: riskNotes.length > 3 || qualityRiskIndex > 0.75 ? "low" : riskNotes.length > 1 || qualityRiskIndex > 0.55 ? "medium" : "high",
    riskNotes,
    sensitivity,
    nitrogenSensitivity
  };
}

function estimateGrowthRateWithoutSensitivity(inputs: EstimatorInputs) {
  const { ch4RatioPercent, nitrogenRatioPpm } = deriveFlowRatios(inputs);
  const temperatureFactor = clamp(Math.exp(-6200 / inputs.temperatureK) / Math.exp(-6200 / 1200), 0.35, 2.2);
  const pressureFactor = clamp(Math.sqrt(inputs.pressureTorr / 120), 0.45, 1.45);
  const carbonSupplyIndex = clamp(ch4RatioPercent / 4.5, 0.2, 2.2);
  const hydrogenActivationIndex = clamp(Math.log1p(inputs.hMoleFraction * 1100) / Math.log1p(0.0014 * 1100), 0.02, 1.15);
  const methanePenalty = ch4RatioPercent > 6.5 ? clamp(1 - (ch4RatioPercent - 6.5) * 0.12, 0.55, 1) : 1;
  const leanMethanePenalty = ch4RatioPercent < 1.5 ? 0.78 : 1;
  const { nitrogenGrowthBoost } = estimateNitrogenEffects(nitrogenRatioPpm, ch4RatioPercent);
  return 0.58 * hydrogenActivationIndex * temperatureFactor * pressureFactor * clamp(carbonSupplyIndex, 0.55, 1.25) * methanePenalty * leanMethanePenalty * nitrogenGrowthBoost * inputs.activationFactor * inputs.residenceFactor;
}

function parseSpectroscopyText(contentText: string): SpectroscopyPointDto[] {
  return contentText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("//"))
    .map((line) => line.split(/[,\t; ]+/).map((part) => Number.parseFloat(part)))
    .filter(([x, intensity]) => Number.isFinite(x) && Number.isFinite(intensity))
    .map(([x, intensity]) => ({ x, intensity }))
    .sort((a, b) => a.x - b.x);
}

function smoothIntensity(points: SpectroscopyPointDto[]) {
  return points.map((point, index) => {
    const window = points.slice(Math.max(0, index - 1), Math.min(points.length, index + 2));
    const average = window.reduce((sum, item) => sum + item.intensity, 0) / window.length;
    return { ...point, intensity: average };
  });
}

function normalizePoints(points: SpectroscopyPointDto[]) {
  const minIntensity = Math.min(...points.map((point) => point.intensity), 0);
  const shifted = points.map((point) => ({ ...point, intensity: Math.max(point.intensity - minIntensity, 0) }));
  const maxIntensity = Math.max(...shifted.map((point) => point.intensity), 1);
  return shifted.map((point) => ({ ...point, intensity: Number(((point.intensity / maxIntensity) * 100).toFixed(2)) }));
}

function resolveSpectroscopyMode(mode: SpectroscopyMode, points: SpectroscopyPointDto[]): ResolvedSpectroscopyMode {
  if (mode !== "auto") {
    return mode;
  }

  const maxX = Math.max(...points.map((point) => point.x), 0);
  return maxX > 250 ? "raman" : "xrd";
}

function detectSpectroscopyPeaks(seriesId: string, points: SpectroscopyPointDto[], mode: ResolvedSpectroscopyMode): SpectroscopyPeakDto[] {
  const candidates = points
    .slice(1, -1)
    .filter((point, index) => {
      const previous = points[index];
      const next = points[index + 2];
      return point.intensity >= previous.intensity && point.intensity >= next.intensity && point.intensity >= 18;
    })
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, 5)
    .sort((a, b) => a.x - b.x);

  return candidates.map((point, index) => ({
    id: `${seriesId}-peak-${index + 1}`,
    seriesId,
    position: Number(point.x.toFixed(mode === "xrd" ? 2 : 1)),
    intensity: Number(point.intensity.toFixed(2)),
    normalizedIntensity: Number(point.intensity.toFixed(2)),
    label: `${spectroscopyModeLabels[mode].x} ${point.x.toFixed(mode === "xrd" ? 1 : 0)}${spectroscopyModeLabels[mode].unit}`
  }));
}

function makeReferenceCandidates(expectedMaterial: string, mode: ResolvedSpectroscopyMode): SpectroscopyReferenceCandidateDto[] {
  const normalized = expectedMaterial.trim() || "expected material";
  const lower = normalized.toLowerCase();
  const isDiamondLike = lower.includes("diamond") || lower.includes("carbon") || lower === "c";

  if (mode === "raman") {
    return [
      {
        id: "local-raman-reference",
        provider: "local-template",
        material: normalized,
        source: "Built-in Raman marker template",
        provenance: "Local deterministic fallback used because live RRUFF/OpenAI/provider access is not required for this frontend slice.",
        caveat: "Reference markers are advisory guideposts, not a database-backed phase identification.",
        peaks: isDiamondLike
          ? [
              { position: 1332, relativeIntensity: 100, label: "diamond-like line" },
              { position: 1350, relativeIntensity: 45, label: "D-band region" },
              { position: 1580, relativeIntensity: 55, label: "G-band region" }
            ]
          : [
              { position: 500, relativeIntensity: 70, label: "expected-material marker" },
              { position: 1000, relativeIntensity: 60, label: "secondary marker" },
              { position: 1500, relativeIntensity: 45, label: "broad feature marker" }
            ]
      }
    ];
  }

  return [
    {
      id: "local-xrd-reference",
      provider: "local-template",
      material: normalized,
      source: "Built-in XRD marker template",
      provenance: "Local deterministic fallback standing in for optional Materials Project/COD/RRUFF provider payloads.",
      caveat: "Markers are for visual comparison only and do not prove material identity, phase fraction, or crystallinity.",
      peaks: isDiamondLike
        ? [
            { position: 43.9, relativeIntensity: 100, hkl: "111", label: "diamond-like 111" },
            { position: 75.3, relativeIntensity: 45, hkl: "220", label: "diamond-like 220" },
            { position: 91.4, relativeIntensity: 28, hkl: "311", label: "diamond-like 311" }
          ]
        : [
            { position: 28.4, relativeIntensity: 75, label: "expected-material marker" },
            { position: 47.3, relativeIntensity: 55, label: "secondary marker" },
            { position: 56.1, relativeIntensity: 42, label: "tertiary marker" }
          ]
    }
  ];
}

function buildComparison(series: SpectroscopySeriesDto[]): SpectroscopyAnalysisResultDto["comparison"] {
  const firstPeakPositions = series.map((item) => item.peaks[0]?.position).filter((value): value is number => Number.isFinite(value));
  const peakWindow = firstPeakPositions.length > 1 ? Math.max(...firstPeakPositions) - Math.min(...firstPeakPositions) : 0;

  return {
    headline: series.length > 1 ? `${series.length}개 파일 overlay comparison` : "단일 spectrum publication preview",
    sampleCount: series.length,
    renderMode: series.length > 1 ? "overlay" : "stacked",
    observations: [
      series.length > 1
        ? `주요 peak 위치 차이는 약 ${peakWindow.toFixed(2)} 단위로 관찰됩니다. 이는 후보 shift이며 수동 보정 확인이 필요합니다.`
        : "단일 파일의 peak 후보를 annotation하고 reference marker와 시각적으로 대조합니다.",
      "Intensity는 baseline offset 후 0–100 범위로 정규화되어 sample 간 상대 비교용으로만 표시됩니다.",
      "Reference provider가 unavailable이어도 업로드 데이터, peak 후보, export artifact는 계속 생성됩니다."
    ]
  };
}

function buildProcessedCsv(series: SpectroscopySeriesDto[]) {
  return [
    "series_id,label,x,intensity_normalized",
    ...series.flatMap((item) => item.points.map((point) => `${item.id},"${item.label.replaceAll('"', '""')}",${point.x},${point.intensity}`))
  ].join("\n");
}

function escapeSvgText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildFigureSvg(series: SpectroscopySeriesDto[], references: SpectroscopyReferenceCandidateDto[], mode: ResolvedSpectroscopyMode, expectedMaterial: string) {
  const width = 960;
  const height = 540;
  const margin = { left: 76, right: 28, top: 58, bottom: 70 };
  const allPoints = series.flatMap((item) => item.points);
  const xMin = Math.min(...allPoints.map((point) => point.x), 0);
  const xMax = Math.max(...allPoints.map((point) => point.x), 1);
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const xScale = (x: number) => margin.left + ((x - xMin) / Math.max(xMax - xMin, 1)) * plotWidth;
  const yScale = (intensity: number, seriesIndex: number) => {
    const offset = series.length > 1 ? seriesIndex * 9 : 0;
    return margin.top + plotHeight - (clamp(intensity + offset, 0, 110) / 110) * plotHeight;
  };
  const axis = spectroscopyModeLabels[mode];
  const safeExpectedMaterial = escapeSvgText(expectedMaterial || "expected material");
  const referenceLines = references.flatMap((reference) => reference.peaks).filter((peak) => peak.position >= xMin && peak.position <= xMax);
  const polylines = series
    .map((item, index) => {
      const color = spectroscopyColors[index % spectroscopyColors.length];
      const points = item.points.map((point) => `${xScale(point.x).toFixed(1)},${yScale(point.intensity, index).toFixed(1)}`).join(" ");
      return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" />`;
    })
    .join("");
  const peakLabels = series
    .flatMap((item, index) =>
      item.peaks.slice(0, 3).map((peak) => {
        const color = spectroscopyColors[index % spectroscopyColors.length];
        const x = xScale(peak.position);
        const y = yScale(peak.normalizedIntensity, index);
        return `<g><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${color}" /><text x="${x.toFixed(1)}" y="${(y - 10).toFixed(1)}" font-size="12" text-anchor="middle" fill="#1f2937">${peak.position}</text></g>`;
      })
    )
    .join("");
  const referenceMarkers = referenceLines
    .map((peak) => {
      const x = xScale(peak.position);
      return `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${margin.top}" y2="${height - margin.bottom}" stroke="#64748b" stroke-width="1.2" stroke-dasharray="5 5"><title>${escapeSvgText(peak.label)}</title></line>`;
    })
    .join("");
  const legend = series
    .map((item, index) => {
      const y = 28 + index * 22;
      const color = spectroscopyColors[index % spectroscopyColors.length];
      return `<g><line x1="${width - 260}" x2="${width - 226}" y1="${y}" y2="${y}" stroke="${color}" stroke-width="3" /><text x="${width - 218}" y="${y + 4}" font-size="13" fill="#334155">${escapeSvgText(item.label)}</text></g>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Publication-ready ${axis.title} comparison figure" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff" />
  <text x="${margin.left}" y="31" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#0f172a">${axis.title} comparison · ${safeExpectedMaterial}</text>
  <text x="${margin.left}" y="52" font-family="Arial, sans-serif" font-size="12" fill="#64748b">Normalized intensity, advisory reference markers, vector export artifact</text>
  <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="#0f172a" stroke-width="1.4" />
  <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" stroke="#0f172a" stroke-width="1.4" />
  <text x="${width / 2}" y="${height - 22}" font-family="Arial, sans-serif" font-size="15" text-anchor="middle" fill="#0f172a">${axis.x} (${axis.unit})</text>
  <text transform="translate(24 ${height / 2}) rotate(-90)" font-family="Arial, sans-serif" font-size="15" text-anchor="middle" fill="#0f172a">Normalized intensity (a.u.)</text>
  ${referenceMarkers}
  ${polylines}
  ${peakLabels}
  ${legend}
</svg>`;
}

function makeDataHref(content: string, mimeType: string) {
  return `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`;
}

function analyzeSpectroscopyFiles(mode: SpectroscopyMode, expectedMaterial: string, uploads: SpectroscopyUploadDraft[]): SpectroscopyAnalysisResultDto {
  const warnings: string[] = [];
  const parsed = uploads
    .map((file, index) => {
      const rawPoints = parseSpectroscopyText(file.contentText);
      if (rawPoints.length < 4) {
        warnings.push(`${file.filename}: numeric point가 부족해 figure에서 제외했습니다.`);
        return null;
      }
      const resolvedMode = resolveSpectroscopyMode(mode, rawPoints);
      const smoothed = smoothIntensity(rawPoints);
      const points = normalizePoints(smoothed);
      const id = `series-${index + 1}`;
      const peaks = detectSpectroscopyPeaks(id, points, resolvedMode);
      return { file, rawPoints, points, id, resolvedMode, peaks };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const resolvedMode = parsed[0]?.resolvedMode ?? (mode === "raman" ? "raman" : "xrd");

  const axis = spectroscopyModeLabels[resolvedMode];
  const series: SpectroscopySeriesDto[] = parsed.map((item) => ({
    id: item.id,
    filename: item.file.filename,
    label: item.file.label || item.file.filename.replace(/\.(csv|txt)$/i, ""),
    rawPointCount: item.rawPoints.length,
    processedPointCount: item.points.length,
    xLabel: `${axis.x} (${axis.unit})`,
    yLabel: "Normalized intensity (a.u.)",
    points: item.points,
    peaks: item.peaks,
    preprocessing: ["3-point smoothing", "baseline offset correction", "0–100 normalization", "local maxima peak candidates"]
  }));
  const references = makeReferenceCandidates(expectedMaterial, resolvedMode);
  const comparison = buildComparison(series);
  const svg = buildFigureSvg(series, references, resolvedMode, expectedMaterial);
  const processedCsv = buildProcessedCsv(series);
  const status = series.length === 0 ? "failed" : warnings.length > 0 ? "partial" : "ready";

  return {
    status,
    mode: resolvedMode,
    expectedMaterial,
    series,
    comparison,
    references,
    figure: {
      svg,
      processedCsv,
      raster: {
        filename: "spectroscopy-publication-300ppi.png",
        widthPx: 3600,
        heightPx: 2025,
        dpi: 300,
        note: "PNG export target metadata: 12 × 6.75 inch figure at 300ppi. SVG remains the verifiable vector artifact in this UI slice."
      },
      caption: `${axis.title} spectra for ${series.map((item) => item.label).join(", ")} with normalized intensities and advisory reference markers for ${expectedMaterial || "the expected material"}.`,
      methodNote: "CSV/TXT two-column data were smoothed, baseline-offset corrected, normalized, and annotated with local peak candidates. Reference markers are fallback/template guideposts unless provider provenance says otherwise."
    },
    analysis: {
      title: "Advisory spectroscopy analysis",
      summary:
        series.length > 1
          ? "Uploaded spectra are overlaid for sample-to-sample comparison. Peak shifts and intensity differences are candidate observations that require instrument calibration and manual materials review."
          : "Uploaded spectrum is rendered with peak candidates and advisory reference markers. The output supports review, reporting, and follow-up verification, not definitive phase identification.",
      caveats: [
        "This frontend result does not prove material identity, phase composition, purity, crystallinity, or quantitative phase fraction.",
        "Reference markers are provenance-labeled fallback guideposts unless a backend provider result is attached.",
        "Normalization changes absolute intensity; compare relative trends only."
      ],
      recommendedVerification: [
        "Verify peak positions against calibrated instrument metadata and a trusted reference database.",
        "Review raw and processed CSV values before publication.",
        "Use domain-specific fitting/Rietveld/Raman deconvolution outside this advisory workspace for quantitative claims."
      ],
      provenanceNotes: references.map((reference) => `${reference.provider}: ${reference.provenance}`),
      guardrail: "Advisory/reference-only analysis; no conclusive phase, crystallinity, purity, or identity claim is made."
    },
    warnings
  };
}

export function SurrogatePanel({ data }: SurrogatePanelProps) {
  const [form, setForm] = useState<EstimatorInputs>(initialInputs);
  const [submittedInputs, setSubmittedInputs] = useState<EstimatorInputs>(initialInputs);
  const [canteraState, setCanteraState] = useState<CanteraRunState>("idle");
  const [canteraResult, setCanteraResult] = useState<CanteraRunResponse | null>(null);
  const [canteraMessage, setCanteraMessage] = useState("Cantera solver는 백엔드에서 diamond.yaml을 직접 실행합니다.");
  const [spectroscopyMode, setSpectroscopyMode] = useState<SpectroscopyMode>(data.spectroscopy?.mode ?? "auto");
  const [expectedMaterial, setExpectedMaterial] = useState(data.spectroscopy?.expectedMaterial ?? "diamond carbon");
  const [spectroscopyFiles, setSpectroscopyFiles] = useState<SpectroscopyUploadDraft[]>(
    data.spectroscopy?.sampleFiles ?? defaultSpectroscopyFiles
  );
  const [spectroscopyResult, setSpectroscopyResult] = useState<SpectroscopyAnalysisResultDto>(() =>
    analyzeSpectroscopyFiles(data.spectroscopy?.mode ?? "auto", data.spectroscopy?.expectedMaterial ?? "diamond carbon", data.spectroscopy?.sampleFiles ?? defaultSpectroscopyFiles)
  );
  const result = useMemo(() => estimateGrowthRate(submittedInputs), [submittedInputs]);
  const maxSensitivityGrowth = Math.max(...result.sensitivity.map((point) => point.growthRateUmPerHour), 0.001);
  const maxNitrogenGrowth = Math.max(...result.nitrogenSensitivity.map((point) => point.growthRateUmPerHour), 0.001);
  const canteraStatusTone = canteraState === "ready" ? "success" : canteraState === "loading" ? "xai" : "neutral";
  const canteraGrowthRate = canteraResult?.growthRateUmPerHour ?? null;
  const canteraDelta = canteraGrowthRate === null ? null : Number((canteraGrowthRate - result.growthRateUmPerHour).toFixed(3));
  const svgHref = useMemo(() => makeDataHref(spectroscopyResult.figure.svg, "image/svg+xml"), [spectroscopyResult.figure.svg]);
  const csvHref = useMemo(() => makeDataHref(spectroscopyResult.figure.processedCsv, "text/csv"), [spectroscopyResult.figure.processedCsv]);
  const rasterMetadataHref = useMemo(
    () => makeDataHref(JSON.stringify(spectroscopyResult.figure.raster, null, 2), "application/json"),
    [spectroscopyResult.figure.raster]
  );

  function updateInput(key: InputKey) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const value = Number.parseFloat(event.target.value);
      setForm((current) => ({ ...current, [key]: Number.isFinite(value) ? value : 0 }));
    };
  }

  function handlePredict() {
    setSubmittedInputs(form);
  }

  async function handleRunCantera() {
    setSubmittedInputs(form);
    setCanteraState("loading");
    setCanteraMessage("Cantera diamond.yaml 실행 중입니다.");

    try {
      const response = await apiClient<CanteraRunResponse>("/api/surrogate/cantera/run", {
        method: "POST",
        body: JSON.stringify(form)
      });
      setCanteraResult(response);
      setCanteraState(response.status);
      setCanteraMessage(response.message);
    } catch (error) {
      setCanteraResult(null);
      setCanteraState("failed");
      setCanteraMessage(error instanceof Error ? error.message : "Cantera 실행 요청에 실패했습니다.");
    }
  }

  async function handleSpectroscopyUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter((file) => /\.(csv|txt)$/i.test(file.name));
    const loadedFiles = await Promise.all(
      files.map(async (file) => ({
        filename: file.name,
        label: file.name.replace(/\.(csv|txt)$/i, ""),
        contentText: await file.text(),
        sizeBytes: file.size
      }))
    );

    if (loadedFiles.length > 0) {
      setSpectroscopyFiles(loadedFiles);
    }
  }

  function handleAnalyzeSpectroscopy() {
    setSpectroscopyResult(analyzeSpectroscopyFiles(spectroscopyMode, expectedMaterial, spectroscopyFiles));
  }

  return (
    <div className="space-y-6">
      <SurfaceCard tone="contrast" className="rounded-panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <StatusBadge tone="xai">3. Surrogate · 공사중</StatusBadge>
            <h3 className="mt-4 text-3xl font-semibold text-ink">대리 모델 워크벤치 준비 중</h3>
            <p className="mt-3 text-sm leading-6 text-soft">
              Cantera diamond CVD 흐름을 참고해 H radical과 CH₄/H₂/N₂ 유량이 성장속도에 주는 영향을 먼저 screening합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="success">surface kinetics estimator</StatusBadge>
            <StatusBadge tone="neutral">{data.status}</StatusBadge>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard className="rounded-panel p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-xs uppercase tracking-[0.28em] text-faint">XRD/Raman spectroscopy workspace</div>
            <h4 className="mt-2 text-2xl font-semibold text-ink">Publication-ready spectra comparison</h4>
            <p className="mt-3 text-sm leading-6 text-soft">
              CSV/TXT 2-column raw data를 업로드하고 expected material을 입력하면 SVG-first figure, multi-file 비교, advisory analysis, export artifact를 생성합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={spectroscopyResult.status === "ready" ? "success" : "neutral"}>{spectroscopyResult.status}</StatusBadge>
            <StatusBadge tone="xai">{spectroscopyModeLabels[spectroscopyResult.mode].title}</StatusBadge>
            <StatusBadge tone="neutral">advisory only</StatusBadge>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[0.75fr_1.25fr]">
          <div className="space-y-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs uppercase tracking-[0.18em] text-faint">Mode selector</span>
              <select
                value={spectroscopyMode}
                onChange={(event) => setSpectroscopyMode(event.target.value as SpectroscopyMode)}
                className="rounded-xl border border-line bg-surface-muted px-3 py-2.5 text-sm text-ink"
                aria-label="XRD/Raman mode selector"
              >
                <option value="auto">Auto detect</option>
                <option value="xrd">XRD · 2θ/intensity</option>
                <option value="raman">Raman · shift/intensity</option>
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs uppercase tracking-[0.18em] text-faint">Expected material / formula</span>
              <input
                value={expectedMaterial}
                onChange={(event) => setExpectedMaterial(event.target.value)}
                placeholder="예: diamond carbon, Si, TiO2"
                className="rounded-xl border border-line bg-surface-muted px-3 py-2.5 text-sm text-ink"
              />
              <span className="text-xs text-faint">General material reference lookup query; fallback markers remain provenance-labeled.</span>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs uppercase tracking-[0.18em] text-faint">CSV/TXT file upload</span>
              <input
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                multiple
                onChange={handleSpectroscopyUpload}
                className="rounded-xl border border-dashed border-line bg-white/70 px-3 py-3 text-sm text-soft file:mr-3 file:rounded-full file:border-0 file:bg-xai file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
              />
              <span className="text-xs text-faint">MVP path: two numeric columns, headers/comments ignored. Demo files are preloaded for smoke coverage.</span>
            </label>

            <div className="rounded-[1.25rem] border border-line bg-white/70 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-faint">Selected files</div>
              <div className="mt-3 space-y-2">
                {spectroscopyFiles.map((file) => (
                  <div key={`${file.filename}-${file.sizeBytes ?? "demo"}`} className="flex items-center justify-between gap-3 rounded-xl bg-surface-muted px-3 py-2 text-sm">
                    <span className="font-medium text-ink">{file.label || file.filename}</span>
                    <span className="text-xs text-faint">{file.filename}</span>
                  </div>
                ))}
              </div>
            </div>

            <ActionButton type="button" tone="xai" onClick={handleAnalyzeSpectroscopy}>
              Analyze spectroscopy files
            </ActionButton>
          </div>

          <div className="space-y-4">
            <div className="overflow-hidden rounded-[1.25rem] border border-line bg-white p-3">
              <div className="sr-only">Figure/comparison area</div>
              <div dangerouslySetInnerHTML={{ __html: spectroscopyResult.figure.svg }} />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <SurfaceCard tone="muted" className="p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-faint">Samples</div>
                <div className="mt-2 text-3xl font-semibold text-ink">{spectroscopyResult.series.length}</div>
                <div className="mt-1 text-sm text-soft">{spectroscopyResult.comparison.renderMode} comparison</div>
              </SurfaceCard>
              <SurfaceCard tone="muted" className="p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-faint">Peak candidates</div>
                <div className="mt-2 text-3xl font-semibold text-ink">{spectroscopyResult.series.reduce((sum, item) => sum + item.peaks.length, 0)}</div>
                <div className="mt-1 text-sm text-soft">annotatable markers</div>
              </SurfaceCard>
              <SurfaceCard tone="muted" className="p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-faint">Raster target</div>
                <div className="mt-2 text-3xl font-semibold text-ink">{spectroscopyResult.figure.raster.dpi}</div>
                <div className="mt-1 text-sm text-soft">ppi metadata</div>
              </SurfaceCard>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          <SurfaceCard tone="muted" className="p-4">
            <div className="text-xs uppercase tracking-[0.22em] text-faint">Multi-file comparison result</div>
            <div className="mt-2 text-base font-semibold text-ink">{spectroscopyResult.comparison.headline}</div>
            <div className="mt-3 space-y-2">
              {spectroscopyResult.comparison.observations.map((observation) => (
                <p key={observation} className="text-sm leading-6 text-soft">{observation}</p>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard tone="muted" className="p-4">
            <div className="text-xs uppercase tracking-[0.22em] text-faint">Reference notes</div>
            <div className="mt-3 space-y-3">
              {spectroscopyResult.references.map((reference) => (
                <div key={reference.id} className="rounded-xl border border-line bg-white/70 px-3 py-3">
                  <div className="text-sm font-semibold text-ink">{reference.material} · {reference.provider}</div>
                  <div className="mt-1 text-xs leading-5 text-soft">{reference.caveat}</div>
                  <div className="mt-2 text-xs text-faint">{reference.source}</div>
                </div>
              ))}
              {spectroscopyResult.warnings.map((warning) => (
                <div key={warning} className="rounded-xl border border-line bg-white/70 px-3 py-2 text-xs leading-5 text-soft">{warning}</div>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard tone="muted" className="p-4">
            <div className="text-xs uppercase tracking-[0.22em] text-faint">Advisory analysis display</div>
            <div className="mt-2 text-base font-semibold text-ink">{spectroscopyResult.analysis.title}</div>
            <p className="mt-3 text-sm leading-6 text-soft">{spectroscopyResult.analysis.summary}</p>
            <div className="mt-3 space-y-2">
              {spectroscopyResult.analysis.caveats.slice(0, 2).map((caveat) => (
                <div key={caveat} className="rounded-xl border border-line bg-white/70 px-3 py-2 text-xs leading-5 text-soft">
                  Caveat · {caveat}
                </div>
              ))}
              {spectroscopyResult.analysis.recommendedVerification.slice(0, 1).map((verification) => (
                <div key={verification} className="rounded-xl border border-line bg-white/70 px-3 py-2 text-xs leading-5 text-soft">
                  Manual verification · {verification}
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-xl border border-line bg-white/70 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-xai">
              {spectroscopyResult.analysis.guardrail}
            </div>
          </SurfaceCard>
        </div>

        <div className="mt-6 rounded-[1.25rem] border border-line bg-white/70 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-faint">Export controls / artifact generation</div>
              <div className="mt-1 text-sm leading-6 text-soft">{spectroscopyResult.figure.caption}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <a className="inline-flex items-center justify-center rounded-full border border-xai/18 bg-xai/10 px-4 py-2 text-sm font-medium text-xai" download="spectroscopy-publication.svg" href={svgHref}>
                Export SVG vector
              </a>
              <a className="inline-flex items-center justify-center rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-ink" download="spectroscopy-processed.csv" href={csvHref}>
                Export processed CSV
              </a>
              <a className="inline-flex items-center justify-center rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-ink" download="spectroscopy-300ppi-raster-metadata.json" href={rasterMetadataHref}>
                Export 300ppi raster metadata
              </a>
            </div>
          </div>
          <pre className="mt-4 max-h-40 overflow-auto rounded-xl bg-surface-muted p-3 text-xs leading-5 text-soft" aria-label="Actual SVG/vector export artifact content">
            {spectroscopyResult.figure.svg}
          </pre>
        </div>
      </SurfaceCard>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <SurfaceCard className="rounded-panel p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-faint">Growth rate prediction</div>
              <div className="mt-1 text-xl font-semibold text-ink">표면 반응 기반 입력</div>
            </div>
            <StatusBadge tone="xai">Harris–Goodwin inspired</StatusBadge>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {inputFields.map((field) => (
              <label key={field.key} className="flex flex-col gap-1.5">
                <span className="text-xs uppercase tracking-[0.18em] text-faint">{field.label}</span>
                <input
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={form[field.key]}
                  onChange={updateInput(field.key)}
                  className="rounded-xl border border-line bg-surface-muted px-3 py-2.5 text-sm text-ink"
                />
                <span className="text-xs text-faint">{field.helper}</span>
              </label>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <ActionButton type="button" tone="xai" onClick={handlePredict}>
              성장 속도 예측
            </ActionButton>
            <ActionButton type="button" tone="neutral" variant="subtle" onClick={handleRunCantera} disabled={canteraState === "loading"}>
              {canteraState === "loading" ? "Cantera 실행 중..." : "Cantera diamond.yaml 실행"}
            </ActionButton>
            <span className="text-sm text-soft">sccm 입력은 CH₄/H₂와 N₂/CH₄ 비율로 환산되고, Cantera에는 gas composition으로 전달됩니다.</span>
          </div>
        </SurfaceCard>

        <SurfaceCard className="rounded-panel p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-faint">Prediction result</div>
              <div className="mt-1 text-xl font-semibold text-ink">Predicted growth rate</div>
            </div>
            <StatusBadge tone={result.confidence === "high" ? "success" : "neutral"}>{result.confidence} confidence</StatusBadge>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            <SurfaceCard tone="muted" className="p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-faint">Growth rate</div>
              <div className="mt-2 text-3xl font-semibold text-ink">{result.growthRateUmPerHour}</div>
              <div className="mt-1 text-sm text-soft">μm/h</div>
            </SurfaceCard>
            <SurfaceCard tone="muted" className="p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-faint">Surface coverage</div>
              <div className="mt-2 text-3xl font-semibold text-ink">{result.surfaceCoverage}</div>
              <div className="mt-1 text-sm text-soft">proxy 0–1</div>
            </SurfaceCard>
            <SurfaceCard tone="muted" className="p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-faint">CH₄/H₂</div>
              <div className="mt-2 text-3xl font-semibold text-ink">{result.ch4RatioPercent}%</div>
              <div className="mt-1 text-sm text-soft">{result.totalFlowSccm} sccm · index {result.carbonSupplyIndex}</div>
            </SurfaceCard>
            <SurfaceCard tone="muted" className="p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-faint">H activation</div>
              <div className="mt-2 text-3xl font-semibold text-ink">{result.hydrogenActivationIndex}</div>
              <div className="mt-1 text-sm text-soft">near-surface H</div>
            </SurfaceCard>
            <SurfaceCard tone="muted" className="p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-faint">Nitrogen boost</div>
              <div className="mt-2 text-3xl font-semibold text-ink">{result.nitrogenGrowthBoost}×</div>
              <div className="mt-1 text-sm text-soft">{result.nitrogenRatioPpm} ppm</div>
            </SurfaceCard>
            <SurfaceCard tone="muted" className="p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-faint">Quality risk</div>
              <div className="mt-2 text-3xl font-semibold text-ink">{result.qualityRiskIndex}</div>
              <div className="mt-1 text-sm text-soft">defect proxy</div>
            </SurfaceCard>
          </div>

          <div className="mt-5 space-y-2">
            <div className="text-xs uppercase tracking-[0.22em] text-faint">Risk notes</div>
            {result.riskNotes.map((note) => (
              <SurfaceCard key={note} tone="muted" className="px-4 py-3 text-sm leading-6 text-soft">
                {note}
              </SurfaceCard>
            ))}
          </div>
        </SurfaceCard>
      </div>

      <SurfaceCard className="rounded-panel p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-faint">Cantera solver result</div>
            <div className="mt-1 text-xl font-semibold text-ink">Cantera diamond.yaml run</div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-soft">{canteraMessage}</p>
          </div>
          <StatusBadge tone={canteraStatusTone}>{canteraState === "idle" ? "not run" : canteraState}</StatusBadge>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SurfaceCard tone="muted" className="p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-faint">Solver growth rate</div>
            <div className="mt-2 text-3xl font-semibold text-ink">{canteraGrowthRate === null ? "—" : canteraGrowthRate}</div>
            <div className="mt-1 text-sm text-soft">μm/h</div>
          </SurfaceCard>
          <SurfaceCard tone="muted" className="p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-faint">Proxy delta</div>
            <div className="mt-2 text-3xl font-semibold text-ink">{canteraDelta === null ? "—" : `${canteraDelta >= 0 ? "+" : ""}${canteraDelta}`}</div>
            <div className="mt-1 text-sm text-soft">solver − proxy μm/h</div>
          </SurfaceCard>
          <SurfaceCard tone="muted" className="p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-faint">Mechanism source</div>
            <div className="mt-2 text-lg font-semibold text-ink">{canteraResult?.mechanismSource ?? "—"}</div>
            <div className="mt-1 text-sm text-soft">{canteraResult?.canteraVersion ? `Cantera ${canteraResult.canteraVersion}` : "backend solver"}</div>
          </SurfaceCard>
          <SurfaceCard tone="muted" className="p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-faint">Nitrogen applied</div>
            <div className="mt-2 text-lg font-semibold text-ink">{canteraResult ? (canteraResult.nitrogenApplied ? "yes" : "no") : "—"}</div>
            <div className="mt-1 text-sm text-soft">current diamond.yaml species</div>
          </SurfaceCard>
        </div>

        {canteraResult ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
            <SurfaceCard tone="muted" className="p-4">
              <div className="text-xs uppercase tracking-[0.22em] text-faint">Run metadata</div>
              <div className="mt-3 grid gap-2 text-sm text-soft">
                <div>gas phase: <span className="font-semibold text-ink">{canteraResult.gasPhase ?? "—"}</span></div>
                <div>surface phase: <span className="font-semibold text-ink">{canteraResult.surfacePhase ?? "—"}</span></div>
                <div className="break-all">mechanism: <span className="font-semibold text-ink">{canteraResult.mechanism ?? "—"}</span></div>
              </div>
            </SurfaceCard>

            <SurfaceCard tone="muted" className="p-4">
              <div className="text-xs uppercase tracking-[0.22em] text-faint">Top surface coverages</div>
              <div className="mt-3 grid gap-2">
                {canteraResult.surfaceCoverages.length > 0 ? (
                  canteraResult.surfaceCoverages.map((coverage) => (
                    <div key={coverage.species} className="grid grid-cols-[5rem_1fr_4rem] items-center gap-3">
                      <div className="text-xs font-semibold text-ink">{coverage.species}</div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/80">
                        <div className="h-full rounded-full bg-xai" style={{ width: `${clamp(coverage.coverage * 100, 3, 100)}%` }} />
                      </div>
                      <div className="text-right text-xs tabular-nums text-soft">{coverage.coverage}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-soft">surface coverage 결과가 없습니다.</div>
                )}
              </div>
            </SurfaceCard>
          </div>
        ) : null}

        <div className="mt-5 grid gap-2">
          {(canteraResult?.notes.length ? canteraResult.notes : ["Cantera가 unavailable/failed여도 proxy 결과는 계속 표시됩니다."]).map((note, index) => (
            <div key={`${note}-${index}`} className="rounded-xl border border-line bg-white/70 px-4 py-3 text-sm leading-6 text-soft">
              {note}
            </div>
          ))}
        </div>
      </SurfaceCard>

      <SurfaceCard className="rounded-panel p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-faint">H mole fraction sensitivity</div>
            <div className="mt-1 text-xl font-semibold text-ink">surface H 농도에 따른 성장속도 곡선</div>
          </div>
          <StatusBadge tone="xai">rate sweep</StatusBadge>
        </div>
        <div className="mt-5 grid gap-3 rounded-[1.25rem] border border-line bg-white/70 p-4">
          {result.sensitivity.map((point) => (
            <div key={point.hMoleFraction} className="grid grid-cols-[7rem_1fr_4.5rem] items-center gap-3">
              <div className="text-xs tabular-nums text-faint">{point.hMoleFraction.toExponential(1)}</div>
              <div className="h-2.5 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full bg-xai"
                  style={{ width: `${clamp((point.growthRateUmPerHour / maxSensitivityGrowth) * 100, 4, 100)}%` }}
                />
              </div>
              <div className="text-right text-xs font-semibold tabular-nums text-ink">{point.growthRateUmPerHour} μm/h</div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-sm leading-6 text-soft">
          이미지의 Cantera 예제처럼 H mole fraction sweep을 통해 성장속도 경향을 먼저 확인합니다.
        </div>
      </SurfaceCard>

      <SurfaceCard className="rounded-panel p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-faint">N₂ ratio sensitivity</div>
            <div className="mt-1 text-xl font-semibold text-ink">질소비율에 따른 성장속도와 품질 리스크</div>
          </div>
          <StatusBadge tone="success">nitrogen sweep</StatusBadge>
        </div>
        <div className="mt-5 grid gap-3 rounded-[1.25rem] border border-line bg-white/70 p-4">
          {result.nitrogenSensitivity.map((point) => (
            <div key={point.nitrogenRatioPpm} className="grid grid-cols-[5.5rem_1fr_4.5rem_4rem] items-center gap-3">
              <div className="text-xs tabular-nums text-faint">{point.nitrogenRatioPpm} ppm</div>
              <div className="h-2.5 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full bg-success"
                  style={{ width: `${clamp((point.growthRateUmPerHour / maxNitrogenGrowth) * 100, 4, 100)}%` }}
                />
              </div>
              <div className="text-right text-xs font-semibold tabular-nums text-ink">{point.growthRateUmPerHour} μm/h</div>
              <div className="text-right text-xs tabular-nums text-soft">risk {point.qualityRiskIndex}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-sm leading-6 text-soft">
          질소는 성장속도 증가 방향으로 반영하되, 높은 N₂/CH₄에서는 defect와 morphology 리스크도 함께 올립니다.
        </div>
      </SurfaceCard>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <SurfaceCard className="rounded-panel p-6">
          <div className="text-xs uppercase tracking-[0.28em] text-faint">Build target</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <SurfaceCard tone="muted" className="px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-faint">모델</div>
              <div className="mt-1 text-sm font-semibold text-ink">{data.surrogateName}</div>
            </SurfaceCard>
            {data.predictions.slice(0, 2).map((prediction) => (
              <SurfaceCard key={prediction.label} tone="muted" className="px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-faint">{prediction.label}</div>
                <div className="mt-1 text-sm font-semibold text-ink">{prediction.value}</div>
              </SurfaceCard>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard className="rounded-panel p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-faint">Roadmap</div>
              <div className="mt-1 text-base font-semibold text-ink">어떤 식으로 발전할지</div>
            </div>
            <StatusBadge tone="xai">prototype</StatusBadge>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {roadmap.map((item, index) => (
              <SurfaceCard key={item.label} tone="muted" className="px-4 py-4">
                <div className="text-xs font-semibold text-xai">0{index + 1}</div>
                <div className="mt-2 text-base font-semibold text-ink">{item.label}</div>
                <p className="mt-2 text-sm leading-6 text-soft">{item.detail}</p>
              </SurfaceCard>
            ))}
          </div>
          <div className="mt-4 grid gap-2">
            {data.features.map((feature) => (
              <div key={feature} className="rounded-xl border border-line bg-white/70 px-4 py-3 text-sm leading-6 text-soft">
                {feature}
              </div>
            ))}
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
}
