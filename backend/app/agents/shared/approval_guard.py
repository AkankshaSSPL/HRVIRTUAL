from typing import Any

from app.agents.approval_agent.service import ApprovalEngineService
from app.agents.shared.agent_state import AgentExecutionState, AgentStatus
from app.db.session import SessionLocal
from sqlalchemy.orm import Session


class ApprovalGuard:
    def require_approval(self, state: AgentExecutionState, reason: str) -> AgentExecutionState:
        state.status = AgentStatus.WAITING_FOR_APPROVAL
        state.metadata["approval_reason"] = reason
        return state


def require_approval(
    *,
    module_name: str,
    action_name: str,
    payload_json: dict[str, Any],
    approval_reason: str,
    requested_by: str | None = None,
    workflow_id: str | None = None,
    workflow_state_json: dict[str, Any] | None = None,
    db: Session | None = None,
) -> str:
    """Reusable governance entry point for future agents before critical actions."""
    owns_session = db is None
    db = db or SessionLocal()
    try:
        approval = ApprovalEngineService(db).create_approval(
            module_name=module_name,
            action_name=action_name,
            payload_json=payload_json,
            approval_reason=approval_reason,
            requested_by=requested_by,
            workflow_id=workflow_id,
            workflow_state_json=workflow_state_json,
        )
        return str(approval.id)
    finally:
        if owns_session:
            db.close()
