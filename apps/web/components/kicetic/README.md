# kicetic — 대시보드 UI 패널 컴포넌트

## 역할

KICETIC 대시보드의 각 기능 모듈을 표시하는 React 패널 컴포넌트 모음.
각 파일이 하나의 기능 모듈 패널에 대응한다.

---

## 파일 구성

| 파일 | 담당 패널 | 백엔드 연결 |
|------|-----------|-------------|
| `overview-panel.tsx` | Home — 전체 파이프라인 상태, 핵심 지표 | 없음 (정적 데이터) |
| `research-panel.tsx` | 1. Multi-Agent — 실시간 SSE 토론 스트리밍 | `POST /api/projects/{id}/discussions/stream` |
| `optimizer-panel.tsx` | 2. BO — 트라이얼 이력, 추천 파라미터, 제출 | `GET/POST /api/optimizer/*` |
| `surrogate-panel.tsx` | 3. Surrogate — 대리 모델 예측 결과 표시 | 현재 mock (정적 데이터) |
| `physical-ai-panel.tsx` | 4. Physical AI — Digital Twin 상태 및 액션 | 현재 mock (정적 데이터) |
| `xai-panel.tsx` | 5. X.AI — 청중별 의사결정 요약 | `GET /api/xai/summary` |

---

## 실제 API 연결 현황

```
research-panel.tsx   ← SSE 스트리밍 연결 완료 (use_mock=false 일 때)
optimizer-panel.tsx  ← Optuna API 연결 완료
xai-panel.tsx        ← GET /xai/summary 연결 (mock 응답)
overview-panel.tsx   ← 정적 데이터 (dashboard-data.tsx)
surrogate-panel.tsx  ← 정적 데이터 (dashboard-data.tsx)
physical-ai-panel.tsx ← 정적 데이터 (dashboard-data.tsx)
```

---

## mock 모드 전환

`apps/web/lib/mock-toggle.ts` 의 `USE_MOCK` 값으로 전체 전환.

```typescript
// mock-toggle.ts
export const USE_MOCK = false   // false = 실제 API 사용
                                // true  = 더미 데이터 반환
```

---

## 공통 UI 컴포넌트

`apps/web/components/ui/` 에서 가져다 쓴다:

| 컴포넌트 | 용도 |
|----------|------|
| `SurfaceCard` | 패널 카드 컨테이너 |
| `StatusBadge` | 상태 뱃지 (positive / warning / neutral) |
| `ActionButton` | 액션 버튼 |

---

## 패널 데이터 흐름

```
lib/dashboard-data.tsx
  └─ dashboardData 객체 (정적 초기값)
       └─ renderPanel(key) → 각 Panel 컴포넌트에 props 전달

API 호출이 필요한 패널은 컴포넌트 내부에서 직접 lib/api-client.ts 호출
```

---

## 새 패널 추가 시

1. 이 폴더에 `{name}-panel.tsx` 생성
2. `lib/dashboard-data.tsx` 의 `panels` 배열에 nav 항목 추가
3. `renderPanel()` switch에 case 추가
4. `packages/shared/src/contracts.ts` 에 `PanelKey` 타입 확장
