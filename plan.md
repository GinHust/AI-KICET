# Context
KICETIC의 1차 목표는 세라믹 및 방열 소재 분야를 위한 도메인 특화 AI 프레임워크를 하나의 SaaS형 대시보드로 보이게 만드는 것이다. 이 프레임워크는 논문/원서/기존 DB 기반 멀티에이전트, 물리 기반 최적화와 BO, 대리 모델 및 시뮬레이션, Physical AI 목업, X.AI 상위 의사결정 레이어를 포함한다. 현재 작업 디렉터리 `C:\Users\t_y_p\OneDrive\6. programing\도메인특화AI`는 비어 있으므로, 새 프로젝트를 부트스트랩하고 기존 멀티에이전트/BO 코드에서 핵심만 선별 이식해야 한다. 사용자는 기능 간 실제 강결합보다 UI 중심 통합을 원하며, 비주얼 설계를 먼저 진행하고 이후 단계적으로 실제 기능을 연결하길 원한다.

# Recommended approach
## 1. 새 프로젝트를 모노레포로 시작
- `apps/web`: KICETIC 메인 SaaS 대시보드
- `apps/api`: 멀티에이전트/BO/업로드용 FastAPI
- `packages/shared`: 프런트-백 공용 DTO, mock 응답 스키마, 상태 enum
- `packages/design`: 디자인 토큰, 공통 레이아웃 규칙

권장 스택:
- Frontend: React 계열인 `Next.js + TypeScript + Tailwind + shadcn/ui` 컴포넌트
- Backend: `FastAPI`
- AI provider: OpenAI 최신 모델을 설정값으로 주입하는 adapter 구조

구현 원칙:
- RAG는 별도 모듈로 분리하지 않고 `Research/Multiagent` 내부 capability로 통합한다.
- 1차 데모에서는 각 모듈이 독립 실행되더라도 UI에서는 하나의 SaaS 플랫폼처럼 보이게 만든다.
- 모듈 간 실제 데이터 강결합보다 공용 DTO와 프런트 오케스트레이션을 우선한다.

## 2. 1차 제품 구조는 실제 연결보다 화면 구조를 우선
메인 네비게이션/워크스페이스는 하나로 두고, 내부 모듈은 느슨하게 분리한다.
- Multiagent: 논문/원서/기존 DB 기반 문헌 탐색, 질문 분해, 전문가 토론
- BO Studio: 물리 기반 가설과 기존 Optuna 기반 조건 추천/결과 시각화
- Surrogate/Simulation: DFT/MD 또는 후속 시뮬레이션 데이터를 설명 가능한 카드/패널로 노출하는 준비 레이어
- Physical AI: 디지털 트윈 + 실험 자동화 mock 패널
- X.AI: 연구원 → 팀장 → 임원 순으로 읽히는 상위 의사결정 레이어

대표 워크플로는 `설계 → 공정 최적화 → 실행(Action) → 분석`의 순환 구조로 표현한다. 첫 버전에서는 실제 피드백 루프를 완전 자동화하지 않고, 각 단계가 UI에서 하나의 프레임워크처럼 이어져 보이게 만든다.

## 3. 디자인 우선 단계 분리
### Phase A — 시각/정보구조 설계
- 한 페이지처럼 보이는 단일 앱 셸 구성
- 추천 디자인 레퍼런스 조합:
  - `x.ai`: dark futuristic tone
  - `Linear` 또는 `Vercel`: SaaS 대시보드 정보 밀도와 정제감
  - `Cohere`: AI/데이터 카드 구성
  - 레퍼런스 소스: `https://github.com/typtyp2/awesome-design-md`
- 핵심 화면:
  - Executive Overview
  - Research Workspace
  - BO Studio
  - Surrogate & Simulation
  - Physical AI Twin
  - X.AI Decision Panel
- 도메인 서사는 세라믹/방열 소재 특화 프레임워크로 고정하고, 1차 대표 소재는 `AlN 기판`과 `Al₂O₃ 방열 필러`를 기준으로 잡는다.
- 첫 화면의 대표 KPI는 `열전도도`로 두고, 다른 물성 지표는 후속 사용자 입력을 받아 확장 가능하게 카드 슬롯을 남겨둔다.
- 소재 설계·공정 최적화·열전도도/계면 열저항·포논 관련 지표를 담을 수 있게 카드 구조를 잡는다.

### Phase B — mock 데이터 기반 인터랙션
- 실데이터 없이도 전체 여정 클릭 가능하게 구현
- 업로드, 토론 시작, 조건 추천, twin 실행, X.AI 요약을 fixture로 연결
- `NEXT_PUBLIC_KICETIC_DATA_MODE=mock|real` 기준으로 mock/real 전환 지점을 프런트에 미리 분리한다.
- FastAPI는 동일 DTO를 반환하는 mock endpoint부터 만들고, 이후 real 서비스만 교체한다.

### Phase C — 실제 엔진 최소 이식
- Multiagent와 BO 코어를 새 구조에 맞게 최소 파일만 이식
- `wbg-mirofish` 코드는 기존 프로젝트 경로를 런타임에서 참조하지 않고, 필요한 핵심만 KICETIC 내부 네임스페이스로 복사·재구성해 원본과 완전히 별개로 독립 실행되게 만든다.
- 원본 `wbg-mirofish`와 파일명·모듈명·DB 경로·설정명이 충돌하지 않도록 KICETIC 전용 경로와 설정으로 치환한다.
- UI 계약은 유지하고 데이터 소스만 mock → real로 교체

## 4. 멀티에이전트에서 재사용할 핵심 파일
원본 경로: `C:\Users\t_y_p\OneDrive\6. programing\Miro fish test\wbg-mirofish`

재사용 우선순위 파일:
- `backend/app/main.py`
- `backend/app/config.py`
- `backend/app/models/domain.py`
- `backend/app/repositories/project_repository.py`
- `backend/app/services/pipeline.py`
- `backend/app/services/discussion_engine.py`
- `backend/app/services/embedding_store.py`
- `backend/app/services/agent_generator.py`
- `backend/app/services/entity_extractor.py`
- `backend/app/services/graph_builder.py`
- `backend/app/services/chunker.py`
- `backend/app/services/pdf_extractor.py`
- `backend/app/api/projects.py`
- `backend/app/api/discussions.py`
- `backend/app/api/graph.py`

이식 원칙:
- 전체 프로젝트를 복제하지 않고 `agent_core`, `ingestion`, `retrieval`, `api`로 재배치
- 기존 `wbg-mirofish` 프로젝트를 import path나 실행 경로로 직접 물지 않는다.
- 필요한 핵심 소스만 KICETIC 내부로 복사한 뒤 모듈명, 설정명, 저장 경로, DB 경로를 KICETIC 기준으로 다시 정리해 독립 서비스처럼 동작하게 만든다.
- 보고서/테스트/log/mock 프런트 등 주변 파일은 제외
- PDF 업로드와 기존 DB 활용 흐름은 `pipeline.py`, `projects.py`, `project_repository.py`를 기준으로 단순화

## 5. BO에서 재사용할 핵심 파일
원본 경로: `C:\Users\t_y_p\OneDrive\6. programing\Optuna`

핵심 소스:
- `mpcvd_optimizer.py`

이식 대상 블록:
- 파라미터 스키마 (`CATEGORICAL_PARAMS`, `CONTINUOUS_PARAMS`, `RESULT_PARAMS`)
- study 초기화 (`init_db()`)
- ask/tell 기반 추천 루프
- Excel 업로드 파싱 로직
- 결과 시각화 생성 로직

이식 원칙:
- Streamlit UI는 버리고 엔진/스키마/업로드/시각화 생성만 분리
- `optimizer_engine.py`, `optimizer_schema.py`, `optimizer_import.py`, `optimizer_charts.py` 식으로 모듈화
- 레거시 참조(`axis`, `face`, `pretreatment` 등)는 정리 대상

## 6. 실제 구현 순서
1. 모노레포 부트스트랩 (`apps/web`, `apps/api`, `packages/shared`, `packages/design`)
2. 공용 DTO/fixture 계약 정의
3. 디자인 토큰 + 앱 셸 + 주요 화면 목업
4. X.AI 읽기 흐름(연구원/팀장/임원) UI 우선 구현
5. FastAPI mock endpoint 구성
6. Multiagent 업로드/토론 API 최소 이식
7. BO 추천/업로드/차트 API 최소 이식
8. Surrogate/Simulation 패널 mock 추가
9. Physical AI twin mock 연결
10. 모듈별 real/mock 스위치 추가

# Critical files to create or modify
새 프로젝트 기준 예상 핵심 파일:
- `C:\Users\t_y_p\OneDrive\6. programing\도메인특화AI\apps\web\app\page.tsx`
- `C:\Users\t_y_p\OneDrive\6. programing\도메인특화AI\apps\web\components\layout\app-shell.tsx`
- `C:\Users\t_y_p\OneDrive\6. programing\도메인특화AI\apps\web\components\kicetic\overview-panel.tsx`
- `C:\Users\t_y_p\OneDrive\6. programing\도메인특화AI\apps\web\components\kicetic\research-panel.tsx`
- `C:\Users\t_y_p\OneDrive\6. programing\도메인특화AI\apps\web\components\kicetic\optimizer-panel.tsx`
- `C:\Users\t_y_p\OneDrive\6. programing\도메인특화AI\apps\web\components\kicetic\physical-ai-panel.tsx`
- `C:\Users\t_y_p\OneDrive\6. programing\도메인특화AI\apps\web\components\kicetic\xai-panel.tsx`
- `C:\Users\t_y_p\OneDrive\6. programing\도메인특화AI\apps\api\app\main.py`
- `C:\Users\t_y_p\OneDrive\6. programing\도메인특화AI\apps\api\app\services\agent_core\discussion_engine.py`
- `C:\Users\t_y_p\OneDrive\6. programing\도메인특화AI\apps\api\app\services\ingestion\pipeline.py`
- `C:\Users\t_y_p\OneDrive\6. programing\도메인특화AI\apps\api\app\services\optimizer\optimizer_engine.py`
- `C:\Users\t_y_p\OneDrive\6. programing\도메인특화AI\packages\shared\src\contracts.ts`
- `C:\Users\t_y_p\OneDrive\6. programing\도메인특화AI\packages\design\DESIGN.md`

# Verification
- UI: 실제 SaaS처럼 6개 패널을 전환/스크롤/탭으로 모두 탐색 가능해야 함
- Frontend: `apps/web` 실행 후 `/dashboard/overview` 진입 및 패널별 라우팅 확인
- API: `apps/api` 실행 후 `/health`, `/api/projects`, `/api/discussions`, `/api/optimizer/trials`, `/api/xai/summary` 200 응답 확인
- Upload: PDF 업로드 mock → 실제 업로드 API 전환 시 기존 DB 반영 경로 확인
- Multiagent: 질문 입력 → agent selection → 토론 결과 표시까지 최소 1회 성공
- BO: 샘플 데이터 업로드 → 추천 조건 생성 → 차트 1종 이상 렌더링
- X.AI: 같은 결과를 연구원/팀장/임원 관점으로 다르게 재표현하는지 확인
- 통합: 기능이 독립 실행되더라도 사용자는 하나의 제품 흐름으로 인식해야 함
