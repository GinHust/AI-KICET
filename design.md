# KICETIC Home Landing Design

## 목표

Home 탭은 단순 상태판이 아니라 KICETIC 플랫폼의 첫 랜딩페이지 역할을 한다. 사용자가 처음 들어왔을 때 다음 세 가지를 즉시 이해하도록 설계한다.

1. 이 플랫폼이 무엇을 해결하는가: MPCVD diamond 연구에서 질문 정리, 제약 검토, BO 추천, 실험 분석을 연결한다.
2. 어디부터 시작해야 하는가: Multi Agent와 BO 같은 실행 가능한 모듈로 바로 진입한다.
3. 현재 어디까지 준비되어 있는가: live 기능, 공사 중인 기능, 운영 전 watchlist를 분리해 보여준다.

## 랜딩 구성 원칙

### 1. Keyword-first, not TMI

첫 화면은 설명문보다 핵심 흐름을 먼저 보여준다. Hero headline은 `설계 → 공정 최적화 → 실행 → 분석`처럼 사용자가 바로 이해할 수 있는 키워드형 메시지를 우선하고, 요약문은 한 문장으로 제한한다. Hero에는 두 개의 주요 CTA를 둔다.

- Multi Agent 시작: 연구 질문을 토론과 가설 검증으로 바꾸는 시작점
- BO 추천 보기: 실험 조건 추천으로 이어지는 실행점

### 2. Proof before detail

Hero 하단에는 기존 metric을 유지해 플랫폼이 실제 실험 지표를 다룬다는 신뢰를 준다.

- Best growth rate
- Completed BO trials
- Raman FWHM

이 지표들은 제품 소개가 아니라 연구 플랫폼의 근거 역할을 한다.

### 3. Module entry cards

각 탭으로 이동하는 CTA 카드는 Home의 핵심 navigation layer다. 상단 내비게이션만으로는 모듈의 역할이 충분히 설명되지 않으므로, Home 본문에 다음 정보를 함께 둔다.

- 모듈 이름
- 현재 상태
- 한 문장 역할
- 모듈 열기 동작

모듈은 `Multi Agent → BO → Surrogate → Physical AI → X.AI` 순서로 배치해 연구 판단에서 의사결정까지의 흐름을 보여준다.

### 4. Closed-loop workflow

기존 `Closed-loop workflow` 섹션은 유지한다. 이 문구는 테스트와 사용자 인지 모두에서 Home의 핵심 anchor다. 단계는 `Design → Optimization → Execution → Analysis`로 유지하고, 각 단계의 상태를 badge로 표현한다.

### 5. Trust, readiness, watchlist 분리

랜딩페이지는 좋아 보이는 소개만 있으면 실제 연구 도구처럼 느껴지지 않는다. 그래서 다음 세 섹션을 분리한다.

- Trust signals: 근거 기반 토론, constraint-aware BO, closed-loop feedback
- Build roadmap: 지금 가능한 기능과 다음 확장
- Watchlist: 운영 전 확인해야 할 연구 리스크

이 구조는 “무엇이 가능한지”와 “무엇을 조심해야 하는지”를 동시에 보여준다.

## 컴포넌트 재사용

새 디자인은 기존 컴포넌트와 토큰을 우선 사용한다.

- `SurfaceCard`: 모든 섹션과 nested card의 기본 container
- `StatusBadge`: 상태, 모듈 라벨, readiness 표시
- `Link`: 모듈 진입 CTA
- `/home-roadmap.png`: 플랫폼 시각 지도

새로운 전역 컴포넌트는 만들지 않는다. Home에만 필요한 tone mapping과 section layout은 `overview-panel.tsx` 내부에 둔다.

## 색상과 타이포그래피

색상은 Tailwind config에 정의된 토큰을 사용한다.

- `research`: Multi Agent, 연구 시작, 활성 단계
- `bo`: BO 추천과 최적화
- `xai`: 설명/의사결정 계층
- `success`: 준비 완료, traceable 상태
- `surface`, `surface-muted`, `surface-contrast`: 카드 계층
- `ink`, `soft`, `faint`: 정보 위계

타이포그래피는 큰 hero headline과 작은 uppercase eyebrow를 조합한다. 첫 화면은 `md:text-5xl` 수준으로 핵심 키워드를 선명하게 보여주고, 상세 설명은 한 문장 이하의 `text-base leading-7`로 유지한다.

## 반응형 원칙

- Hero는 desktop에서 2-column, mobile에서 single-column으로 접힌다.
- Module CTA는 mobile 1열, tablet 2열, wide desktop 5열로 확장한다.
- Workflow는 기존처럼 2열/4열로 확장한다.
- Watchlist는 desktop에서 3열로 보여 리스크 항목을 한눈에 비교한다.

## 접근성 고려

- CTA는 실제 `Link`로 구현해 키보드 이동과 URL 이동이 자연스럽다.
- Module CTA section에는 `aria-label`을 제공한다.
- Roadmap 이미지는 기존 의미 있는 alt text를 유지한다.
- 색상만으로 상태를 판단하지 않도록 badge text를 함께 표시한다.

## 검증

구현 후 다음을 확인한다.

- `npm run typecheck`
- `npm run test:e2e -- tests/dashboard-ui.spec.ts --project=chromium -g "sticky top navigation shows renamed IA"`
- 가능하면 `npm run build`
- 브라우저에서 `/dashboard/overview`를 열어 hero, module CTA, workflow, roadmap, watchlist가 보이는지 확인
- Playwright가 생성한 `.next-playwright-*` 임시 경로는 커밋 전 정리
