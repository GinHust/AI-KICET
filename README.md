# KICETIC — Domain-Specific AI Platform

> **한국어** | [English](#english)

---

## 한국어

### 개요

KICETIC은 MPCVD 다이아몬드 연구를 위한 도메인 특화 AI 플랫폼입니다.  
멀티에이전트 토론, Bayesian Optimization, 대리 모델, Physical AI, Explainable AI를 하나의 SaaS 대시보드로 통합합니다.

| 서비스 | URL |
|--------|-----|
| 대시보드 | https://kicetic.vercel.app |
| API | https://kicetic-api-909376211423.asia-northeast3.run.app/health |
| GitHub | https://github.com/typtyp2/Domain_Specific_AI |

---

### 모듈 구조

```
apps/
  web/          Next.js 14  — 대시보드 프론트엔드  →  Vercel (자동 배포)
  api/          FastAPI     — 백엔드 API           →  Google Cloud Run (수동 배포)
packages/
  shared/       프론트-백 공용 타입 (TypeScript ↔ Pydantic)
```

| 모듈 | 폴더 | 역할 |
|------|------|------|
| Multi-Agent | `apps/api/app/api/multiagent/` | 논문 기반 26-에이전트 토론 + RAG (청크 6000개) |
| BO | `apps/api/app/api/bo/` | Bayesian Optimization (Optuna) |
| XAI | `apps/api/app/api/xai/` | 청중별 의사결정 요약 |

---

### DB 구조

KICETIC은 두 종류의 DB를 사용합니다.

| DB | 저장 위치 | 내용 | 영속성 |
|----|-----------|------|--------|
| **지식 DB** (SQLite) | 컨테이너 내 `apps/api/app/data/kicetic/projects.db` | 에이전트 26개 · 청크 6000개 · 엔티티 12881개 | 서버 재시작 시 JSON 시드에서 자동 재빌드 |
| **토론 기록** (PostgreSQL) | Supabase (외부) | 토론 세션 · 히스토리 | 영구 저장 (Cloud Run 재시작 후에도 유지) |

#### 지식 DB 시드 파일 (재빌드 소스)

```
apps/api/app/data/discussion_knowledge/
  agents.json       — 에이전트 26개 정의 (여기가 유일한 소스 — DB와 항상 동기화)
  chunks.json       — 논문 청크 샘플 (로컬 전용, Cloud Run은 DB에서 로드)
  entities.json     — 지식 그래프 노드
  relationships.json — 지식 그래프 엣지
  projects.json     — 프로젝트 메타데이터
```

> **에이전트 추가/수정 시 반드시 `agents.json`도 함께 업데이트할 것.**  
> Cloud Run 재시작 시 이 파일에서 DB를 재빌드하므로, DB만 수정하면 배포 후 사라집니다.

---

### 로컬 실행

#### 1. 클론 & 환경 변수

```bash
git clone https://github.com/typtyp2/Domain_Specific_AI.git
cd Domain_Specific_AI
cp .env.example .env
# .env 열어서 아래 키 입력:
#   KICETIC_ANTHROPIC_API_KEY=sk-ant-...
#   KICETIC_OPENAI_API_KEY=sk-...  (선택)
```

#### 2. 서버 시작 (Windows)

```bash
start-dev.bat
```

#### 2. 서버 시작 (Mac / Linux)

```bash
# 터미널 1 — 백엔드
cd apps/api
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8005 --reload

# 터미널 2 — 프론트엔드 (프로젝트 루트에서)
npm install
npm run dev:web
```

실행 후:
- 프론트: http://localhost:3000/dashboard/overview
- 백엔드: http://127.0.0.1:8005/health

---

### 협업 — 담당 범위

**각 담당자는 자신의 모듈 폴더만 수정한다.**

| 담당 | 수정 가능 폴더 |
|------|---------------|
| Multiagent | `apps/api/app/api/multiagent/` · `apps/web/components/kicetic/research-panel.tsx` |
| BO | `apps/api/app/api/bo/` · `apps/web/components/kicetic/optimizer-panel.tsx` |
| XAI | `apps/api/app/api/xai/` · `apps/web/components/kicetic/xai-panel.tsx` |
| 지식 DB | `apps/api/app/data/discussion_knowledge/` |

> **공유 파일** (`models/domain.py`, `repositories/`, `contracts.ts`, `config.py`) 수정 시 반드시 전체 조율.

---

### 협업 — Git 브랜치 전략

```
master  ←  배포 브랜치 (PR 없이 직접 push 금지)
  ├─ feat/multiagent-xxx
  ├─ feat/bo-xxx
  └─ feat/xai-xxx
```

```bash
# 작업 순서
git pull origin master
git checkout -b feat/내작업명

# 작업 후 — 본인 폴더만 스테이징
git add apps/api/app/api/multiagent/
git commit -m "feat: 기능 설명"
git push origin feat/내작업명
# → GitHub에서 master로 Pull Request 생성 → 관리자 리뷰 후 머지
```

---

### 배포

#### 프론트엔드 — Vercel (자동)

`master` 브랜치에 push 또는 PR 머지 시 **자동 배포**. 별도 작업 불필요.

#### 백엔드 — Google Cloud Run (수동)

> gcloud CLI 설치: https://cloud.google.com/sdk/docs/install  
> 배포 권한은 관리자(`pty2223@gmail.com`)에게 요청

```bash
# 로그인 & 프로젝트 설정 (최초 1회)
gcloud auth login
gcloud config set project kicet-rag-platform-v2

# 이미지 빌드 & 푸시
gcloud builds submit apps/api \
  --tag asia-northeast3-docker.pkg.dev/kicet-rag-platform-v2/kicetic/kicetic-api:latest \
  --region asia-northeast3

# Cloud Run 서비스 업데이트
gcloud run deploy kicetic-api \
  --image asia-northeast3-docker.pkg.dev/kicet-rag-platform-v2/kicetic/kicetic-api:latest \
  --region asia-northeast3 \
  --platform managed
```

#### 배포 정보

| 항목 | 값 |
|------|----|
| GCP 프로젝트 | `kicet-rag-platform-v2` |
| 리전 | `asia-northeast3` (서울) |
| Artifact Registry | `asia-northeast3-docker.pkg.dev/kicet-rag-platform-v2/kicetic/` |
| Cloud Run 서비스 | `kicetic-api` |
| 토론 DB | Supabase PostgreSQL (Secret Manager → `kicetic-database-url`) |

---

### 트러블슈팅

| 증상 | 원인 & 해결 |
|------|------------|
| API 응답 없음 | `start-dev.bat` 실행 여부 확인. Cloud Run은 `/health` 엔드포인트로 직접 확인 |
| CORS 에러 | `apps/api/app/config.py` → `effective_cors_origins` 확인. 로컬 포트 추가 필요 시 수정 |
| DB 에러 (로컬) | 서버 재시작 시 SQLite 자동 생성. `apps/api/app/data/kicetic/` 폴더 삭제 후 재시작 |
| 에이전트가 6개만 보임 | `agents.json`에 WBG 에이전트 26개가 있는지 확인. 없으면 git pull 후 서버 재시작 |
| 지식 그래프 빈 칸 | `entities.json`의 `project_id`가 `proj-ai-research-001`인지 확인 |
| Mock 데이터만 나옴 | `apps/web/lib/mock-toggle.ts` → `USE_MOCK = false` 확인 |
| 토론 기록 사라짐 | Cloud Run 재시작 후 토론 DB는 Supabase에 유지됨. 이슈 지속 시 `KICETIC_DATABASE_URL` 환경변수 확인 |

---
---

## English

<a name="english"></a>

### Overview

KICETIC is a domain-specific AI platform for MPCVD diamond materials research.  
It integrates multi-agent discussion, Bayesian Optimization, surrogate modeling, Physical AI, and Explainable AI into a single SaaS dashboard.

| Service | URL |
|---------|-----|
| Dashboard | https://kicetic.vercel.app |
| API | https://kicetic-api-909376211423.asia-northeast3.run.app/health |
| GitHub | https://github.com/typtyp2/Domain_Specific_AI |

---

### Architecture

```
apps/
  web/          Next.js 14  — Dashboard frontend   →  Vercel (auto-deploy)
  api/          FastAPI     — Backend API           →  Google Cloud Run (manual deploy)
packages/
  shared/       Shared types (TypeScript ↔ Pydantic)
```

| Module | Folder | Role |
|--------|--------|------|
| Multi-Agent | `apps/api/app/api/multiagent/` | 26-agent discussion + RAG (6,000 chunks) |
| BO | `apps/api/app/api/bo/` | Bayesian Optimization (Optuna) |
| XAI | `apps/api/app/api/xai/` | Audience-specific decision summary |

---

### Database Architecture

KICETIC uses two separate databases.

| DB | Location | Contents | Persistence |
|----|----------|----------|-------------|
| **Knowledge DB** (SQLite) | Container-local `apps/api/app/data/kicetic/projects.db` | 26 agents · 6,000 chunks · 12,881 entities | Auto-rebuilt from JSON seed files on each server restart |
| **Discussion history** (PostgreSQL) | Supabase (external) | Discussion sessions · history | Persistent across Cloud Run restarts |

#### Knowledge DB seed files (rebuild source)

```
apps/api/app/data/discussion_knowledge/
  agents.json        — 26 agent definitions (single source of truth — keep in sync with DB)
  chunks.json        — paper chunk samples
  entities.json      — knowledge graph nodes
  relationships.json — knowledge graph edges
  projects.json      — project metadata
```

> **When adding or modifying agents, always update `agents.json` too.**  
> Cloud Run rebuilds the DB from these files on restart — changes made only to the DB will be lost after redeployment.

---

### Running Locally

#### 1. Clone & Environment Variables

```bash
git clone https://github.com/typtyp2/Domain_Specific_AI.git
cd Domain_Specific_AI
cp .env.example .env
# Open .env and fill in:
#   KICETIC_ANTHROPIC_API_KEY=sk-ant-...
#   KICETIC_OPENAI_API_KEY=sk-...  (optional)
```

#### 2. Start Servers (Windows)

```bash
start-dev.bat
```

#### 2. Start Servers (Mac / Linux)

```bash
# Terminal 1 — Backend
cd apps/api
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8005 --reload

# Terminal 2 — Frontend (from project root)
npm install
npm run dev:web
```

After startup:
- Frontend: http://localhost:3000/dashboard/overview
- Backend: http://127.0.0.1:8005/health

---

### Collaboration — Ownership

**Each contributor modifies only their assigned module folder.**

| Owner | Allowed folders |
|-------|----------------|
| Multiagent | `apps/api/app/api/multiagent/` · `apps/web/components/kicetic/research-panel.tsx` |
| BO | `apps/api/app/api/bo/` · `apps/web/components/kicetic/optimizer-panel.tsx` |
| XAI | `apps/api/app/api/xai/` · `apps/web/components/kicetic/xai-panel.tsx` |
| Knowledge DB | `apps/api/app/data/discussion_knowledge/` |

> **Shared files** (`models/domain.py`, `repositories/`, `contracts.ts`, `config.py`) require team-wide coordination before changes.

---

### Collaboration — Git Workflow

```
master  ←  deployment branch (no direct push without PR)
  ├─ feat/multiagent-xxx
  ├─ feat/bo-xxx
  └─ feat/xai-xxx
```

```bash
# Workflow
git pull origin master
git checkout -b feat/my-feature

# After work — stage your folder only
git add apps/api/app/api/multiagent/
git commit -m "feat: description"
git push origin feat/my-feature
# → Open a Pull Request to master on GitHub → reviewed and merged by admin
```

---

### Deployment

#### Frontend — Vercel (automatic)

Pushing to or merging into `master` triggers an **automatic deployment** to `kicetic.vercel.app`. No manual steps needed.

#### Backend — Google Cloud Run (manual)

> Install gcloud CLI: https://cloud.google.com/sdk/docs/install  
> Request deployment access from the admin (`pty2223@gmail.com`)

```bash
# Login & set project (once)
gcloud auth login
gcloud config set project kicet-rag-platform-v2

# Build & push image
gcloud builds submit apps/api \
  --tag asia-northeast3-docker.pkg.dev/kicet-rag-platform-v2/kicetic/kicetic-api:latest \
  --region asia-northeast3

# Update Cloud Run service
gcloud run deploy kicetic-api \
  --image asia-northeast3-docker.pkg.dev/kicet-rag-platform-v2/kicetic/kicetic-api:latest \
  --region asia-northeast3 \
  --platform managed
```

#### Deployment Reference

| Item | Value |
|------|-------|
| GCP Project | `kicet-rag-platform-v2` |
| Region | `asia-northeast3` (Seoul) |
| Artifact Registry | `asia-northeast3-docker.pkg.dev/kicet-rag-platform-v2/kicetic/` |
| Cloud Run service | `kicetic-api` |
| Discussion DB | Supabase PostgreSQL (Secret Manager → `kicetic-database-url`) |

---

### Troubleshooting

| Symptom | Cause & Fix |
|---------|-------------|
| No API response | Check `start-dev.bat` is running. For Cloud Run, hit the `/health` endpoint directly |
| CORS error | Check `effective_cors_origins` in `apps/api/app/config.py`. Add your local port if needed |
| DB error (local) | SQLite is auto-created on start. Delete `apps/api/app/data/kicetic/` and restart |
| Only 6 agents showing | Verify `agents.json` contains all 26 agents. If not, `git pull` then restart server |
| Knowledge graph empty | Verify `project_id` in `entities.json` is `proj-ai-research-001` |
| Only mock data | Set `USE_MOCK = false` in `apps/web/lib/mock-toggle.ts` |
| Discussion history lost | Cloud Run restart preserves Supabase data. If issue persists, check `KICETIC_DATABASE_URL` env var |
</content>
</invoke>