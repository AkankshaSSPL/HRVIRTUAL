"""TriageAgent classifies user commands into a single intent key."""

import json
import logging

from openai import OpenAI

from app.core.config import settings

logger = logging.getLogger(__name__)

CLASSIFY_TOOL = {
    "type": "function",
    "function": {
        "name": "classify_intent",
        "description": "Classify this HR command into exactly one intent.",
        "parameters": {
            "type": "object",
            "properties": {
                "intent": {
                    "type": "string",
                    "enum": [
                        "employee_search", "employee_profile", "employee_confirmation",
                        "employee_update", "employee_deactivate",
                        "change_manager", "change_department",
                        "attendance_summary", "attendance_matrix",
                        "absent_employees", "mark_attendance",
                        "apply_leave", "cancel_leave", "leave_balance", "leave_history",
                        "leave_pending", "leave_approve", "leave_reject",
                        "leave_calendar", "create_leave_type",
                        "create_salary_component", "update_salary_component",
                        "delete_salary_component", "inspect_salary_components",
                        "create_salary_structure", "update_salary_structure",
                        "delete_salary_structure", "inspect_salary_structures",
                        "salary_breakup", "refresh_salary_breakups",
                        "salary_history", "assign_salary", "revise_salary",
                        "generate_payroll", "inspect_payroll",
                        "create_pay_type", "inspect_pay_types", "add_pay_type_rule",
                        "onboarding",
                    ]
                }
            },
            "required": ["intent"],
        },
    },
}

TRIAGE_SYSTEM_PROMPT = """\
You are the intent classifier for VirtualHR, an enterprise HRMS.
Call classify_intent with exactly one intent. Do not answer the user.

--- Priority rules (apply BEFORE normal classification) ---

1. ONBOARDING CONTINUATION
   session active_agent = "onboarding_agent" AND conversation history shows
   agent was collecting onboarding details (asking for email, PAN, bank account,
   seat, department, manager, etc.) AND current message provides that information
   (or is "yes" to send welcome mail) → "onboarding"

2. EMPLOYEE CONFIRMATION
   session active_agent = "employee_agent" AND last assistant message was a
   confirmation/diff card AND current message is one of:
   yes / no / confirm / proceed / apply / save / cancel / "yes update" /
   "do not update" / "don't update" → "employee_confirmation"

3. ONBOARDING STATUS QUERY — not a continuation
   Message asks about status, progress or process of onboarding for a named
   employee ("whats onboarding process of rahul", "where is priya in onboarding",
   "onboarding status of rahul") → "employee_profile"  (NOT "onboarding")

--- Classification examples ---
"onboard Raj as engineer"                 → "onboarding"
"hire Priya as developer"                 → "onboarding"
"show Rahul's profile"                    → "employee_profile"
"show leave balance for Gunesh"           → "leave_balance"
"approve Rohan's leave"                   → "leave_approve"
"who is on leave today"                   → "leave_calendar"
"generate payroll for July"              → "generate_payroll"
"show salary breakup for Priya"          → "salary_breakup"
"give Rahul a 10 percent raise"          → "revise_salary"
"mark Priya present today"               → "mark_attendance"
"who was absent yesterday"               → "absent_employees"
"Rahul's attendance this month"          → "attendance_summary"
"show my attendance"                     → "attendance_summary"
"what salary structure does Priya have"  → "inspect_salary_structures"
"create a new salary component Basic"    → "create_salary_component"
"create a pay type Intern"               → "create_pay_type"
"show pay types"                         → "inspect_pay_types"
"list all pay types"                     → "inspect_pay_types"
"add HRA rule to Full Time"              → "add_pay_type_rule"
"add 40% HRA to full time pay type"      → "add_pay_type_rule"
"""


class TriageAgent:
    def __init__(self) -> None:
        self._client = OpenAI(api_key=settings.openai_api_key)

    def classify(
        self, message: str, history: list[dict], session_active_agent: str | None
    ) -> str:
        # Fast path bypass for performance
        normalized_msg = message.lower()
        if "who was absent" in normalized_msg or "who is absent" in normalized_msg or "absent today" in normalized_msg:
            return "absent_employees"
        if "attendance" in normalized_msg:
            return "attendance_summary"
            
        system = TRIAGE_SYSTEM_PROMPT
        if session_active_agent:
            system += f"\n\nCurrent session active_agent: {session_active_agent}"

        messages = [
            {"role": "system", "content": system},
            *history,
            {"role": "user", "content": message},
        ]
        try:
            response = self._client.chat.completions.create(
                model=settings.openai_intent_model,
                messages=messages,
                tools=[CLASSIFY_TOOL],
                tool_choice="required",
                temperature=0,
                max_tokens=32,
            )
            args = json.loads(
                response.choices[0].message.tool_calls[0].function.arguments
            )
            intent = args.get("intent", "employee_search")
            logger.info(
                "Triage: '%s...' → %s (active=%s)",
                message[:50],
                intent,
                session_active_agent,
            )
            return intent
        except Exception:
            logger.exception(
                "TriageAgent.classify() failed, defaulting to employee_search"
            )
            return "employee_search"