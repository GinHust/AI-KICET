# models — 공유 Pydantic 도메인 모델

## 역할

전체 API에서 공유하는 Pydantic v2 모델을 정의한다.
FastAPI의 request body, response schema, 내부 데이터 전달 구조가 모두 여기 있다.

> **주의**: 이 파일의 필드를 추가·삭제·타입 변경하면
> multiagent, bo, xai 라우터와 프론트엔드 TypeScript 계약(`packages/shared/src/contracts.ts`)이 모두 영향을 받는다.
> 변경 전 전체 담당자와 조율하라.

---

## 파일 구성

| 파일 | 역할 |
|------|------|
| `domain.py` | 모든 도메인 모델 정의 |

---

## 주요 모델 그룹

### 프로젝트 / 에이전트
```python
ProjectSummary          # GET /projects 응답
AgentPerspective        # 토론에 참여한 에이전트 정보
```

### 토론 (multiagent)
```python
Discussion              # 토론 전체 레코드 (DB 저장 단위)
DiscussionCreateRequest # POST /discussions body
DiscussionTurn          # 에이전트 한 발언
EvidenceItem            # 인용 chunk
GraphPayload / GraphNode / GraphEdge   # 지식 그래프
HypothesisCandidate     # 생성된 가설
HypothesisValidation    # 에이전트의 가설 검증 의견
HypothesisRanking       # 가설 랭킹 결과
```

### BO (optimizer)
```python
MpcvdTrialOut           # GET /optimizer/trials 응답
MpcvdRecommendation     # GET /optimizer/recommend 응답
MpcvdSubmitRequest      # POST /optimizer/submit body
MpcvdStats              # GET /optimizer/stats 응답
MpcvdHistoryPoint       # GET /optimizer/history 응답
MpcvdImportanceOut      # GET /optimizer/importance 응답
```

### XAI
```python
XAISummary              # GET/POST /xai/summary 응답
XAISummaryRequest       # POST /xai/summary body
```

### 시스템
```python
HealthResponse          # GET /health 응답
```

---

## 모델 수정 시 체크리스트

1. `domain.py` 수정
2. `packages/shared/src/contracts.ts` 의 TypeScript 타입도 동일하게 수정
3. 해당 모델을 사용하는 라우터 파일 검토
4. 프론트엔드 `lib/api-client.ts` 응답 파싱 코드 확인
