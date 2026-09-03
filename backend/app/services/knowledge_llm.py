"""
LLM layer for the knowledge base chat: query expansion (optional) and
grounded answer composition. Mirrors the OpenAI client pattern used in
triage_agent/service.py.
"""

from __future__ import annotations

import logging
from typing import Any

from openai import OpenAI

from app.core.config import settings

logger = logging.getLogger(__name__)

_client = OpenAI(api_key=settings.openai_api_key)

_NO_INFO_MESSAGE = (
    "I don't have that information in the HR knowledge base right now. "
    "Please reach out to HR directly for help with this."
)

_EXPANSION_SYSTEM_PROMPT = (
    "You expand a user's question into a short set of search keywords and close "
    "synonyms for a full-text search engine. Resolve any pronouns using the "
    "conversation history. Separate every single keyword or synonym with the "
    "word 'OR' (e.g. 'keyword1 OR keyword2 OR keyword3'). Respond with ONLY "
    "this 'OR' separated list, nothing else — no quotes, no explanation."
)

_ANSWER_SYSTEM_PROMPT = (
    "You are an HR assistant answering employee questions about company "
    "policies and documents. Answer ONLY using the CONTEXT provided below. "
    "If the user simply greets you (e.g. 'hello', 'good morning', 'hi'), politely greet them back. "
    "For all other questions, if the answer is not contained in the context, say plainly that you "
    "don't have that information and suggest contacting HR — do not guess "
    "or use outside knowledge. Be concise and natural, like a helpful "
    "colleague, not a document dump. When you use a fact from a source, "
    "mention that source's document title in your answer."
)

_HISTORY_TURNS_FOR_ANSWER = 6
_HISTORY_TURNS_FOR_EXPANSION = 4


def _history_to_messages(history: list[dict[str, str]], max_turns: int) -> list[dict[str, str]]:
    """history entries look like {'role': 'user'|'assistant', 'content': str}."""
    trimmed = history[-max_turns:] if history else []
    return [{"role": h["role"], "content": h["content"]} for h in trimmed]


def expand_query(question: str, history: list[dict[str, str]]) -> str:
    """
    Returns a keyword/synonym expansion of `question` for full-text search.
    If knowledge_query_expansion is off, or the call fails for any reason,
    returns the original question unchanged — this step must never block
    the chat.
    """
    if not settings.knowledge_query_expansion:
        return question

    try:
        messages = [{"role": "system", "content": _EXPANSION_SYSTEM_PROMPT}]
        messages.extend(_history_to_messages(history, _HISTORY_TURNS_FOR_EXPANSION))
        messages.append({"role": "user", "content": question})

        response = _client.chat.completions.create(
            model=settings.knowledge_answer_model,
            messages=messages,
            temperature=0,
            max_tokens=64,
        )
        expanded = (response.choices[0].message.content or "").strip()
        return expanded or question
    except Exception as exc:  # noqa: BLE001 - never block the chat on this step
        logger.warning("expand_query failed, using original question: %s", exc)
        return question


def _build_context(chunks: list[dict[str, Any]]) -> str:
    blocks = []
    for chunk in chunks:
        version_suffix = f" (v{chunk['version']})" if chunk.get("version") else ""
        blocks.append(
            f"[Source: {chunk['title']}{version_suffix}]\n{chunk['content']}"
        )
    return "\n\n---\n\n".join(blocks)


def _build_citations(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """De-duplicate chunks down to one citation per source document."""
    seen: set[Any] = set()
    citations: list[dict[str, Any]] = []
    for chunk in chunks:
        doc_id = chunk["document_id"]
        if doc_id in seen:
            continue
        seen.add(doc_id)
        snippet = chunk["content"]
        citations.append(
            {
                "title": chunk["title"],
                "version": chunk.get("version"),
                "file_url": chunk["file_url"],
                "snippet": snippet[:280] + ("..." if len(snippet) > 280 else ""),
            }
        )
    return citations


def answer_question(
    question: str,
    chunks: list[dict[str, Any]],
    history: list[dict[str, str]],
) -> tuple[str, list[dict[str, Any]]]:
    context = _build_context(chunks) if chunks else "No relevant context found."

    try:
        messages = [
            {
                "role": "system",
                "content": f"{_ANSWER_SYSTEM_PROMPT}\n\nCONTEXT:\n{context}",
            }
        ]
        messages.extend(_history_to_messages(history, _HISTORY_TURNS_FOR_ANSWER))
        messages.append({"role": "user", "content": question})

        response = _client.chat.completions.create(
            model=settings.knowledge_answer_model,
            messages=messages,
            temperature=0.2,
            max_tokens=600,
        )
        answer = (response.choices[0].message.content or "").strip()
        if not answer:
            return _NO_INFO_MESSAGE, []

        return answer, _build_citations(chunks)
    except Exception as exc:  # noqa: BLE001
        logger.error("answer_question LLM call failed: %s", exc)
        return (
            "I'm having trouble answering right now — please try again in a "
            "moment, or contact HR directly.",
            [],
        )