from datetime import datetime, timezone

from fastapi import APIRouter

from app.config import settings
from app.models.domain import XAISummary, XAISummaryRequest

router = APIRouter(prefix="/xai", tags=["xai"])


@router.get("/summary", response_model=XAISummary)
def get_xai_summary() -> XAISummary:
    now = datetime.now(timezone.utc)
    return XAISummary(
        summary_id="xai-aln-001",
        project_id="proj-ai-research-001",
        module_mode=settings.xai_backend,
        headline="MPCVD 성장 속도 향상은 전력-CH₄ 비율 교호작용 제어에 달려 있으며, 압력 120~140 Torr 구간 집중 탐색이 최단 경로다.",
        researcher_view="BO feature importance 분석에서 전력과 CH₄/H₂ 비율의 교호작용이 성장 속도 분산의 43%를 설명한다. 다음 실험은 CH₄ 4~5% × 전력 3.5~4.5 kW 구간에서 Raman FWHM을 필수 병행 측정해야 성장 속도-결정 품질 트레이드오프를 정확히 매핑할 수 있다.",
        team_lead_view="현재 파이프라인은 4H-SiC와 Diamond 기판을 동시 트래킹 중이다. 공정 창이 기판별로 다르므로 BO 결과를 교차 적용하지 않도록 스터디를 분리 운영하고, 다음 5회 트라이얼 이후 기판별 최적 조건 비교 리뷰를 일정에 포함하길 권장한다.",
        executive_view="51회 AI 기반 최적화 실험으로 성장 속도 8.2% 향상을 달성했다. 디지털 트윈 실장비 연동이 완성되면 실험 사이클을 추가 50% 단축할 수 있으며, 이는 연구 기간 단축과 직결된다. 현 단계는 추가 대규모 투자 없이 공정 창 정밀화를 진행할 수 있는 저위험 구간이다.",
        recommended_actions=[
            "CH₄ 4~6% × 전력 3.5~4.5 kW 격자 실험 5회 설계 및 Raman FWHM 필수 측정.",
            "Raman 캘리브레이션 완료 후 Trial B-52 실행 큐 트리거.",
        ],
        supporting_signals=[
            "Surrogate 모델이 전력 4.0~4.5 kW × 압력 125~140 Torr 릿지에서 성장 속도 최고점(19.2 μm/h) 예측.",
            "Digital twin이 CH₄/H₂ 6.5% 초과 구간에서 플라즈마 불안정 패턴 사전 감지.",
        ],
        generated_at=now,
    )


@router.post("/summary", response_model=XAISummary)
def create_xai_summary(payload: XAISummaryRequest) -> XAISummary:
    now = datetime.now(timezone.utc)
    audience_headlines = {
        "researcher": "Research view highlights mechanism confidence and next measurements.",
        "teamLead": "Team lead view emphasizes execution risk, cadence, and module independence.",
        "executive": "Executive view compresses the result into a proceed-with-guardrails decision.",
    }
    return XAISummary(
        summary_id="xai-live-002",
        project_id=payload.project_id,
        module_mode=settings.xai_backend,
        headline=audience_headlines[payload.audience],
        researcher_view="전력-CH₄ 교호작용 집중 탐색이 성장 속도-결정 품질 동시 최적화의 가장 빠른 경로다. Raman FWHM을 모든 트라이얼에 필수 지표로 추가해야 트레이드오프를 정확히 매핑할 수 있다.",
        team_lead_view="4H-SiC와 Diamond 기판 스터디를 분리 운영하고, 다음 5회 이후 기판별 최적 조건 비교 리뷰를 일정에 포함한다. 모듈 계약 구조는 현행 유지.",
        executive_view="51회 최적화로 성장 속도 8.2% 향상. 디지털 트윈 실장비 연동 완성 시 사이클 추가 50% 단축 가능. 현재는 저위험 공정 창 정밀화 단계다.",
        recommended_actions=[
            "CH₄ 4~6% × 전력 3.5~4.5 kW 격자 실험 5회 설계.",
            "Raman 캘리브레이션 후 Trial B-52 실행 큐 트리거.",
        ],
        supporting_signals=[
            f"청중 관점: {payload.audience} — 동일 데이터를 다층 요약으로 변환.",
            "Surrogate 릿지 예측과 BO 추천 조건이 압력 125~140 Torr 구간에서 일치.",
        ],
        generated_at=now,
    )
