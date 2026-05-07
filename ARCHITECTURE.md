# KICETIC Architecture

AI-native 연구 가속 플랫폼. 멀티에이전트 토론 → Bayesian Optimization → Surrogate 시뮬레이션 → Physical AI 트윈 → Explainable AI 의사결정을 단일 인터페이스로 연결한다.

---

## 1. 전체 구성

```
브라우저
  └─ Next.js 14 (Vercel)            ← 프론트엔드
        │  NEXT_PUBLIC_KICETIC_API_BASE_URL
        ▼
  FastAPI 0.115 (Google Cloud Run)  ← 백엔드 API
        │
        ├─ SQLite (로컬) / Supabase PostgreSQL (클라우드)  ← 프로젝트·토론 DB
        ├─ JSON 파일 (discussion_knowledge/)               ← 지식 시드 데이터
        └─ Optuna RDB (SQLite 로컬 / Supabase PostgreSQL)  ← BO 실험 이력
```

---

## 2. 백엔드 (apps/api)

### 실행

```bash
# 로컬
cd apps/api
uvicorn app.main:app --host 127.0.0.1 --port 8004 --reload

# 클라우드 (Cloud Run) — 자동으로 PORT 환경변수 읽음
# 이미지: asia-northeast3-docker.pkg.dev/kicet-rag-platform-v2/kicetic/kicetic-api
```

### 라우터 구조

| prefix | 파일 | 역할 |
|---|---|---|
| `GET /health` | `main.py` | 상태 확인, 모듈 모드 반환 |
| `/api/projects` | `api/projects.py` | 프로젝트 목록/조회 |
| `/api/discussions` | `api/discussions.py` | 멀티에이전트 토론 CRUD + SSE 스트리밍 |
| `/api/graph` | `api/graph.py` | 지식 그래프 노드/엣지 조회 |
| `/api/optimizer` | `api/optimizer.py` | Optuna BO — trials, recommend, submit, importance |
| `/api/xai` | `api/xai.py` | XAI 의사결정 요약 (GET/POST) |

### 모듈 모드 스위치

`config.py`의 `*_backend` 필드로 각 모듈을 `mock` / `real` / `multiagent`로 전환한다.

```python
projects_backend: str = "real"
discussions_backend: str = "real"
optimizer_backend: str = "mock"      # Optuna DB 없으면 mock
xai_backend: str = "mock"
rag_mode: str = "multiagent"         # RAG는 Multiagent 내부 기능
```

환경변수 prefix는 `KICETIC_` (예: `KICETIC_DISCUSSIONS_BACKEND=real`).

### 설정 파일 위치

| 파일 | 역할 |
|---|---|
| `apps/api/.env` | 로컬 전용 — git 미포함 |
| `scripts/cloudrun-env.yaml` | Cloud Run 배포용 환경변수 |

### 주요 환경변수

| 변수 | 설명 |
|---|---|
| `KICETIC_DATABASE_URL` | Supabase PostgreSQL URL (설정 시 SQLite 무시) |
| `KICETIC_MPCVD_STUDY_PATH` | 로컬 Optuna SQLite 경로 |
| `KICETIC_MPCVD_STUDY_NAME` | Optuna study 이름 (`mpcvd_optimization_v2`) |
| `KICETIC_LLM_PROVIDER` | `anthropic` 또는 `openai` |
| `KICETIC_ANTHROPIC_API_KEY` | Anthropic API 키 |
| `KICETIC_OPENAI_API_KEY` | OpenAI API 키 |
| `KICETIC_ANTHROPIC_MODEL` | 기본 `claude-opus-4-7` |
| `KICETIC_OPENAI_MODEL` | 기본 `gpt-5.5` |

---

## 3. 데이터베이스

### 3-1. 프로젝트·토론 DB (SQLite / Supabase)

- **로컬**: `apps/api/app/data/kicetic/projects.db`
- **클라우드**: Supabase PostgreSQL (Session Pooler)
  - Host: `aws-1-ap-northeast-2.pooler.supabase.com:5432`
  - User: `postgres.{project-id}`
  - psycopg2 dialect + `engine_kwargs={'creator': make_conn}` 패턴 사용 (특수문자 패스워드 대응)

테이블: `projects`, `documents`, `chunks`, `entities`, `relationships`, `agents`, `discussions`, `reports`

`ProjectRepository` (`repositories/project_repository.py`) 가 모든 CRUD 담당.
앱 첫 기동 시 `discussion_knowledge/` JSON 파일로 시드 데이터를 자동 임포트한다.

### 3-2. Optuna BO DB (SQLite / Supabase)

- **로컬**: `.env`의 `KICETIC_MPCVD_STUDY_PATH` (기본 `apps/api/app/data/mpcvd_study_v2.db`)
- **클라우드**: `KICETIC_DATABASE_URL` 동일 Supabase 사용
- `config.py`의 `optuna_storage` property가 로컬/클라우드 URL을 자동 선택

로컬 → 클라우드 마이그레이션: `apps/api/migrate_optuna.py`

### 3-3. 지식 시드 데이터 (JSON)

`apps/api/app/data/discussion_knowledge/` 아래 5개 파일:

| 파일 | 내용 |
|---|---|
| `projects.json` | 프로젝트 정의 |
| `agents.json` | 멀티에이전트 전문가 페르소나 |
| `chunks.json` | 문헌/특허/내부 DB 청크 |
| `entities.json` | 지식 그래프 노드 |
| `relationships.json` | 지식 그래프 엣지 |

새 도메인 적용 시 이 JSON 파일만 교체하면 된다.

---

## 4. 멀티에이전트 토론 파이프라인

```
클라이언트 POST /api/discussions/stream (SSE)
  │
  ├─ DiscussionService.stream_discussion()
  │     ├─ clarify_question()        — LLM이 질문 정제
  │     ├─ _select_agents()          — 질문에 맞는 에이전트 선택
  │     ├─ _rank_chunks()            — EmbeddingStore 키워드 점수로 청크 순위화
  │     ├─ [Round 1..N]
  │     │     ├─ DiscussionLLM.generate_turn()   — 에이전트별 발언 생성
  │     │     └─ DiscussionLLM.moderate()        — 라운드 요약/팔로업 생성
  │     ├─ hypothesis_stage (선택)   — 가설 생성 → 검증 → 랭킹
  │     └─ FINAL_SYNTHESIS           — 최종 요약/다음 액션/오픈 질문
  │
  └─ ProjectRepository.save_discussion()
```

**SSE 이벤트 타입**: `agent_start`, `agent_chunk`, `agent_done`, `round_start`, `round_done`, `synthesis_start`, `synthesis_done`, `error`

**LLM 프롬프트** (`services/discussion_llm.py`):
- `AGENT_SYSTEM_TEMPLATE` — 에이전트 발언
- `MODERATOR_PROMPT` — 라운드 조정
- `HYPOTHESIS_GENERATION_PROMPT` — 가설 생성
- `HYPOTHESIS_VALIDATION_TEMPLATE` — 가설 검증
- `FINAL_SYNTHESIS_PROMPT` — 최종 종합

**청크 랭킹** (`services/embedding_store.py`): 벡터 임베딩 없음, 키워드 겹침 점수(TF-like)로 빠르게 순위화. 실 서비스 전환 시 이 클래스만 교체하면 된다.

---

## 5. 프론트엔드 (apps/web)

### 실행

```bash
cd apps/web
npm run dev        # 로컬 개발 (포트 3000)
npm run build      # 프로덕션 빌드
```

### 페이지 구조

```
/                          → /dashboard/overview 리다이렉트
/dashboard/[panel]         → 동적 라우트, panel = overview | research | bo | surrogate | physical-ai | x-ai
```

### 데이터 흐름

```
dashboard-data.tsx          ← 정적 목 데이터 + kiceticWorkspaceFixture
  └─ renderPanel(panel)
        ├─ OverviewPanel    — 정적 데이터 표시
        ├─ ResearchPanel    — POST /api/discussions/stream (SSE 실시간 스트리밍)
        ├─ OptimizerPanel   — GET/POST /api/optimizer/*
        ├─ SurrogatePanel   — 정적 (계약 고정)
        ├─ PhysicalAIPanel  — 정적 (계약 고정)
        └─ XAIPanel         — GET /api/xai/summary
```

### Mock / Real 전환

`lib/mock-toggle.ts`:
- `NEXT_PUBLIC_USE_MOCK=false` — Real API 모드
- `NEXT_PUBLIC_KICETIC_DATA_MODE=mock` — Mock 모드 (API 호출 차단)
- `NEXT_PUBLIC_KICETIC_API_BASE_URL` — API 서버 주소

로컬 개발: `.env.local`에 아래 설정:
```
NEXT_PUBLIC_USE_MOCK=false
NEXT_PUBLIC_KICETIC_API_BASE_URL=http://127.0.0.1:8004
```

### 공유 패키지

`packages/shared/src/`:
- `contracts.ts` — 프론트/백 공유 TypeScript 타입 (DTO)
- `fixtures.ts` — UI Mock 픽스처 데이터

tsconfig path alias: `@kicetic/shared/contracts`, `@kicetic/shared/fixtures`

---

## 6. 클라우드 배포

### API — Google Cloud Run

```bash
# 이미지 빌드 & 푸시 (로컬 Docker 불필요)
gcloud builds submit --tag asia-northeast3-docker.pkg.dev/kicet-rag-platform-v2/kicetic/kicetic-api apps/api/

# 배포
gcloud run deploy kicetic-api \
  --image asia-northeast3-docker.pkg.dev/kicet-rag-platform-v2/kicetic/kicetic-api \
  --region asia-northeast3 \
  --env-vars-file scripts/cloudrun-env.yaml \
  --allow-unauthenticated
```

`apps/api/Dockerfile`: `python:3.12-slim` + `libpq-dev` (psycopg2 빌드용)

### 프론트엔드 — Vercel

```bash
# 수동 배포 (GitHub 연동 없음)
npx vercel deploy --token <VERCEL_TOKEN> --prod
```

- 프로덕션 URL: **https://kicetic.vercel.app**
- 빌드 커맨드: `cd apps/web && npm run build` (루트에서 `npm install` 후)
- `.vercelignore`로 `node_modules`, `apps/api`, `.next-*`, `*.db` 제외

GitHub push는 자동 배포가 아니므로 변경 후 위 명령어를 직접 실행해야 한다.

---

## 7. 로컬 개발 전체 실행

```bash
# 1. 의존성 설치
npm install                     # 루트 (workspace 전체)
cd apps/api && pip install -r requirements.txt

# 2. 환경변수 설정
# apps/api/.env 작성 (아래 참고)

# 3. API 서버
cd apps/api
uvicorn app.main:app --host 127.0.0.1 --port 8004 --reload

# 4. 프론트엔드
cd apps/web
echo "NEXT_PUBLIC_USE_MOCK=false" > .env.local
echo "NEXT_PUBLIC_KICETIC_API_BASE_URL=http://127.0.0.1:8004" >> .env.local
npm run dev
```

`apps/api/.env` 최소 설정:
```
KICETIC_LLM_PROVIDER=openai
KICETIC_OPENAI_API_KEY=sk-...
KICETIC_OPENAI_MODEL=gpt-4o
# 또는
KICETIC_LLM_PROVIDER=anthropic
KICETIC_ANTHROPIC_API_KEY=sk-ant-...
KICETIC_ANTHROPIC_MODEL=claude-opus-4-7
```

---

## 8. 새 도메인 적용 방법

1. `apps/api/app/data/discussion_knowledge/` JSON 5개 파일을 새 도메인 데이터로 교체
2. `apps/web/lib/dashboard-data.tsx` — hero/metrics/watchlist 텍스트 수정
3. `packages/shared/src/fixtures.ts` — UI 픽스처 데이터 수정
4. (선택) Optuna study 파라미터 공간을 새 도메인에 맞게 `api/optimizer.py`에서 수정

---

## 9. 프로젝트 디렉토리 구조

```
도메인특화AI/
├─ apps/
│   ├─ api/                         # FastAPI 백엔드
│   │   ├─ app/
│   │   │   ├─ api/                 # 라우터 (discussions, optimizer, xai, projects, graph)
│   │   │   ├─ models/domain.py     # Pydantic 모델 (DTO)
│   │   │   ├─ services/            # 비즈니스 로직 (discussion_service, discussion_llm, embedding_store)
│   │   │   ├─ repositories/        # DB 접근 (project_repository, discussion_knowledge_repository)
│   │   │   ├─ data/
│   │   │   │   ├─ discussion_knowledge/  # JSON 시드 데이터
│   │   │   │   └─ kicetic/              # SQLite DB (로컬, gitignore)
│   │   │   ├─ config.py            # pydantic-settings 설정
│   │   │   └─ main.py              # FastAPI 앱 진입점
│   │   ├─ Dockerfile
│   │   ├─ requirements.txt
│   │   └─ migrate_optuna.py        # Optuna 로컬→클라우드 마이그레이션
│   │
│   └─ web/                         # Next.js 14 프론트엔드
│       ├─ app/
│       │   ├─ layout.tsx
│       │   └─ dashboard/[panel]/page.tsx
│       ├─ components/kicetic/      # 패널 컴포넌트 (overview, research, optimizer, surrogate, physical-ai, xai)
│       ├─ components/ui/           # 공용 UI 컴포넌트 (SurfaceCard, StatusBadge 등)
│       ├─ lib/
│       │   ├─ api-client.ts        # fetch 래퍼
│       │   ├─ dashboard-data.tsx   # 정적 데이터 + 패널 렌더러
│       │   └─ mock-toggle.ts       # mock/real 모드 전환
│       └─ public/
│           └─ home-roadmap.png     # Home 화면 이미지
│
├─ packages/
│   └─ shared/src/
│       ├─ contracts.ts             # 공유 TypeScript 타입
│       └─ fixtures.ts             # UI Mock 픽스처
│
├─ scripts/
│   └─ cloudrun-env.yaml           # Cloud Run 환경변수
│
├─ vercel.json                      # Vercel 빌드 설정
├─ .vercelignore
└─ package.json                     # npm workspace 루트
```
