from __future__ import annotations

import logging
from typing import Any, Literal
from pydantic import BaseModel, Field

from app.core.config import settings

logger = logging.getLogger(__name__)

_PLACEHOLDER_KEYS = {"", "your_openai_api_key_here", "sk-replace-me"}

def llm_available() -> bool:
    key = (settings.openai_api_key or "").strip()
    return bool(key) and key not in _PLACEHOLDER_KEYS

class EmployeeCommandExtraction(BaseModel):
    """Extraction of an HR employee command, primarily for updates, queries, and lookups."""
    
    action: Literal[
        "search", "list", "show_profile", "show_department", "show_manager", 
        "create", "update", "delete", "update_salary", "change_manager", 
        "change_department", "deactivate", "unknown"
    ] = Field(..., description="The main intent of the command. For generic field updates like phone or email, use 'update'.")
    
    target_employee_name: str | None = Field(None, description="The name of the employee this command applies to.")
    
    phone: str | None = Field(None, description="A phone number to update for the employee.")
    official_email: str | None = Field(None, description="An email address to update for the employee.")
    
    current_salary: float | None = Field(None, description="The new salary amount to set.")
    
    manager_name: str | None = Field(None, description="The name of the new reporting manager to assign.")
    department_name: str | None = Field(None, description="The name of the new department to assign.")


def llm_extract_employee_command(command: str) -> dict[str, Any]:
    """Extract employee command details from a natural-language message. Raises on failure."""
    from langchain_openai import ChatOpenAI
    
    model = ChatOpenAI(model=settings.openai_intent_model, api_key=settings.openai_api_key, temperature=0)
    structured = model.with_structured_output(EmployeeCommandExtraction)
    
    prompt = f"""You extract employee operations and updates from an HR user's message.

Rules:
- Identify the correct 'action'. If it's a general update (like phone or email), use 'update'.
- Extract the 'target_employee_name' being operated on. 
- Do NOT confuse the target employee with a manager. E.g., "change John's manager to Alice" -> target: 'John', manager_name: 'Alice', action: 'change_manager'.
- For salary changes, use 'update_salary'. For department changes, use 'change_department'.
- Return ONLY fields explicitly stated in this message. Leave everything else null.
- Extract salary as a plain number: "60k" -> 60000, "6 lakh" -> 600000.
- Extract emails and phone numbers exactly as written.

Message:
<message>{command}</message>"""
    
    result: EmployeeCommandExtraction = structured.invoke(prompt)
    data = result.model_dump()
    extracted = {key: value for key, value in data.items() if value not in (None, "", [])}
    logger.info("LLM employee command extraction: %s", extracted)
    return extracted
