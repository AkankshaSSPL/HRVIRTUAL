"""
Standalone knowledge-base chat + management endpoints. Decoupled from the
LangGraph coordinator — this is its own small pipeline:
  retrieve (tsvector) -> compose (gpt-4o-mini) -> persist -> respond.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_permissions
from app.core.config import settings
from app.models.company.models import HRDocument
from app.models.knowledge.models import KnowledgeChatMessage, KnowledgeChunk
from app.services.knowledge_index import index_document, remove_document_index
from app.services.knowledge_llm import answer_question, expand_query
from app.services.knowledge_retrieval import search_chunks

logger = logging.getLogger(__name__)
router = APIRouter()

_HISTORY_TURNS_FOR_CONTEXT = 6
_HISTORY_LIMIT = 50


# ---------- schemas ----------

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)


class CitationOut(BaseModel):
    title: str
    version: str | None = None
    file_url: str
    snippet: str


class ChatResponse(BaseModel):
    answer: str
    citations: list[CitationOut]
    used_documents: int


class HistoryMessageOut(BaseModel):
    role: str
    content: str
    citations: list[dict[str, Any]] | None = None
    created_at: Any


class DocumentSearchableUpdate(BaseModel):
    searchable: bool


class KnowledgeDocumentOut(BaseModel):
    id: UUID
    title: str
    category: str | None = None
    searchable: bool
    indexed_at: Any
    chunk_count: int


# ---------- chat ----------

@router.post("/chat", response_model=ChatResponse)
def chat(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    _: None = Depends(require_permissions("knowledge:chat")),
):
    history_rows = (
        db.query(KnowledgeChatMessage)
        .filter(KnowledgeChatMessage.user_id == current_user.id)
        .order_by(KnowledgeChatMessage.created_at.desc())
        .limit(_HISTORY_TURNS_FOR_CONTEXT)
        .all()
    )
    history = [
        {"role": row.role, "content": row.content} for row in reversed(history_rows)
    ]

    expanded = expand_query(payload.message, history)

    chunks = search_chunks(
        db,
        query=expanded,
        candidate_k=settings.knowledge_candidate_k,
        top_k=settings.knowledge_top_k,
        bm25=settings.knowledge_bm25_rerank,
    )

    answer, citations = answer_question(payload.message, chunks, history)

    db.add(
        KnowledgeChatMessage(
            user_id=current_user.id, role="user", content=payload.message
        )
    )
    db.add(
        KnowledgeChatMessage(
            user_id=current_user.id,
            role="assistant",
            content=answer,
            citations=citations,
        )
    )
    db.commit()

    return ChatResponse(
        answer=answer,
        citations=[CitationOut(**c) for c in citations],
        used_documents=len({c["document_id"] for c in chunks}),
    )


@router.get("/history", response_model=list[HistoryMessageOut])
def get_history(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    _: None = Depends(require_permissions("knowledge:chat")),
):
    rows = (
        db.query(KnowledgeChatMessage)
        .filter(KnowledgeChatMessage.user_id == current_user.id)
        .order_by(KnowledgeChatMessage.created_at.asc())
        .limit(_HISTORY_LIMIT)
        .all()
    )
    return [
        HistoryMessageOut(
            role=row.role,
            content=row.content,
            citations=row.citations,
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.delete("/history", status_code=status.HTTP_204_NO_CONTENT)
def clear_history(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    _: None = Depends(require_permissions("knowledge:chat")),
):
    db.query(KnowledgeChatMessage).filter(
        KnowledgeChatMessage.user_id == current_user.id
    ).delete(synchronize_session=False)
    db.commit()


# ---------- HR management ----------

@router.get("/documents", response_model=list[KnowledgeDocumentOut])
def list_documents(
    db: Session = Depends(get_db),
    _: None = Depends(require_permissions("knowledge:manage")),
):
    chunk_counts = dict(
        db.query(KnowledgeChunk.document_id, func.count(KnowledgeChunk.id))
        .group_by(KnowledgeChunk.document_id)
        .all()
    )

    documents = (
        db.query(HRDocument).filter(HRDocument.deleted_at.is_(None)).all()
    )

    return [
        KnowledgeDocumentOut(
            id=doc.id,
            title=doc.title,
            category=getattr(doc, "category", None),
            searchable=doc.searchable,
            indexed_at=doc.indexed_at,
            chunk_count=chunk_counts.get(doc.id, 0),
        )
        for doc in documents
    ]


@router.post("/documents/{document_id}/reindex")
def reindex_document(
    document_id: UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: None = Depends(require_permissions("knowledge:manage")),
):
    document = db.query(HRDocument).filter(HRDocument.id == document_id).first()
    if document is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")

    background_tasks.add_task(_reindex_task, document_id)
    return {"status": "reindexing"}


@router.patch("/documents/{document_id}", response_model=KnowledgeDocumentOut)
def update_document_searchable(
    document_id: UUID,
    payload: DocumentSearchableUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: None = Depends(require_permissions("knowledge:manage")),
):
    document = db.query(HRDocument).filter(HRDocument.id == document_id).first()
    if document is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")

    document.searchable = payload.searchable
    db.add(document)
    db.commit()
    db.refresh(document)

    if payload.searchable:
        background_tasks.add_task(_reindex_task, document_id)
    else:
        remove_document_index(db, document_id)
        document.indexed_at = None
        db.add(document)
        db.commit()
        db.refresh(document)

    chunk_count = (
        db.query(func.count(KnowledgeChunk.id))
        .filter(KnowledgeChunk.document_id == document_id)
        .scalar()
        or 0
    )

    return KnowledgeDocumentOut(
        id=document.id,
        title=document.title,
        category=getattr(document, "category", None),
        searchable=document.searchable,
        indexed_at=document.indexed_at,
        chunk_count=chunk_count,
    )


def _reindex_task(document_id: UUID) -> None:
    """BackgroundTasks entry point: opens its own DB session."""
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        document = db.query(HRDocument).filter(HRDocument.id == document_id).first()
        if document is not None:
            index_document(db, document)
    finally:
        db.close()