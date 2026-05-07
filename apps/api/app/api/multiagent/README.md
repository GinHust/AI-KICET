# multiagent — Multi-Agent AI 토론 파이프라인

## 역할

연구 질문 하나를 여러 전문가 에이전트에게 분배하여 **SSE 스트리밍**으로 토론 결과를 생성하는 모듈.
가설 생성 → 에이전트 검증 → 다중 라운드 토론 → LLM 종합의 전 과정을 담당한다.

---

## 파일 구성

| 파일 | 역할 |
|------|------|
| `discussions.py` | FastAPI 라우터. SSE 스트리밍 엔드포인트 및 CRUD 정의 |
| `graph.py` | FastAPI 라우터. 프로젝트 지식 그래프 조회 |
| `service.py` | `DiscussionService` — 토론 전체 오케스트레이션 (핵심 진입점) |
| `engine.py` | `DiscussionEngine` — LLM 없이 동작하는 fallback 토론 빌더 |
| `llm.py` | `DiscussionLLM` — Anthropic/OpenAI API 호출 + 모든 프롬프트 템플릿 |
| `embedding_store.py` | `EmbeddingStore` — 키워드 기반 chunk 랭킹 (벡터 DB 없이 동작) |

---

## 주요 API 엔드포인트

```
POST /api/projects/{project_id}/discussions/stream   ← 메인 토론 스트리밍
POST /api/projects/{project_id}/hypothesis-exploration/stream
GET  /api/projects/{project_id}/discussions
GET  /api/projects/{project_id}/graph
POST /api/discussions/clarify
```

---

## 데이터 흐름

```
POST /projects/{id}/discussions/stream
  └─ service.stream_discussion()
       ├─ 에이전트 선택     ← llm.select_agents() 또는 scoring fallback
       ├─ 가설 생성         ← llm.generate_hypothesis_candidates()
       ├─ 가설 검증         ← llm.validate_hypothesis_candidate() × 에이전트 수
       ├─ 가설 랭킹         ← llm.rank_hypothesis_candidates()
       ├─ 토론 라운드       ← llm.compose_round_message() 또는 engine fallback
       ├─ 모더레이터 패킷   ← llm.build_moderator_packet() (2라운드~)
       └─ 종합              ← llm.synthesize_discussion()

SSE 이벤트 순서:
  status → agents → hypotheses → validation × N → hypothesis_ranking
  → hypothesis_selected → round_start → message × N → done
```

---

## 의존성

### 읽기 전용 (수정 금지 — 공유 인프라)
- `app/repositories/project_repository.py` — project, agents, chunks, entities, relationships, discussions 조회
- `app/repositories/discussion_knowledge_repository.py` — JSON 시드 파일 로드
- `app/models/domain.py` — Pydantic 모델
- `app/config.py` — LLM provider, API key, 경로 설정

### 데이터 소스
- SQLite: `data/kicetic/projects.db` (agents 20개, chunks 6000개)
- JSON 시드: `data/discussion_knowledge/` (서버 최초 기동 시 DB로 bootstrap)

---

## 이 폴더에서만 작업할 내용

- 에이전트 토론 로직 개선 → `engine.py`, `service.py`
- 프롬프트 수정 → `llm.py` (AGENT_SYSTEM_TEMPLATE, MODERATOR_PROMPT 등)
- 새 API 엔드포인트 추가 → `discussions.py`
- chunk 랭킹 알고리즘 개선 → `embedding_store.py`

## 수정하면 안 되는 것

- `repositories/` 폴더 — project, bo 담당자와 조율 필요
- `models/domain.py` — 전체 API 계약 변경, 조율 필요
