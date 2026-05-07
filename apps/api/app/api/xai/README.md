# xai — Explainable AI 요약 레이어

## 역할

동일한 분석 결과를 **연구자 / 팀리드 / 경영진** 세 관점으로 변환해 전달하는 모듈.
각 청중에게 필요한 정보 밀도와 언어 수준이 다르므로, 같은 데이터에서 다른 요약을 생성한다.

---

## 파일 구성

| 파일 | 역할 |
|------|------|
| `xai.py` | FastAPI 라우터. GET/POST /xai/summary |

---

## 주요 API 엔드포인트

```
GET  /api/xai/summary                   — 현재 프로젝트 기본 XAI 요약 반환
POST /api/xai/summary  { audience, ... } — 특정 청중 관점의 요약 생성
```

### audience 값
| 값 | 대상 | 초점 |
|----|------|------|
| `researcher` | 연구자 | 메커니즘 근거, 다음 측정 항목 |
| `teamLead` | 팀리드 | 실행 위험, 모듈별 진행 현황 |
| `executive` | 경영진 | 성과 수치, 투자 대비 진행도 |

---

## 현재 상태

`config.xai_backend = "mock"` — 하드코딩된 MPCVD 요약을 반환한다.

실제 XAI 연결 시 `xai.py` 내 mock 데이터를 BO Optuna 결과 + multiagent 토론 결과를 읽어 동적 생성하는 로직으로 교체한다.

---

## 이 폴더에서만 작업할 내용

- 청중별 요약 로직 개선 → `xai.py` 내 `create_xai_summary()` 수정
- 실제 데이터 연결 → Optuna study 또는 최근 Discussion을 읽어 요약 생성
- 새 audience 타입 추가 → `audience_headlines` dict 확장

## 의존성

- `app/config.py` — `xai_backend` 설정
- `app/models/domain.py` — `XAISummary`, `XAISummaryRequest` 모델
