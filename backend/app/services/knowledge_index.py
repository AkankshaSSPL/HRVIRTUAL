"""
Knowledge base indexing service.

Chunks extracted document text into overlapping windows and (re)builds the
`knowledge_chunks` rows for a given `HRDocument`. No embeddings — the
`content_tsv` column on `KnowledgeChunk` is a Postgres GENERATED column and
fills itself; we only ever write `content`.
"""

from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from sqlalchemy.orm import Session

from app.agents.resume_parser_agent.parser import extract_text
from app.models.company.models import HRDocument
from app.models.knowledge.models import KnowledgeChunk

logger = logging.getLogger(__name__)

# Extensions we know extract_text() can handle. Anything else is skipped
# with a warning rather than raising, so a bad upload never blocks indexing
# of the rest of the library.
_SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md"}

_CONTENT_TYPE_BY_EXT = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
    ".md": "text/markdown",
}


class KnowledgeIndexError(Exception):
    """Raised for indexing failures the caller should be aware of (but not crash on)."""


def chunk_text(text: str, size: int, overlap: int) -> list[str]:
    """
    Split `text` into ~`size`-character chunks on paragraph/sentence
    boundaries, carrying an `overlap`-character tail from the previous
    chunk into the next one so retrieval doesn't lose context at a cut.

    Dependency-free — no langchain text splitters.
    """
    if not text or not text.strip():
        return []

    if size <= 0:
        raise ValueError("chunk size must be positive")
    if overlap < 0 or overlap >= size:
        overlap = min(max(overlap, 0), size // 2)

    # Normalize whitespace: collapse runs of blank lines to a single
    # paragraph break, collapse intra-paragraph whitespace.
    normalized = re.sub(r"\r\n?", "\n", text)
    normalized = re.sub(r"[ \t]+", " ", normalized)
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", normalized) if p.strip()]

    if not paragraphs:
        # No blank-line paragraphs found (e.g. extractor returned one big
        # blob) — fall back to splitting on single newlines.
        paragraphs = [p.strip() for p in normalized.split("\n") if p.strip()]

    chunks: list[str] = []
    current = ""

    def flush(carry_overlap: bool) -> None:
        nonlocal current
        if current.strip():
            chunks.append(current.strip())
        if carry_overlap and current:
            current = current[-overlap:] if overlap else ""
        else:
            current = ""

    for para in paragraphs:
        # A single paragraph longer than `size` on its own: hard-split it
        # on sentence boundaries so we never emit an oversized chunk.
        if len(para) > size:
            sentences = re.split(r"(?<=[.!?])\s+", para)
            for sentence in sentences:
                if len(current) + len(sentence) + 1 > size:
                    flush(carry_overlap=True)
                current = f"{current} {sentence}".strip() if current else sentence
            continue

        if len(current) + len(para) + 2 > size:
            flush(carry_overlap=True)

        current = f"{current}\n\n{para}".strip() if current else para

    flush(carry_overlap=False)
    return chunks


def _resolve_disk_path(file_url: str) -> Path:
    """
    document.file_url is stored as an app-relative URL, e.g.
    '/uploads/documents/<uuid>.pdf'. On disk that's 'uploads/documents/<uuid>.pdf'
    relative to the backend working directory.
    """
    relative = file_url.lstrip("/")
    return Path(relative)


def index_document(db: Session, document: HRDocument) -> int:
    """
    (Re)index one HR document: extract text, chunk it, replace its
    KnowledgeChunk rows, stamp indexed_at. Returns the number of chunks
    written (0 if the document was skipped).
    """
    if not document.file_url:
        logger.warning("Skipping index for document %s: no file_url", document.id)
        return 0

    disk_path = _resolve_disk_path(document.file_url)
    extension = disk_path.suffix.lower()

    if extension not in _SUPPORTED_EXTENSIONS:
        logger.warning(
            "Skipping index for document %s: unsupported extension %s",
            document.id,
            extension,
        )
        return 0

    if not disk_path.exists():
        logger.warning(
            "Skipping index for document %s: file missing on disk at %s",
            document.id,
            disk_path,
        )
        return 0

    content_type = _CONTENT_TYPE_BY_EXT[extension]

    try:
        text = extract_text(disk_path, content_type)
    except Exception as exc:  # noqa: BLE001 - deliberately broad; see module docstring
        logger.warning(
            "Skipping index for document %s: text extraction failed (%s)",
            document.id,
            exc,
        )
        return 0

    if not text or not text.strip():
        logger.warning(
            "Skipping index for document %s: extractor returned no text "
            "(likely a scanned/image-only file)",
            document.id,
        )
        return 0

    from app.core.config import settings  # local import avoids top-level cycle risk

    chunks = chunk_text(text, settings.knowledge_chunk_size, settings.knowledge_chunk_overlap)

    # Replace existing chunks for this document.
    db.query(KnowledgeChunk).filter(KnowledgeChunk.document_id == document.id).delete(
        synchronize_session=False
    )

    for idx, chunk_content in enumerate(chunks):
        db.add(
            KnowledgeChunk(
                document_id=document.id,
                chunk_index=idx,
                content=chunk_content,
            )
        )

    document.indexed_at = datetime.now(timezone.utc)
    db.add(document)
    db.commit()

    logger.info("Indexed document %s: %d chunks", document.id, len(chunks))
    return len(chunks)


def remove_document_index(db: Session, document_id: UUID) -> None:
    """Delete all KnowledgeChunk rows for a document (unpublish/delete path)."""
    db.query(KnowledgeChunk).filter(KnowledgeChunk.document_id == document_id).delete(
        synchronize_session=False
    )
    db.commit()
    logger.info("Removed knowledge index for document %s", document_id)


def index_document_task(document_id: UUID) -> None:
    """
    Entry point for BackgroundTasks: opens its own DB session rather than
    reusing the request-scoped one (which closes when the request returns).
    """
    from app.db.session import SessionLocal  # local import: avoid app-startup cycle

    db = SessionLocal()
    try:
        document = db.query(HRDocument).filter(HRDocument.id == document_id).first()
        if document is None:
            logger.warning("index_document_task: document %s not found", document_id)
            return
        index_document(db, document)
    finally:
        db.close()