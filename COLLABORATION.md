# KICETIC 협업 가이드

## 1. 프로젝트 구조 및 담당 범위

각 모듈 담당자는 **자신의 폴더만** 수정한다. 공유 파일을 건드릴 때는 반드시 전체 조율 필요.

```
apps/
  api/app/api/
    multiagent/   ← Multiagent 담당자 전용
    bo/           ← BO 담당자 전용
    xai/          ← XAI 담당자 전용
    projects.py   ← 공유 (조율 필요)
  web/components/kicetic/
    research-panel.tsx    ← Multiagent 담당자
    optimizer-panel.tsx   ← BO 담당자
    xai-panel.tsx         ← XAI 담당자
```

**절대 건드리면 안 되는 공유 파일 (변경 시 전체 조율)**

| 파일 | 영향 범위 |
|------|-----------|
| `apps/api/app/models/domain.py` | 전체 API 타입 |
| `apps/api/app/repositories/` | 전체 DB 접근 |
| `packages/shared/src/contracts.ts` | 프론트-백 공용 타입 |
| `apps/api/app/config.py` | 전체 설정 |

---

## 2. 로컬 개발 환경 설정

### 2-1. 저장소 클론
```bash
git clone https://github.com/typtyp2/-AI.git
cd 도메인특화AI
```

### 2-2. 환경 변수 설정
```bash
# 프로젝트 루트의 .env.example을 복사
cp .env.example .env

# .env 파일 열어서 OpenAI API 키 입력
KICETIC_OPENAI_API_KEY=sk-...
```

### 2-3. 서버 실행 (Windows)
```bash
# start-dev.bat 더블클릭 또는
./start-dev.bat
```

실행 후:
- 백엔드: http://127.0.0.1:8005/health
- 프론트: http://localhost:3000/dashboard/overview

### 2-4. 수동 실행 (Mac/Linux)
```bash
# 백엔드
cd apps/api
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8005 --reload

# 프론트 (별도 터미널)
npm install
npm run dev:web
```

---

## 3. GitHub 협업 흐름

### 기본 브랜치 전략
```
master  ← 배포 브랜치 (직접 push 금지, PR로만 머지)
  └─ feat/multiagent-xxx   ← Multiagent 작업 브랜치
  └─ feat/bo-xxx           ← BO 작업 브랜치
  └─ feat/xai-xxx          ← XAI 작업 브랜치
```

### 작업 순서
```bash
# 1. 최신 master 받기
git pull origin master

# 2. 내 작업 브랜치 만들기
git checkout -b feat/multiagent-hypothesis

# 3. 작업 후 커밋
git add apps/api/app/api/multiagent/
git commit -m "feat: add hypothesis ranking step"

# 4. GitHub에 push
git push origin feat/multiagent-hypothesis

# 5. GitHub에서 PR(Pull Request) 생성 → master로 머지 요청
```

### PR 규칙
- PR 제목: `feat: 기능설명` / `fix: 버그설명` / `refactor: 리팩터링`
- 본인 담당 폴더 이외 파일 수정 시 반드시 설명 작성
- master에 직접 push 하지 않는다

---

## 4. 배포 구조

```
GitHub master 브랜치
  ├─ Vercel         ← 프론트엔드 자동 배포 (push 시 즉시)
  └─ Cloud Run      ← 백엔드 수동 배포 (아래 명령어 실행)
```

### 4-1. 프론트엔드 (Vercel) — 자동
`master` 브랜치에 push/머지되면 **자동으로** `https://kicetic.vercel.app` 에 반영된다. 별도 작업 불필요.

### 4-2. 백엔드 (Google Cloud Run) — 수동

> **gcloud CLI 설치 필요**: https://cloud.google.com/sdk/docs/install

```bash
# 1. Google 계정으로 로그인
gcloud auth login

# 2. 프로젝트 설정
gcloud config set project kicet-rag-platform-v2

# 3. Docker 이미지 빌드 & 푸시
gcloud builds submit apps/api \
  --tag asia-northeast3-docker.pkg.dev/kicet-rag-platform-v2/kicetic/kicetic-api:latest \
  --region asia-northeast3

# 4. Cloud Run에 배포
gcloud run deploy kicetic-api \
  --image asia-northeast3-docker.pkg.dev/kicet-rag-platform-v2/kicetic/kicetic-api:latest \
  --region asia-northeast3 \
  --platform managed
```

배포 완료 후 URL: `https://kicetic-api-909376211423.asia-northeast3.run.app`

---

## 5. Cloud Run 접근 권한 받기

백엔드를 직접 배포하려면 GCP 프로젝트 권한이 필요하다.

### 권한 요청
프로젝트 관리자(`pty2223@gmail.com`)에게 Gmail 주소를 알려주고 권한 요청.

### 권한 받은 후 설정
```bash
# gcloud CLI 설치 후
gcloud auth login        # 본인 Gmail로 로그인
gcloud config set project kicet-rag-platform-v2
```

### 권한 없이 배포하고 싶다면 (추후 지원 예정)
GitHub Actions 자동 배포 파이프라인이 구축되면 `master` PR 머지만으로 자동 배포된다.

---

## 6. 자주 쓰는 명령어

```bash
# 로컬 API 서버 상태 확인
curl http://127.0.0.1:8005/health

# 배포된 API 상태 확인
curl https://kicetic-api-909376211423.asia-northeast3.run.app/health

# Cloud Run 서비스 목록
gcloud run services list --platform managed

# 배포 로그 확인
gcloud run services logs read kicetic-api --region asia-northeast3 --limit 50
```

---

## 7. 문제 발생 시

| 증상 | 원인 | 해결 |
|------|------|------|
| API 응답 없음 | 백엔드 미실행 | `start-dev.bat` 실행 또는 Cloud Run 배포 확인 |
| `USE_MOCK` 관련 에러 | mock 모드 on | `apps/web/lib/mock-toggle.ts` 에서 `USE_MOCK = false` 확인 |
| DB 관련 에러 | SQLite 파일 없음 | 서버 최초 실행 시 자동 생성됨, 로그 확인 |
| CORS 에러 | 백엔드 CORS 설정 | `apps/api/app/config.py` 의 `cors_origins` 확인 |
</content>
</invoke>