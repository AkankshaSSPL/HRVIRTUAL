"""
Onboarding agent – collects employee details step by step.
"""

import logging
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.agents.models import AgentRun
from app.models.employee import Employee
from app.agents.onboarding_agent.tools import parsed_from_command
from app.agents.shared.base_agent import BaseAgent
from app.services.onboarding_progress import compute_onboarding_progress
from app.agents.onboarding_agent.llm import llm_compose_reply

logger = logging.getLogger(__name__)


# --- Helper Functions Exposing API for Handlers & Service ---

def audit_onboarding_action(*args, **kwargs):
    """Audit log handler for onboarding actions."""
    logger.info("Auditing onboarding action: %s", args)
    return True


def onboarding_response(message: str, data: Optional[dict] = None) -> dict[str, Any]:
    """Helper to format onboarding responses consistently."""
    return {
        "message": message,
        "structured_response": data or {},
    }


def _is_new_onboarding_command(command: str) -> bool:
    """Helper to check if a command starts a brand-new onboarding flow."""
    return bool(parsed_from_command(command).get("name"))


def _latest_onboarding_finishing_employee_id(db: Session, user_id: Optional[UUID]) -> Optional[UUID]:
    """Helper to look up the latest active employee being onboarded by user_id."""
    if not user_id:
        return None
    runs = db.scalars(
        select(AgentRun)
        .where(AgentRun.requested_by == user_id, AgentRun.agent_name == "onboarding_agent")
        .order_by(AgentRun.created_at.desc())
        .limit(10)
    ).all()
    for run in runs:
        sr = (run.metadata_json or {}).get("result", {}).get("structured_response") or {}
        if sr.get("type") == "onboarding_finishing" and not sr.get("completed"):
            emp_id = sr.get("employee_id")
            if emp_id:
                try:
                    return UUID(emp_id)
                except ValueError:
                    pass
    return None


def _get_employee_by_id(db: Session, employee_id: UUID) -> Optional[Employee]:
    """Simple lookup (adjust tenant/soft-delete filters if needed)."""
    return db.scalar(
        select(Employee).where(
            Employee.id == employee_id,
            Employee.deleted_at.is_(None),
        )
    )


# --- Agent Implementation ---

class OnboardingAgent(BaseAgent):
    name = "onboarding_agent"
    description = "Conversational employee onboarding — collects candidate details step by step."
    supported_actions = ["start", "inspect"]
    approval_required_actions = ["start"]

    def __init__(self, db: Optional[Session] = None):
        self.db = db

    async def run(self, state):  # pragma: no cover - BaseAgent compatibility
        return {"message": "Onboarding Agent requires runtime invocation."}

    def execute(
        self,
        *,
        command: str,
        user_id: Optional[UUID],
        workflow_id: str,
        history: list[dict] = None,
        active_entity_id: Optional[UUID] = None,
    ) -> dict[str, Any]:
        """Run one onboarding turn."""
        logger.info("OnboardingAgent.execute('%s', user=%s)", command, user_id)

        employee = None
        if not _is_new_onboarding_command(command):
            if active_entity_id:
                employee = _get_employee_by_id(self.db, active_entity_id)
            else:
                employee_id = _latest_onboarding_finishing_employee_id(self.db, user_id)
                if employee_id:
                    employee = _get_employee_by_id(self.db, employee_id)

        if employee:
            progress = compute_onboarding_progress(self.db, employee)
            percent = progress.get("percent", 0.0)
            pending = progress.get("pending", [])
            completed = len(pending) == 0
            section_label = pending[0] if pending else "done"
            ask_for = ", ".join(pending) if pending else "Nothing"
            emp_name = employee.first_name or "Employee"
        else:
            percent = 0.0
            completed = False
            section_label = "personal details"
            ask_for = "name and email"
            emp_name = "Candidate"

        reply_message = llm_compose_reply(
            name=emp_name,
            percent=percent,
            section_label=section_label,
            ask_for=ask_for,
            just_captured=command,
            completed=completed,
            history=history,
        )

        return onboarding_response(
            message=reply_message,
            data={
                "type": "onboarding_finishing",
                "completed": completed,
                "employee_id": str(employee.id) if employee else None,
            },
        )