from __future__ import annotations

from typing import Any
from uuid import UUID

from app.agents.approval_agent.handlers import handler_registry
from app.agents.salary_assignment_agent.services import SalaryAssignmentService
from app.db.session import SessionLocal


def activate_salary_assignment(payload: dict[str, Any]) -> dict[str, Any]:
    assignment_id = payload.get("assignment_id")
    if not assignment_id:
        summary = payload.get("summary") or {}
        assignment_id = summary.get("id")
    if not assignment_id:
        raise LookupError("Salary assignment approval payload does not include assignment_id")

    approved_by = payload.get("approved_by")
    db = SessionLocal()
    try:
        result = SalaryAssignmentService(db).activate_assignment(UUID(str(assignment_id)), UUID(str(approved_by)) if approved_by else None)
        db.commit()
        return {
            "status": "executed",
            "message": "Approved salary assignment activated.",
            "assignment": result,
            "structured_response": {
                "type": "salary_assignment_activated",
                "title": "Salary assignment activated",
                "summary": result,
            },
        }
    finally:
        db.close()


def refresh_salary_breakups(payload: dict[str, Any]) -> dict[str, Any]:
    approved_by = payload.get("approved_by")
    db = SessionLocal()
    try:
        result = SalaryAssignmentService(db).refresh_salary_breakups(UUID(str(approved_by)) if approved_by else None)
        db.commit()
        return {
            "status": "executed",
            "message": "Employee salary breakups refreshed successfully.",
            "refresh_summary": result,
            "structured_response": {
                "type": "status_banner",
                "title": "Salary breakups refreshed",
                "summary": f"Updated {result['synced_component_rules']} component rule(s) across {result['structure_count']} salary structure(s) and validated {result['employee_count']} employee salary breakup(s).",
                "payload": result,
            },
        }
    finally:
        db.close()


handler_registry.register("salary_assignment.activate", activate_salary_assignment)
handler_registry.register("salary_assignment.refresh_breakups", refresh_salary_breakups)
