from __future__ import annotations

import re
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.agents.salary_assignment_agent.services import SalaryAssignmentService
from app.agents.salary_assignment_agent.tools import (
    parse_salary_assignment_command,
    parse_salary_history_query,
    parse_salary_revision_command,
)
from app.agents.salary_assignment_agent.validators import validate_assignment_request
from app.agents.shared import approval_guard
from app.agents.shared.base_agent import BaseAgent
from app.agents.shared.runtime_context import RuntimeContext
from app.models.payroll import SalaryAssignmentStatus


class SalaryAssignmentAgent(BaseAgent):
    name = "salary_assignment_agent"
    description = "Assign, revise, and review employee salary structures through governed workflows."
    supported_actions = ["assign", "revise", "breakup", "refresh_breakups", "history", "pending_approvals", "inspect"]
    approval_required_actions = ["assign", "revise", "refresh_breakups"]

    def __init__(self, db: Session | None = None) -> None:
        self.db = db

    async def run(self, state):  # pragma: no cover
        return {"message": "Salary Assignment Agent requires runtime invocation."}

    async def invoke(self, action: str, payload: dict[str, Any], context: RuntimeContext) -> dict[str, Any]:
        if self.db is None:
            raise RuntimeError("SalaryAssignmentAgent requires a database session")
        return self.execute(action=action, command=payload.get("command", ""), user_id=context.user_id, workflow_id=context.workflow_id)

    def execute(self, *, action: str, command: str, user_id: UUID | None, workflow_id: str) -> dict[str, Any]:
        if self.db is None:
            raise RuntimeError("SalaryAssignmentAgent requires a database session")
        service = SalaryAssignmentService(self.db)
        action = self._classify_action(action, command)

        if action == "assign":
            return self._assign_salary(command, user_id, workflow_id, service)
        if action == "revise":
            return self._revise_salary(command, user_id, workflow_id, service)
        if action == "history":
            return self._salary_history(command, service)
        if action == "pending_approvals":
            return self._pending_approvals(service)
        if action == "breakup":
            return self._salary_breakup(command, service)
        if action == "refresh_breakups":
            return self._refresh_breakups(user_id, workflow_id, service)
        return self._status_response("Salary assignment ready", "Ask me to assign a salary structure, revise salary, show breakup, or show salary history.")

    def _assign_salary(self, command: str, user_id: UUID | None, workflow_id: str, service: SalaryAssignmentService) -> dict[str, Any]:
        parsed = parse_salary_assignment_command(command)
        missing = validate_assignment_request(
            employee_name=parsed["employee_name"],
            structure_name=parsed["structure_name"],
            gross_salary=parsed["gross_salary"],
            effective_from=parsed["effective_from"],
        )
        if missing:
            return self._status_response("A few salary details are needed", f"Please provide: {', '.join(missing)}.")

        employee = service.find_employee(parsed["employee_name"])
        if not employee:
            return self._status_response("Employee not found", "I could not find that employee in Employee Master.")
        structure = service.find_structure(parsed["structure_name"])
        if not structure:
            return self._status_response("Salary structure not found", "I could not find that salary structure in the salary structure list.")

        breakup = service.calculate_breakup(structure, parsed["gross_salary"])
        assignment = service.create_pending_assignment(
            employee=employee,
            structure=structure,
            gross_salary=parsed["gross_salary"],
            effective_from=parsed["effective_from"],
            requested_by=user_id,
            reason=parsed["reason"],
        )
        summary = service.assignment_summary(assignment, employee=employee, structure=structure)
        payload = {"assignment_id": str(assignment.id), "employee_id": str(employee.id), "salary_structure_id": str(structure.id), "summary": summary, "breakup": breakup}
        approval_id = approval_guard.require_approval(
            module_name="salary_assignment",
            action_name="activate",
            payload_json=payload,
            approval_reason="Salary assignment requires approval before activation.",
            requested_by=str(user_id) if user_id else None,
            workflow_id=workflow_id,
            workflow_state_json={"workflow_id": workflow_id, "agent_name": self.name, "action": "assign", "payload_json": payload},
            db=self.db,
        )
        self.db.commit()
        return self._assignment_response(summary, breakup, approval_id, workflow_id, "Salary assignment request created.")

    def _revise_salary(self, command: str, user_id: UUID | None, workflow_id: str, service: SalaryAssignmentService) -> dict[str, Any]:
        parsed = parse_salary_revision_command(command)
        employee = service.find_employee(parsed["employee_name"])
        if not employee:
            return self._status_response("Employee not found", "I could not find that employee in Employee Master.")
        active = service.active_assignment(employee.id)
        if not active:
            return self._status_response("No active salary assignment", "Assign a salary structure before revising salary.")

        old_salary = float(active.gross_salary)
        if parsed["percent"] is not None:
            direction = -1 if parsed["direction"] == "DECREASE" else 1
            new_salary = old_salary + (old_salary * parsed["percent"] / 100 * direction)
        elif parsed["amount"] is not None:
            new_salary = parsed["amount"]
        else:
            return self._status_response("Revision amount needed", "Please provide a percentage or new gross salary.")

        structure = active.salary_structure
        breakup = service.calculate_breakup(structure, new_salary)
        assignment = service.create_pending_assignment(
            employee=employee,
            structure=structure,
            gross_salary=new_salary,
            effective_from=parsed["effective_from"],
            requested_by=user_id,
            reason=parsed["reason"],
        )
        summary = service.assignment_summary(assignment, employee=employee, structure=structure)
        summary["old_salary_display"] = f"₹{old_salary:,.0f}"
        payload = {"assignment_id": str(assignment.id), "employee_id": str(employee.id), "salary_structure_id": str(structure.id), "summary": summary, "breakup": breakup}
        approval_id = approval_guard.require_approval(
            module_name="salary_assignment",
            action_name="activate",
            payload_json=payload,
            approval_reason="Salary revision requires approval before activation.",
            requested_by=str(user_id) if user_id else None,
            workflow_id=workflow_id,
            workflow_state_json={"workflow_id": workflow_id, "agent_name": self.name, "action": "revise", "payload_json": payload},
            db=self.db,
        )
        self.db.commit()
        return self._assignment_response(summary, breakup, approval_id, workflow_id, "Salary revision request created.", response_type="salary_revision_card")

    def _salary_breakup(self, command: str, service: SalaryAssignmentService) -> dict[str, Any]:
        employee_name = parse_salary_history_query(command)
        employee = service.find_employee(employee_name)
        if not employee:
            return self._status_response("Employee not found", "I could not find that employee in Employee Master.")
        active = service.active_assignment(employee.id)
        if not active:
            return self._status_response("Salary not assigned", "No active salary assignment was found for this employee.")
        return self._assignment_response(service.assignment_summary(active), service.calculate_breakup(active.salary_structure, active.gross_salary), None, None, "Salary breakup is ready.", response_type="salary_breakup_card")

    def _refresh_breakups(self, user_id: UUID | None, workflow_id: str, service: SalaryAssignmentService) -> dict[str, Any]:
        preview = service.salary_breakup_refresh_preview()
        if preview["employee_count"] == 0:
            return self._status_response("No active salary assignments", "There are no active employee salary assignments to refresh.")
        payload = {"preview": preview}
        approval_id = approval_guard.require_approval(
            module_name="salary_assignment",
            action_name="refresh_breakups",
            payload_json=payload,
            approval_reason="Refreshing salary breakups synchronizes updated component rules across active salary structures.",
            requested_by=str(user_id) if user_id else None,
            workflow_id=workflow_id,
            workflow_state_json={"workflow_id": workflow_id, "agent_name": self.name, "action": "refresh_breakups", "payload_json": payload},
            db=self.db,
        )
        self.db.commit()
        return {
            "agent": self.name,
            "agent_display_name": "Salary Assignment Agent",
            "action": "refresh_breakups",
            "message": "Salary breakup refresh is ready for approval.",
            "operation_summary": "Refresh employee salary breakups",
            "execution_status": "Waiting for Approval",
            "workflow_status": "Waiting for Approval",
            "approval_request_id": approval_id,
            "workflow_id": workflow_id,
            "structured_response": {
                "type": "status_banner",
                "title": "Salary breakup refresh requires approval",
                "summary": f"{preview['component_rules_to_sync']} component rule(s) across {preview['structure_count']} salary structure(s) will be synchronized for {preview['employee_count']} employee(s).",
                "payload": preview,
                "approval_request_id": approval_id,
            },
        }

    def _salary_history(self, command: str, service: SalaryAssignmentService) -> dict[str, Any]:
        employee_name = parse_salary_history_query(command)
        employee = service.find_employee(employee_name)
        if not employee:
            return self._status_response("Employee not found", "I could not find that employee in Employee Master.")
        history = service.assignment_history(employee.id)
        return {
            "agent": self.name,
            "agent_display_name": "Salary Assignment Agent",
            "action": "history",
            "message": "Salary history is ready.",
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "structured_response": {"type": "salary_history_card", "title": f"{employee_name.title()} salary history", "history": history},
        }

    def _pending_approvals(self, service: SalaryAssignmentService) -> dict[str, Any]:
        assignments = [service.assignment_summary(row) for row in service.pending_assignments()]
        return {
            "agent": self.name,
            "agent_display_name": "Salary Assignment Agent",
            "action": "pending_approvals",
            "message": "Pending salary assignment approvals are ready.",
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "structured_response": {"type": "salary_assignment_table", "title": "Pending Salary Approvals", "assignments": assignments},
        }

    def _assignment_response(self, summary: dict[str, Any], breakup: dict[str, Any], approval_id: str | None, workflow_id: str | None, message: str, response_type: str = "salary_preview_card") -> dict[str, Any]:
        return {
            "agent": self.name,
            "agent_display_name": "Salary Assignment Agent",
            "action": "assign",
            "message": message,
            "operation_summary": "Salary assignment",
            "execution_status": "Waiting for Approval" if approval_id else "Completed",
            "workflow_status": "Waiting for Approval" if approval_id else "Completed",
            "approval_request_id": approval_id,
            "workflow_id": workflow_id,
            "structured_response": {"type": response_type, "title": "Salary Assignment", "summary": summary, "breakup": breakup, "approval_request_id": approval_id},
        }

    def _status_response(self, title: str, summary: str) -> dict[str, Any]:
        return {
            "agent": self.name,
            "agent_display_name": "Salary Assignment Agent",
            "action": "status",
            "message": summary,
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "structured_response": {"type": "status_banner", "title": title, "summary": summary, "payload": {}},
        }

    def _classify_action(self, action: str, command: str) -> str:
        normalized = command.lower()
        if "pending" in normalized and "salary" in normalized:
            return "pending_approvals"
        if "history" in normalized and "salary" in normalized:
            return "history"
        if "breakup" in normalized and "salary" in normalized:
            if re.search(r"\b(?:all|every|evry)\s+(?:employee|employees|staff)\b|\beveryone\b|\bworkforce\b", normalized):
                return "refresh_breakups"
            return "breakup"
        if "breakage" in normalized and "salary" in normalized:
            return "refresh_breakups"
        if any(word in normalized for word in ("increase", "decrease", "revise", "update", "change")) and "salary" in normalized:
            return "revise"
        if "assign" in normalized and "salary" in normalized:
            return "assign"
        return action if action in self.supported_actions else "inspect"
