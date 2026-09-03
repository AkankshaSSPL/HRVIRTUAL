"""
Knowledge base retrieval: Postgres native full-text search (tsvector +
ts_rank_cd), with an optional in-memory BM25 re-rank of the candidate set.
No embeddings, no vector DB.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

_CANDIDATE_QUERY = text(
    """
    SELECT
        c.id            AS chunk_id,
        c.document_id   AS document_id,
        c.content       AS content,
        c.chunk_index   AS chunk_index,
        d.title         AS title,
        d.version       AS version,
        d.file_url      AS file_url,
        ts_rank_cd(c.content_tsv, tsq) AS rank
    FROM knowledge_chunks c
    JOIN hr_documents d ON d.id = c.document_id
    CROSS JOIN LATERAL websearch_to_tsquery('english', :query) AS tsq
    WHERE d.deleted_at IS NULL
      AND d.searchable = true
      AND c.content_tsv @@ tsq
    ORDER BY rank DESC
    LIMIT :candidate_k
    """
)

# websearch_to_tsquery returns an empty tsquery (matches nothing) for inputs
# that are pure stop-words/punctuation. Fall back to plainto_tsquery, which
# is more permissive, in that case.
_FALLBACK_QUERY = text(
    """
    SELECT
        c.id            AS chunk_id,
        c.document_id   AS document_id,
        c.content       AS content,
        c.chunk_index   AS chunk_index,
        d.title         AS title,
        d.version       AS version,
        d.file_url      AS file_url,
        ts_rank_cd(c.content_tsv, tsq) AS rank
    FROM knowledge_chunks c
    JOIN hr_documents d ON d.id = c.document_id
    CROSS JOIN LATERAL plainto_tsquery('english', :query) AS tsq
    WHERE d.deleted_at IS NULL
      AND d.searchable = true
      AND c.content_tsv @@ tsq
    ORDER BY rank DESC
    LIMIT :candidate_k
    """
)


def _rows_to_dicts(rows) -> list[dict[str, Any]]:
    return [
        {
            "chunk_id": row.chunk_id,
            "document_id": row.document_id,
            "content": row.content,
            "chunk_index": row.chunk_index,
            "title": row.title,
            "version": row.version,
            "file_url": row.file_url,
            "rank": float(row.rank),
        }
        for row in rows
    ]


def _bm25_rerank(candidates: list[dict[str, Any]], query: str, top_k: int) -> list[dict[str, Any]]:
    try:
        from rank_bm25 import BM25Okapi
    except ImportError:  # pragma: no cover - dependency is expected to be present
        logger.warning("rank-bm25 not installed; falling back to ts_rank ordering")
        return candidates[:top_k]

    tokenized_corpus = [c["content"].lower().split() for c in candidates]
    bm25 = BM25Okapi(tokenized_corpus)
    scores = bm25.get_scores(query.lower().split())

    ranked = sorted(zip(candidates, scores), key=lambda pair: pair[1], reverse=True)
    result = []
    for candidate, score in ranked[:top_k]:
        candidate = {**candidate, "rank": float(score)}
        result.append(candidate)
    return result


def search_chunks(
    db: Session,
    query: str,
    candidate_k: int,
    top_k: int,
    bm25: bool = False,
) -> list[dict[str, Any]]:
    """
    Retrieve the top_k most relevant KnowledgeChunk rows for `query`.

    1. Rank candidate_k chunks via websearch_to_tsquery + ts_rank_cd
       (falling back to plainto_tsquery if that yields nothing).
    2. Optionally re-score those candidates in-memory with BM25 and keep
       the new top_k; otherwise just slice the first top_k by ts_rank.

    Returns [] when nothing matches — the caller (answer_question) is
    responsible for telling the LLM to say "I don't have that information".
    """
    query = (query or "").strip()
    if not query:
        return []

    rows = db.execute(
        _CANDIDATE_QUERY, {"query": query, "candidate_k": candidate_k}
    ).fetchall()

    if not rows:
        rows = db.execute(
            _FALLBACK_QUERY, {"query": query, "candidate_k": candidate_k}
        ).fetchall()

    candidates = _rows_to_dicts(rows)
    if not candidates:
        return []

    if bm25:
        return _bm25_rerank(candidates, query, top_k)

    return candidates[:top_k]