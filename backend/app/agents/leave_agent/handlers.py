from __future__ import annotations

from typing import Any

from app.agents.approval_agent.handlers import handler_registry
from app.agents.leave_agent.tools import approve_leave_request, reject_leave_request
from app.db.session import SessionLocal


def execute_leave_approval(payload: dict[str, Any]) -> dict[str, Any]:
    db = SessionLocal()
    try:
        approved = []
        actor = payload.get("approved_by") or payload.get("requested_by")
        for request in payload.get("requests") or []:
            approved.append(approve_leave_request(db, request_id=request["id"], actor_id=actor))
        db.commit()
        return {
            "status": "executed",
            "message": "Leave requests approved and balances updated.",
            "requests": approved,
            "structured_response": {"type": "leave_approval", "title": "Leave Approved", "requests": approved},
        }
    finally:
        db.close()


def execute_leave_rejection(payload: dict[str, Any]) -> dict[str, Any]:
    db = SessionLocal()
    try:
        rejected = []
        actor = payload.get("rejected_by") or payload.get("requested_by")
        comments = payload.get("comments")
        for request in payload.get("requests") or []:
            rejected.append(reject_leave_request(db, request_id=request["id"], actor_id=actor, comments=comments))
        db.commit()
        return {
            "status": "rejected",
            "message": "Leave requests rejected. Balances and payroll inputs were not changed.",
            "requests": rejected,
            "structured_response": {"type": "leave_approval", "title": "Leave Rejected", "requests": rejected},
        }
    finally:
        db.close()


handler_registry.register("leave.approve", execute_leave_approval)
handler_registry.register("leave.approve.reject", execute_leave_rejection)
