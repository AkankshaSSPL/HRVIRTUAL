"""
Knowledge base RAG models: the tsvector chunk index and standalone chat
history. Kept in their own module (per plan Step 1b) so they don't need to
be interleaved into the existing company/models.py file — only imported
from it.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.schema import Computed

from app.models.base import Base


class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"
    __table_args__ = (
        Index("ix_knowledge_chunks_tsv", "content_tsv", postgresql_using="gin"),
        Index("ix_knowledge_chunks_document_id", "document_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(
        UUID(as_uuid=True),
        ForeignKey("hr_documents.id", ondelete="CASCADE"),
        nullable=False,
    )
    chunk_index = Column(Integer, nullable=False, default=0)
    content = Column(Text, nullable=False)

    # Auto-maintained generated column — Postgres fills this on insert/update,
    # we never write to it directly.
    content_tsv = Column(
        TSVECTOR, Computed("to_tsvector('english', content)", persisted=True)
    )

    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    document = relationship("HRDocument")


class KnowledgeChatMessage(Base):
    __tablename__ = "knowledge_chat_messages"
    __table_args__ = (
        Index("ix_knowledge_chat_user_created", "user_id", "created_at"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    role = Column(String, nullable=False)  # "user" | "assistant"
    content = Column(Text, nullable=False)
    citations = Column(JSONB, nullable=True)  # [{title, version, file_url, snippet}]
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )