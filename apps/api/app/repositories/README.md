# repositories — 공유 데이터 접근 레이어

## 역할

multiagent, bo, xai, projects 모듈 모두가 공유하는 데이터 접근 레이어.
SQLite CRUD와 JSON 시드 파일 로드를 담당한다.

> **주의**: 이 폴더를 수정하면 모든 모듈에 영향을 준다.
> 변경 전 반드시 multiagent 담당자와 조율하라.

---

## 파일 구성

| 파일 | 역할 |
|------|------|
| `project_repository.py` | SQLite CRUD — projects, agents, chunks, entities, relationships, discussions 테이블 |
| `discussion_knowledge_repository.py` | JSON 시드 파일 로드 — `data/discussion_knowledge/*.json` |

---

## ProjectRepository 주요 메서드

```python
# 읽기
list_projects()           → list[dict]
get_project(project_id)   → dict  # 없으면 KeyError
list_agents(project_id)   → list[dict]
list_chunks(project_id)   → list[dict]
list_entities(project_id) → list[dict]
list_relationships(project_id) → list[dict]
list_discussions()        → list[Discussion]

# 쓰기
save_discussion(discussion) → Discussion
delete_discussion(discussion_id, project_id?) → bool

# 시드
import_seed_data()    # JSON 시드 → DB 최초 적재 (서버 기동 시 자동 호출)
```

---

## 데이터베이스 구조

```
data/kicetic/projects.db (SQLite)
  projects        — 프로젝트 메타데이터 (현재: proj-ai-research-001 1개)
  agents          — 에이전트 정의 (현재: 20개 MPCVD 전문가)
  chunks          — 지식 청크 (현재: 약 6000개 다이아몬드 논문 발췌)
  entities        — 개체 (물질, 장비, 파라미터 등)
  relationships   — 개체 간 관계
  discussions     — 저장된 토론 결과
  documents       — 문서 메타데이터
  reports         — 리포트 (현재 미사용)
```

---

## 시드 데이터 경로

```
data/discussion_knowledge/
  projects.json   — 프로젝트 정의 (project_id: proj-ai-research-001)
  agents.json     — 초기 에이전트 4개 (DB에 20개 있으면 시드는 무시됨)
  chunks.json     — 초기 chunk 4개 (DB에 데이터 있으면 무시됨)
```

시드 적재 규칙: `projects` 테이블 row 수 > 0 이면 bootstrap을 건너뛴다.
(DB에 이미 데이터가 있으면 JSON 시드는 사용되지 않는다.)

---

## 이 폴더에서 작업할 경우

- 새 테이블 추가: `_run_schema_initialization()` 의 `executescript` 에 DDL 추가
- 새 조회 메서드: `list_*` 패턴으로 추가하고 `_*_from_row()` 정적 메서드도 작성
- `connection(read_only=True)` 로 읽기, `connection()` 으로 쓰기 (thread-safe)
