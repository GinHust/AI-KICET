# api — FastAPI 라우터 레이어

## 폴더 구조

```
api/
  multiagent/     ← Multi-Agent 토론 파이프라인 (담당자: multiagent 학생)
  bo/             ← Bayesian Optimization / Optuna (담당자: BO 학생)
  xai/            ← Explainable AI 요약 레이어 (담당자: XAI 학생)
  projects.py     ← 프로젝트 목록/상세 조회 (공유 인프라)
```

각 폴더 안의 `README.md` 에 해당 모듈 상세 설명이 있다.

---

## 담당자별 작업 범위

| 모듈 | 작업 폴더 | 절대 건드리면 안 되는 것 |
|------|-----------|--------------------------|
| Multiagent | `api/multiagent/` | `repositories/`, `models/domain.py` |
| BO | `api/bo/` | `repositories/`, `models/domain.py` |
| XAI | `api/xai/` | `repositories/`, `models/domain.py` |

---

## 공유 파일 (변경 시 전체 조율 필요)

| 파일 | 영향 범위 |
|------|-----------|
| `projects.py` | 모든 모듈이 참조하는 프로젝트 API |
| `../repositories/` | 모든 모듈의 DB 읽기/쓰기 |
| `../models/domain.py` | 모든 모듈의 request/response 타입 |
| `../config.py` | 전체 설정 (LLM key, 경로, backend 모드) |

---

## main.py 라우터 등록 구조

```python
app.include_router(projects_router)         # /api/projects
app.include_router(discussions_router)      # /api/discussions
app.include_router(project_discussions_router)  # /api/projects/{id}/discussions
app.include_router(graph_router)            # /api/projects/{id}/graph
app.include_router(optimizer_router)        # /api/optimizer
app.include_router(xai_router)             # /api/xai
```
