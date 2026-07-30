"""LLM prompt for onboarding agent."""

import logging
from typing import Optional

from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

from app.core.config import settings

logger = logging.getLogger(__name__)

llm_model = ChatOpenAI(
    model=settings.openai_intent_model,
    api_key=settings.openai_api_key,
    temperature=0.3,
)


def llm_compose_reply(
    *,
    name: str,
    percent: float,
    section_label: str,
    ask_for: str,
    just_captured: str,
    completed: bool,
    history: Optional[list[dict]] = None,
) -> str:
    """Generate a friendly, conversational response for the onboarding flow."""
    system_msg = (
        "You are a warm, concise HR onboarding assistant. "
        f"Current progress: {percent:.0f}% completed.\n"
        f"Next required field: {ask_for}."
    )
    if just_captured:
        system_msg += f"\nJust captured: {just_captured}."

    messages = [("system", system_msg)]
    if history:
        # Include the last 4 messages (2 turns) for context
        for msg in history[-4:]:
            messages.append((msg["role"], msg["content"]))

    # The user message is the prompt asking for the next field
    messages.append(("user", f"Please provide your {ask_for}:"))
    
    prompt = ChatPromptTemplate.from_messages(messages)
    chain = prompt | llm_model
    response = chain.invoke({})
    return response.content