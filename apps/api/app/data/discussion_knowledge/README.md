# discussion_knowledge — 시드 데이터

## 역할

서버 **최초 기동 시** SQLite DB가 비어 있을 때 초기 데이터를 적재하는 JSON 시드 파일 모음.
DB에 이미 데이터가 있으면 이 파일들은 무시된다.

---

## 파일 구성

| 파일 | 내용 | 현재 project_id |
|------|------|-----------------|
| `projects.json` | 프로젝트 메타데이터 (목표, 지표, 키워드) | `proj-ai-research-001` |
| `agents.json` | 초기 에이전트 4개 (Materials Researcher 등) | `proj-ai-research-001` |
| `chunks.json` | 초기 지식 청크 4개 (MPCVD 논문 발췌) | `proj-ai-research-001` |

---

## 시드 적재 규칙

```
서버 기동
  └─ ProjectRepository.__init__()
       └─ _bootstrap_from_seed()
            ├─ projects 테이블 row 수 확인
            ├─ row 수 > 0  →  건너뜀 (DB에 이미 데이터 있음)
            └─ row 수 = 0  →  import_seed_data() 실행
```

현재 DB에는 이미 **20개 에이전트**, **약 6000개 chunk** 가 있으므로
이 시드 파일들은 실제로 사용되지 않는다.

---

## 시드 파일 수정 시 주의사항

- `project_id` 는 반드시 `proj-ai-research-001` 로 통일
- DB를 리셋하지 않는 한 변경 사항이 반영되지 않는다
- DB를 직접 리셋하려면: `data/kicetic/projects.db` 파일 삭제 후 서버 재시작

---

## agents.json 필드 설명

```json
{
  "agent_id": "고유 ID",
  "project_id": "proj-ai-research-001",
  "name": "표시 이름",
  "stance": "mechanism | scalability | decision | synthesis",
  "focus": "이 에이전트가 집중하는 연구 관점",
  "evidence_focus": ["검증 우선 항목 키워드"],
  "retrieval_terms": ["chunk 검색 시 가중치 부여 키워드"],
  "knowledge_scope": ["이 에이전트의 지식 범위"],
  "next_action_hint": "토론 후 다음 단계 힌트"
}
```

## chunks.json 필드 설명

```json
{
  "chunk_id": "고유 ID",
  "project_id": "proj-ai-research-001",
  "title": "섹션 제목",
  "source": "paper | experiment-log | internal-db",
  "year": 2024,
  "summary": "핵심 요약 (토론에 직접 사용됨)",
  "excerpt": "원문 발췌 (에이전트 메시지에 인용됨)",
  "keywords": ["키워드 목록"],
  "entity_keys": ["연결된 entity 키 목록"]
}
```
