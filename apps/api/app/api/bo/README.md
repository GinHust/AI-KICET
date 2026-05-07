# bo — Bayesian Optimization (Optuna)

## 역할

Optuna TPE 샘플러를 이용해 MPCVD 다이아몬드 성장 공정 파라미터를 최적화하는 모듈.
트라이얼 기록, 베스트 파라미터 추천, 중요도 분석을 제공한다.

---

## 파일 구성

| 파일 | 역할 |
|------|------|
| `optimizer.py` | 모든 BO 로직. Optuna study 관리 + 전체 엔드포인트 정의 |

---

## 주요 API 엔드포인트

```
GET  /api/optimizer/stats       — 전체 트라이얼 통계 (총 횟수, 베스트 성장 속도, 기판별 카운트)
GET  /api/optimizer/trials      — 완료된 트라이얼 목록 (?substrate=4H SiC 필터 가능)
GET  /api/optimizer/history     — 트라이얼 번호별 베스트 성장 속도 이력
GET  /api/optimizer/best        — 최고 성장 속도 트라이얼 상세
GET  /api/optimizer/recommend   — TPE 샘플러 기반 다음 실험 파라미터 추천
POST /api/optimizer/submit      — 실험 결과(파라미터 + growth_rate) 기록
GET  /api/optimizer/importance  — Optuna 파라미터 중요도 분석
```

---

## 파라미터 공간

| 파라미터 | 타입 | 범위 |
|----------|------|------|
| substrate | categorical | "4H SiC", "Diamond" |
| power | float | 0.6 – 5.0 kW |
| pressure | float | 0 – 200 Torr |
| h_flow | float | 0 – 1000 sccm |
| ch4_flow | float | 0 – 100 sccm |
| ch4_ratio | float | 0 – 20 % |

최적화 목표: **growth_rate (μm/h) 최대화**

---

## 데이터 저장소

| 환경 | 저장소 |
|------|--------|
| 로컬 개발 | `data/mpcvd_study_v2.db` (SQLite, Optuna 형식) |
| 클라우드 (Cloud Run) | `DATABASE_URL` 환경변수 → PostgreSQL (Supabase) |

`config.optuna_storage` 프로퍼티가 환경에 따라 자동 선택한다.

---

## 이 폴더에서만 작업할 내용

- 파라미터 공간 변경 → `DISTRIBUTIONS` dict 수정
- 새 최적화 목표 추가 → `_load_study()` direction 변경
- 새 엔드포인트 추가 → `optimizer.py` 하단에 라우터 함수 추가
- Optuna 샘플러 교체 → `_load_study()` 내 `TPESampler` 교체

## 의존성

- `app/config.py` — `optuna_storage`, `mpcvd_study_name` 설정
- `app/models/domain.py` — `MpcvdTrialOut`, `MpcvdRecommendation` 등 모델
- Optuna 라이브러리 (requirements에 포함)
