# Knowledge Base RAG — HR Docs Chat for Employees (HRVIRTUAL)

**Branch:** `new_RBAC`
**Timeline target:** ~2 days. Embedding-free by design.

## Context

HR needs to upload official documents (policies, handbooks) and let employees **chat**
with them in natural language. The repo already has HR document upload (`HRDocument` +
`POST /hr-documents`), PDF/DOCX text extraction (`resume_parser_agent/parser.py`),
OpenAI (`gpt-4o-mini`) wired, RBAC, and chat UI components — but **no retrieval layer**.

**Chosen path (confirmed with user):**
- **Retriever:** PostgreSQL **native full-text search** (`tsvector` + `ts_rank_cd`) — no
  embeddings, no vector DB, no extension. Deterministic, instantly re-indexable.
- **Optional BM25 re-rank:** `rank-bm25` (already a dependency) re-scores the top-N
  tsvector candidates in memory. Behind a config flag, **off by default**.
- **Docs:** binary uploads (PDF/DOCX) + DB metadata — reuse the existing `HRDocument` flow.
- **Architecture:** **standalone** `/knowledge` service + page, decoupled from the
  LangGraph coordinator.
- **Access:** employees chat (`knowledge:chat`); HR/Admin manage docs (`knowledge:manage`).
  Both dynamic via existing RBAC.

**Why this answers naturally without embeddings:** retrieval only needs to find the right
chunks (tsvector handles stemming + stop-words via `websearch_to_tsquery('english', …)`;
an optional LLM query-expansion step covers synonyms). The **LLM composes the natural
answer** from the retrieved text with citations — understanding lives in the model, not a
vector index.

---

## Reused (no rewrite)

| Utility | Path |
|---|---|
| `extract_text(path, content_type)` PDF/DOCX → text | `backend/app/agents/resume_parser_agent/parser.py` |
| `HRDocument` model + `/hr-documents` upload → `uploads/documents/{uuid}.ext` | `backend/app/api/v1/endpoints/hr_documents.py`, `backend/app/models/company/models.py` |
| OpenAI client pattern (`OpenAI(api_key=settings.openai_api_key)` → `chat.completions`) | `backend/app/agents/triage_agent/service.py` |
| `require_permissions()` dep | `backend/app/api/deps.py` |
| RBAC seed (`PERMISSIONS`, `ROLE_PERMISSION_CODES`, `seed_auth_data`) | `backend/app/services/auth_service.py`, `scripts/seed_auth.py` |
| Chat bubbles (`UserMessageBubble`, `AgentMessageBubble`) | `frontend/src/components/ui-system/ChatMessage.tsx` |

---

## Config additions

**File:** `backend/app/core/config.py` — add to `Settings`:

```python
# Knowledge base RAG
knowledge_answer_model: str = Field(default="gpt-4o-mini", validation_alias="KNOWLEDGE_ANSWER_MODEL")
knowledge_top_k: int = Field(default=5, validation_alias="KNOWLEDGE_TOP_K")            # chunks sent to the LLM
knowledge_candidate_k: int = Field(default=25, validation_alias="KNOWLEDGE_CANDIDATE_K")  # tsvector candidates
knowledge_chunk_size: int = Field(default=800, validation_alias="KNOWLEDGE_CHUNK_SIZE")
knowledge_chunk_overlap: int = Field(default=150, validation_alias="KNOWLEDGE_CHUNK_OVERLAP")
knowledge_query_expansion: bool = Field(default=True, validation_alias="KNOWLEDGE_QUERY_EXPANSION")
knowledge_bm25_rerank: bool = Field(default=False, validation_alias="KNOWLEDGE_BM25_RERANK")
```

---

## STEP 1 — DB models & migration

### 1a. HRDocument — two columns for indexing

**File:** `backend/app/models/company/models.py` (class `HRDocument`, raw `Column` style to match):

```python
searchable = Column(Boolean, nullable=False, default=True, server_default="true")
indexed_at = Column(DateTime(timezone=True), nullable=True)
```

`searchable=True` means "employees can chat with this doc". HR can untick drafts.

### 1b. KnowledgeChunk — the tsvector index (new)

**File:** `backend/app/models/company/models.py` (or a new `knowledge/models.py`)

```python
from sqlalchemy import Computed, Index, Text
from sqlalchemy.dialects.postgresql import TSVECTOR

class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"
    __table_args__ = (
        Index("ix_knowledge_chunks_tsv", "content_tsv", postgresql_using="gin"),
        Index("ix_knowledge_chunks_document_id", "document_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("hr_documents.id", ondelete="CASCADE"), nullable=False)
    chunk_index = Column(Integer, nullable=False, default=0)
    content = Column(Text, nullable=False)
    # Auto-maintained generated column — no triggers needed
    content_tsv = Column(TSVECTOR, Computed("to_tsvector('english', content)", persisted=True))
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    document = relationship("HRDocument")
```

### 1c. KnowledgeChatMessage — standalone chat history (new)

Kept separate from `ConversationSession` (which is single-active-per-user and owned by the
coordinator) so the knowledge chat is fully decoupled.

```python
class KnowledgeChatMessage(Base):
    __tablename__ = "knowledge_chat_messages"
    __table_args__ = (Index("ix_knowledge_chat_user_created", "user_id", "created_at"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(String, nullable=False)          # "user" | "assistant"
    content = Column(Text, nullable=False)
    citations = Column(JSONB, nullable=True)        # [{title, version, file_url, snippet}]
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
```

### 1d. Register + migrate

- Import both new models in `backend/app/db/base.py`.
- `alembic revision --autogenerate -m "add_knowledge_base_tables"`.
- **Manually verify** the migration emits the generated `content_tsv` column and the GIN
  index (autogenerate can miss `Computed`/GIN). If absent, add:
  ```python
  op.execute("ALTER TABLE knowledge_chunks ADD COLUMN content_tsv tsvector "
             "GENERATED ALWAYS AS (to_tsvector('english', content)) STORED")
  op.execute("CREATE INDEX ix_knowledge_chunks_tsv ON knowledge_chunks USING gin (content_tsv)")
  ```
- `alembic upgrade head`.

---

## STEP 2 — Indexing service

**File:** `backend/app/services/knowledge_index.py` (new)

```python
def chunk_text(text: str, size: int, overlap: int) -> list[str]:
    """Split on paragraph/sentence boundaries into ~size-char chunks with overlap.
    Simple, dependency-free (no langchain)."""
    # normalize whitespace, accumulate paragraphs up to `size`, carry `overlap` tail.

def index_document(db: Session, document: HRDocument) -> int:
    """(Re)index one HR document. Returns chunk count.
    1. Resolve disk path from document.file_url ('/uploads/documents/x' -> 'uploads/documents/x').
    2. text = extract_text(Path(path), content_type_from_extension)   # reuse parser.py
    3. Delete existing KnowledgeChunk rows for document.id.
    4. Insert chunk rows (chunk_index, content). content_tsv fills itself (generated col).
    5. document.indexed_at = now(); commit.
    Guard: skip if no file_url or unsupported type (log + return 0)."""

def remove_document_index(db: Session, document_id) -> None:
    """Delete all chunks for a document (used on delete/unpublish)."""
```

Wrap extraction in try/except (`ResumeParsingError`) so a scanned/image PDF logs a clear
warning and leaves `indexed_at` null rather than crashing.

---

## STEP 3 — Retrieval service

**File:** `backend/app/services/knowledge_retrieval.py` (new)

```python
def search_chunks(db: Session, query: str, candidate_k: int, top_k: int, bm25: bool) -> list[dict]:
    """
    1. tsq = websearch_to_tsquery('english', query)  (fallback to plainto_tsquery if empty)
    2. SELECT top candidate_k chunks joined to hr_documents WHERE
         d.deleted_at IS NULL AND d.searchable = true AND c.content_tsv @@ tsq
       ORDER BY ts_rank_cd(c.content_tsv, tsq) DESC
    3. If bm25: re-rank those candidates in memory with rank-bm25 over c.content,
       keep top_k; else take first top_k by ts_rank.
    4. Return [{content, title, version, file_url, document_id, rank}] (<= top_k).
    Returns [] when nothing matches — caller tells the LLM to say 'not found'.
    """
```

Raw SQL via `text()` for the ranked query (cleanest for `ts_rank_cd`/`websearch_to_tsquery`).

## STEP 4 — LLM layer (query expansion + answer)

**File:** `backend/app/services/knowledge_llm.py` (new) — mirror the `triage_agent` OpenAI usage.

```python
_client = OpenAI(api_key=settings.openai_api_key)

def expand_query(question: str, history: list[dict]) -> str:
    """If knowledge_query_expansion: one gpt-4o-mini call returns a space-joined set of
    keywords + synonyms for the question (resolving pronouns using last turns).
    Else: return question unchanged. On any error: return question (never block)."""

def answer_question(question: str, chunks: list[dict], history: list[dict]) -> tuple[str, list[dict]]:
    """
    System prompt (strict, grounded):
      - "You are an HR assistant. Answer ONLY from the CONTEXT below.
         If the answer isn't in the context, say you don't have that information and
         suggest contacting HR. Be concise and natural. Cite document titles you used."
    Build CONTEXT from chunks (title + version + content). Include last N history turns.
    Call gpt-4o-mini. Return (answer_text, citations) where citations are the
    de-duplicated source docs actually present in the context
    [{title, version, file_url, snippet}].
    If chunks == []: skip the LLM, return a fixed 'no info / contact HR' message + [].
    """
```

Grounding + the empty-chunks short-circuit are what prevent hallucination.

## STEP 5 — Permissions

**File:** `backend/app/services/auth_service.py`
- `PERMISSIONS`: add `"knowledge:chat": "Chat with HR knowledge base"`,
  `"knowledge:manage": "Manage & index knowledge base documents"`.
- Grant `knowledge:chat` to **Employee, HR, Super Admin**; `knowledge:manage` to **HR,
  Super Admin**.
- Re-run `python -m scripts.seed_auth`.

## STEP 6 — API endpoints (standalone)

**File:** `backend/app/api/v1/endpoints/knowledge.py` (new), prefix `/knowledge`.

```
POST /api/v1/knowledge/chat                     (knowledge:chat)
  Body: { message: str }
  → history = last N KnowledgeChatMessage for current_user
  → q = expand_query(message, history)
  → chunks = search_chunks(db, q, candidate_k, top_k, bm25)
  → answer, citations = answer_question(message, chunks, history)
  → persist user + assistant KnowledgeChatMessage rows
  → returns { answer, citations, used_documents: int }

GET    /api/v1/knowledge/history                (knowledge:chat)
  → last 50 messages for current_user (role, content, citations, created_at)

DELETE /api/v1/knowledge/history                (knowledge:chat)
  → soft/hard delete current_user's messages (fresh conversation)

GET    /api/v1/knowledge/documents              (knowledge:manage)
  → HR view: HRDocuments with { id, title, category, searchable, indexed_at, chunk_count }

POST   /api/v1/knowledge/documents/{id}/reindex (knowledge:manage)
  → BackgroundTasks.add_task(index_document, ...)  → { status: "reindexing" }

PATCH  /api/v1/knowledge/documents/{id}          (knowledge:manage)
  Body: { searchable: bool }
  → toggle chat visibility; if false → remove_document_index; if true → reindex
```

Wire in `backend/app/api/v1/router.py`:
```python
from app.api.v1.endpoints import knowledge
api_router.include_router(knowledge.router, prefix="/knowledge", tags=["knowledge"])
```

## STEP 7 — Auto-index on upload

**File:** `backend/app/api/v1/endpoints/hr_documents.py`
- Add `background_tasks: BackgroundTasks` to `create_hr_document`; after commit, if a file
  was saved, `background_tasks.add_task(index_document, ...)`. (Open a fresh `SessionLocal`
  inside the task — do not reuse the request session.)
- On document delete/soft-delete (wherever HR deletes docs), call `remove_document_index`.

So the moment HR uploads or changes a doc, the chat reflects it — "changeable" satisfied.

## STEP 8 — Frontend

**File:** `frontend/src/services/knowledge.ts` (new) — `sendKnowledgeChat(message)`,
`getKnowledgeHistory()`, `clearKnowledgeHistory()`. Mirror `services/auth.ts` fetch style
with `Authorization: Bearer` from `useAuthStore`.

**File:** `frontend/src/pages/KnowledgePage.tsx` (new) — simple, clean chat:
- Message list reusing `UserMessageBubble` / `AgentMessageBubble`.
- Under each assistant answer, a **Sources** row: chips linking to `file_url` (title + version).
- Input box + send; loading state; "Clear chat" button.
- Empty state: a few example questions ("What is the leave policy?").
- Route `/knowledge` gated by `knowledge:chat` in `frontend/src/routes/router.tsx`
  + sidebar entry (`frontend/src/components/ui-system/Sidebar.tsx`, `permission: "knowledge:chat"`).

**HR management (minimal):** on the existing HR Documents admin surface, add an **Indexed**
status badge (from `indexed_at`), a **Searchable** toggle, and a **Reindex** button calling
the STEP 6 endpoints. No new page required.

---

## Files Changed Summary

```
BACKEND — new
  backend/app/services/knowledge_index.py        chunk_text, index_document, remove_document_index
  backend/app/services/knowledge_retrieval.py    search_chunks (tsvector + optional bm25)
  backend/app/services/knowledge_llm.py          expand_query, answer_question (gpt-4o-mini)
  backend/app/api/v1/endpoints/knowledge.py      chat, history, documents, reindex
  backend/alembic/versions/<ts>_add_knowledge_base_tables.py

BACKEND — modified
  backend/app/core/config.py                     +knowledge_* settings
  backend/app/models/company/models.py           +HRDocument.searchable/indexed_at, +KnowledgeChunk, +KnowledgeChatMessage
  backend/app/db/base.py                         +imports for new models
  backend/app/services/auth_service.py           +knowledge:chat, knowledge:manage
  backend/app/api/v1/endpoints/hr_documents.py   auto-index on upload/delete
  backend/app/api/v1/router.py                    +knowledge router
  backend/requirements.txt                        (rank-bm25 already present — no change)

FRONTEND — new
  frontend/src/services/knowledge.ts
  frontend/src/pages/KnowledgePage.tsx

FRONTEND — modified
  frontend/src/routes/router.tsx                  +/knowledge route (knowledge:chat)
  frontend/src/components/ui-system/Sidebar.tsx   +Knowledge Base nav item
  (HR docs admin surface)                         +Indexed badge, Searchable toggle, Reindex button

REUSED (no change)
  resume_parser_agent/parser.py  extract_text()
  triage_agent OpenAI client pattern
  ChatMessage.tsx bubbles; require_permissions(); seed_auth
```

---

## Verification Checklist

### Backend
```
[ ] alembic upgrade head — knowledge_chunks (with content_tsv GIN) + knowledge_chat_messages exist
    psql: \d knowledge_chunks  → content_tsv tsvector, GENERATED, gin index present
[ ] python -m scripts.seed_auth → knowledge:chat (Employee/HR/Admin), knowledge:manage (HR/Admin)
[ ] Upload an HR policy PDF via POST /hr-documents
    → background index runs → hr_documents.indexed_at set → knowledge_chunks rows created
[ ] psql: SELECT count(*) FROM knowledge_chunks WHERE document_id = '<id>'; > 0
[ ] Direct SQL sanity: websearch_to_tsquery('english','leave policy') matches expected chunks
[ ] POST /knowledge/chat {"message":"how many casual leaves do I get?"} (employee token)
    → grounded answer + citations pointing at the uploaded doc
[ ] POST /knowledge/chat with a question NOT in any doc
    → "I don't have that information… contact HR", citations []  (no hallucination)
[ ] Paraphrase test: "time off entitlement" still retrieves the leave doc (query expansion on)
[ ] PATCH /knowledge/documents/{id} {"searchable":false} → chat no longer uses that doc
[ ] POST /knowledge/documents/{id}/reindex → chunks rebuilt, indexed_at updated
[ ] Manager/other with knowledge:chat → can chat; without knowledge:manage → 403 on reindex
[ ] Toggle KNOWLEDGE_BM25_RERANK=true → still answers; ranking uses bm25 over candidates
```

### Frontend
```
[ ] /knowledge shows chat UI; hidden from nav for roles lacking knowledge:chat
[ ] Ask a question → answer appears with Sources chips linking to the file
[ ] Clear chat empties history (GET /knowledge/history returns [])
[ ] HR docs admin shows Indexed badge + Searchable toggle + Reindex button
```

---

## Phasing (2-day target)

- **Day 1:** STEP 1–4 (models, migration, index, retrieval, LLM) + STEP 5–7 (perms,
  endpoints, auto-index). Verify via curl/psql.
- **Day 2:** STEP 8 frontend + HR reindex controls + end-to-end verification.
  `KNOWLEDGE_BM25_RERANK` stays off unless ranking needs sharpening.
