from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.agents.shared import approval_guard
from app.agents.shared.base_agent import BaseAgent
from app.agents.leave_agent.tools import (
    cancel_leave_request,
    cancellable_leave_requests,
    create_leave_request,
    create_or_update_leave_type,
    employee_query,
    find_employee_or_raise,
    leave_balances,
    leave_history,
    leave_request_payload,
    parse_leave_dates,
    parse_leave_type,
    pending_leave_requests,
    reject_leave_request,
    team_leave_calendar,
)


class LeaveAgent(BaseAgent):
    name = "leave_agent"
    description = "Leave policies, requests, approvals, balances, WFH, and payroll leave inputs."
    supported_actions = ["create_type", "apply", "balance", "history", "pending", "approve", "reject", "cancel", "calendar", "summary"]
    approval_required_actions = ["approve"]

    def __init__(self, db: Session | None = None) -> None:
        self.db = db

    async def run(self, state):  # pragma: no cover
        return {"message": "Leave Agent requires runtime invocation."}

    def execute(self, *, action: str, command: str, user_id=None, workflow_id: str | None = None) -> dict[str, Any]:
        if self.db is None:
            raise RuntimeError("LeaveAgent requires a database session")
        action = self._classify(action, command)

        if action == "create_type":
            leave_type = create_or_update_leave_type(self.db, command)
            self.db.commit()
            return self._policy_response(leave_type, workflow_id)

        if action == "pending":
            requests = pending_leave_requests(self.db, _employee_filter_for_pending(command))
            return self._approval_list_response(requests, workflow_id, title="Pending leave approvals")

        if action == "calendar":
            requests = team_leave_calendar(self.db)
            return self._calendar_response(requests, workflow_id)

        if action == "cancel":
            employee_name = employee_query(command)
            if not employee_name:
                return self._status_response("Employee name required", "Please provide the employee name and leave date to cancel.", workflow_id)
            start_date, end_date = parse_leave_dates(command)
            requests = cancellable_leave_requests(self.db, employee_name=employee_name, start_date=start_date, end_date=end_date)
            if not requests:
                return self._status_response("Leave request not found", "I could not find a pending or approved leave request for that employee and date.", workflow_id)
            cancelled = [cancel_leave_request(self.db, request_id=request["id"], actor_id=user_id) for request in requests]
            self.db.commit()
            return self._approval_list_response(cancelled, workflow_id, title="Leave cancelled", status="Completed")

        if action in {"approve", "reject"}:
            requests = pending_leave_requests(self.db, employee_query(command))
            if not requests:
                return self._status_response("No pending leave request", "I could not find a pending leave request for that employee.", workflow_id)
            if action == "reject":
                rejected = [reject_leave_request(self.db, request_id=request["id"], actor_id=user_id, comments="Rejected from Agent Command") for request in requests]
                self.db.commit()
                return self._approval_list_response(rejected, workflow_id, title="Leave rejected", status="Completed")
            approval_id = approval_guard.require_approval(
                module_name="leave",
                action_name="approve",
                payload_json={"command": command, "requests": requests},
                approval_reason="Leave approval affects leave balances, WFH attendance, and payroll LOP inputs.",
                requested_by=str(user_id) if user_id else None,
                workflow_id=workflow_id,
                workflow_state_json={"workflow_id": workflow_id, "agent_name": self.name, "action": "approve", "requests": requests},
                db=self.db,
            )
            return self._approval_response(requests, approval_id, workflow_id)

        employee = find_employee_or_raise(self.db, employee_query(command))
        if action == "balance":
            return self._balance_response(leave_balances(self.db, employee=employee), workflow_id)
        if action == "history":
            return self._history_response(leave_history(self.db, employee=employee), workflow_id)

        start_date, end_date = parse_leave_dates(command)
        try:
            request = create_leave_request(
                self.db,
                employee=employee,
                leave_type_name=parse_leave_type(command),
                start_date=start_date,
                end_date=end_date,
                reason=_reason_from_command(command),
                requested_by=user_id,
            )
        except ValueError as exc:
            self.db.rollback()
            return self._status_response("Leave request could not be submitted", str(exc), workflow_id)
        request_payload = leave_request_payload(request, employee)
        approval_id = approval_guard.require_approval(
            module_name="leave",
            action_name="approve",
            payload_json={"command": command, "requests": [request_payload]},
            approval_reason="Leave approval affects leave balances, attendance, and payroll inputs.",
            requested_by=str(user_id) if user_id else None,
            workflow_id=workflow_id,
            workflow_state_json={"workflow_id": workflow_id, "agent_name": self.name, "action": "apply", "requests": [request_payload]},
            db=self.db,
        )
        self.db.commit()
        return self._request_response(request_payload, workflow_id, approval_id)

    def _classify(self, action: str, command: str) -> str:
        normalized = command.lower()
        if any(word in normalized for word in ("create", "add", "setup")) and any(word in normalized for word in ("leave policy", "leave type", "paid leave", "sick leave", "casual leave", "unpaid leave", "work from home", "wfh")):
            return "create_type"
        if "pending" in normalized and ("leave" in normalized or "approval" in normalized):
            return "pending"
        if "calendar" in normalized or "who is on leave" in normalized or "team leave" in normalized:
            return "calendar"
        if "approve" in normalized:
            return "approve"
        if "reject" in normalized:
            return "reject"
        if "cancel" in normalized:
            return "cancel"
        if "history" in normalized:
            return "history"
        if "balance" in normalized:
            return "balance"
        if "apply" in normalized or "leave for" in normalized or "wfh" in normalized or "work from home" in normalized:
            return "apply"
        return action if action in self.supported_actions else "summary"

    def _policy_response(self, leave_type: dict[str, Any], workflow_id: str | None) -> dict[str, Any]:
        return {
            "agent": self.name,
            "agent_display_name": "Leave Agent",
            "action": "create_type",
            "message": f"{leave_type['name']} policy is ready.",
            "operation_summary": "Leave policy",
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "approval_request_id": None,
            "workflow_id": workflow_id,
            "structured_response": {"type": "leave_policy", "title": "Leave Policy", "policy": leave_type},
        }

    def _request_response(self, request: dict[str, Any], workflow_id: str | None, approval_id: str | None = None) -> dict[str, Any]:
        return {
            "agent": self.name,
            "agent_display_name": "Leave Agent",
            "action": "apply",
            "message": "Leave request submitted successfully. Awaiting approval.",
            "operation_summary": "Leave request",
            "execution_status": "Awaiting Approval",
            "workflow_status": "Waiting for Approval",
            "approval_request_id": approval_id,
            "workflow_id": workflow_id,
            "structured_response": {"type": "leave_request", "title": "Leave Request", "request": request, "approval_request_id": approval_id},
        }

    def _balance_response(self, balances: list[dict[str, Any]], workflow_id: str | None) -> dict[str, Any]:
        return {
            "agent": self.name,
            "agent_display_name": "Leave Agent",
            "action": "balance",
            "message": "Leave balance loaded.",
            "operation_summary": "Leave balance",
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "approval_request_id": None,
            "workflow_id": workflow_id,
            "structured_response": {"type": "leave_balance", "title": "Leave Balance", "balances": balances},
        }

    def _history_response(self, requests: list[dict[str, Any]], workflow_id: str | None) -> dict[str, Any]:
        return {
            "agent": self.name,
            "agent_display_name": "Leave Agent",
            "action": "history",
            "message": "Leave history loaded.",
            "operation_summary": "Leave history",
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "approval_request_id": None,
            "workflow_id": workflow_id,
            "structured_response": {"type": "leave_history", "title": "Leave History", "requests": requests},
        }

    def _approval_response(self, requests: list[dict[str, Any]], approval_id: str, workflow_id: str | None) -> dict[str, Any]:
        return {
            "agent": self.name,
            "agent_display_name": "Leave Agent",
            "action": "approve",
            "message": "Leave approval is waiting for authorized review.",
            "operation_summary": "Leave approval",
            "execution_status": "Waiting for Approval",
            "workflow_status": "Waiting for Approval",
            "approval_request_id": approval_id,
            "workflow_id": workflow_id,
            "structured_response": {"type": "leave_approval", "title": "Leave Approval", "requests": requests, "approval_request_id": approval_id},
        }

    def _approval_list_response(self, requests: list[dict[str, Any]], workflow_id: str | None, *, title: str, status: str = "Ready") -> dict[str, Any]:
        message = title if requests else "No pending leave approvals found."
        return {
            "agent": self.name,
            "agent_display_name": "Leave Agent",
            "action": "pending",
            "message": message,
            "operation_summary": title,
            "execution_status": status,
            "workflow_status": "Completed",
            "approval_request_id": None,
            "workflow_id": workflow_id,
            "structured_response": {"type": "leave_approval", "title": title, "summary": message, "requests": requests},
        }

    def _calendar_response(self, requests: list[dict[str, Any]], workflow_id: str | None) -> dict[str, Any]:
        return {
            "agent": self.name,
            "agent_display_name": "Leave Agent",
            "action": "calendar",
            "message": "Team leave calendar loaded.",
            "operation_summary": "Team leave calendar",
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "approval_request_id": None,
            "workflow_id": workflow_id,
            "structured_response": {"type": "leave_calendar", "title": "Team Leave Calendar", "requests": requests},
        }

    def _status_response(self, title: str, summary: str, workflow_id: str | None) -> dict[str, Any]:
        return {
            "agent": self.name,
            "agent_display_name": "Leave Agent",
            "action": "status",
            "message": summary,
            "operation_summary": title,
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "approval_request_id": None,
            "workflow_id": workflow_id,
            "structured_response": {"type": "status_banner", "title": title, "summary": summary},
        }


def _reason_from_command(command: str) -> str | None:
    marker = "because"
    if marker in command.lower():
        return command[command.lower().index(marker) + len(marker) :].strip(" .")
    return None


def _employee_filter_for_pending(command: str) -> str | None:
    normalized = command.lower()
    if " for " not in normalized:
        return None
    return employee_query(command)
