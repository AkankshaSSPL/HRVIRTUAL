from __future__ import annotations

import re
import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.employee_agent.schemas import EmployeeAgentAction
from app.agents.employee_agent.tools import (
    department_employees,
    employee_profile,
    employee_to_summary,
    find_department,
    find_one_employee,
    list_employees,
    search_employees,
    update_employee_fields,
)
from app.agents.shared import approval_guard
from app.agents.shared.base_agent import BaseAgent
from app.agents.shared.runtime_context import RuntimeContext
from app.models.audit import AuditLog
from app.models.agents import AgentRun
from app.services.onboarding_progress import compute_onboarding_progress

logger = logging.getLogger(__name__)

# Question/connector words that show up in onboarding-progress phrasing regardless of
# word order (e.g. "which step of onboarding progress is X", "X's onboarding progress",
# "onboarding status of X"). Stripping these leaves just the employee name behind.
_ONBOARDING_PROGRESS_STOPWORDS = re.compile(
    r"\b(?:what'?s|whats|what|which|check|show|tell|me|please|the|a|an|is|are|was|were|for|of|on|at|"
    r"onboarding|progress|status|stage|step)\b",
    re.IGNORECASE,
)

# Filler words that can leak into a captured employee name (e.g. "profile of
# employee Gouri Chillure" -> "employee Gouri Chillure"). Stripped from both
# ends so the residual is just the person's name.
_NAME_LEADING_FILLER = {"employee", "the", "staff", "member", "named", "for", "of", "profile", "details", "record", "about"}
_NAME_TRAILING_FILLER = {"profile", "details", "record", "onboarding", "progress", "status", "info", "information"}


def _clean_employee_name(name: str) -> str:
    """Strip leading/trailing filler words from a captured employee name."""
    tokens = (name or "").strip().split()
    while tokens and tokens[0].lower().strip(".,'’") in _NAME_LEADING_FILLER:
        tokens.pop(0)
    while tokens and tokens[-1].lower().strip(".,'’") in _NAME_TRAILING_FILLER:
        tokens.pop()
    return " ".join(tokens).strip()


class EmployeeAgent(BaseAgent):
    name = "employee_agent"
    description = "Enterprise employee lifecycle agent for governed employee operations."
    supported_actions = [
        "search",
        "list",
        "show_profile",
        "show_department",
        "show_manager",
        "create",
        "update",
        "delete",
        "update_salary",
        "change_manager",
        "change_department",
        "deactivate",
        "confirm_update",
    ]
    approval_required_actions = ["create", "delete", "update_salary", "deactivate"]
    confirmation_required_actions = ["update", "change_manager", "change_department"]

    def __init__(self, db: Session | None = None) -> None:
        self.db = db

    async def run(self, state):  # pragma: no cover - BaseAgent compatibility
        return {"message": "Employee Agent requires runtime invocation."}

    async def invoke(self, action: str, payload: dict[str, Any], context: RuntimeContext) -> dict[str, Any]:
        if self.db is None:
            raise RuntimeError("EmployeeAgent requires a database session")
        return self.execute(action=action, command=payload.get("command", ""), user_id=context.user_id, workflow_id=context.workflow_id)

    def execute(self, *, action: str, command: str, user_id: UUID | None, workflow_id: str) -> dict[str, Any]:
        if action == "confirm_update":
            return self._handle_confirmation(command, user_id)
        if self._is_onboarding_progress_query(command):
            return self._onboarding_progress_response(command)
        parsed_action = self._classify_action(action, command)
        page, page_size = self._pagination(command)

        if parsed_action in self.approval_required_actions:
            return self._request_approval(parsed_action, command, user_id, workflow_id)
        if parsed_action in self.confirmation_required_actions:
            return self._request_confirmation(parsed_action, command)

        if parsed_action == EmployeeAgentAction.SHOW_DEPARTMENT:
            department = self._department_from_command(command)
            employees, total = department_employees(self.db, department, page=page, page_size=page_size)
            return self._employee_table_response(command, employees, "Department employee search completed", page, page_size, total, {"department": department})

        if parsed_action == EmployeeAgentAction.SHOW_MANAGER:
            employee = self._resolve_employee(command)
            if employee and employee.reporting_manager:
                return self._employee_card_response(command, employee.reporting_manager, "Reporting manager")
            return self._status_response("Reporting manager unavailable", "No reporting manager was found for this employee.")

        if parsed_action == EmployeeAgentAction.SHOW_PROFILE:
            employee = self._resolve_employee(command)
            if not employee:
                query = self._employee_query(command) or command
                return self._status_response(
                    "Employee not found",
                    f"I could not find an employee matching '{query}'. Please check the spelling or use the full name as it appears in the employee list.",
                )
            return self._employee_card_response(command, employee, "Employee profile")

        if parsed_action == EmployeeAgentAction.SEARCH:
            query = self._employee_query(command)
            employees, total = search_employees(self.db, query, page=page, page_size=page_size) if query else list_employees(self.db, page=page, page_size=page_size)
            if len(employees) == 1 and "all" not in command.lower() and "list" not in command.lower():
                return self._employee_card_response(command, employees[0], "Employee profile")
            return self._employee_table_response(command, employees, "Employee search completed", page, page_size, total, {"query": query})

        status = self._status_from_command(command)
        employees, total = list_employees(self.db, page=page, page_size=page_size, status=status)
        return self._employee_table_response(command, employees, "Employee directory loaded", page, page_size, total, {"status": status})

    def _request_approval(self, action: EmployeeAgentAction, command: str, user_id: UUID | None, workflow_id: str) -> dict[str, Any]:
        payload = self._approval_payload(action, command)
        if action in self.approval_required_actions and action != EmployeeAgentAction.CREATE and not payload.get("employee_id"):
            return self._status_response("Employee not found", "I could not find the employee record to update. Please include the employee name as it appears in the employee list.")
        if action == EmployeeAgentAction.UPDATE_SALARY and payload.get("fields", {}).get("current_salary") is None:
            return self._status_response("Salary amount needed", "Please include the new salary amount, for example: Update Nikita salary to 120000.")
        if action == EmployeeAgentAction.CHANGE_MANAGER and payload.get("proposed_value") and payload.get("fields", {}).get("reporting_manager_id") is None:
            return self._status_response("Manager not found", f"I could not find {payload['proposed_value']} in the employee directory. Onboard or add the manager first, then try again.")
        fields = payload.get("fields") or {}
        if action in {EmployeeAgentAction.UPDATE, EmployeeAgentAction.CHANGE_MANAGER, EmployeeAgentAction.CHANGE_DEPARTMENT} and not any(value is not None for value in fields.values()):
            return self._status_response("Update details needed", "Please include the employee name and the field you want to update.")
        approval_id = approval_guard.require_approval(
            module_name="employee",
            action_name=str(action),
            payload_json=payload,
            approval_reason=f"Employee {str(action).replace('_', ' ')} requires human approval.",
            requested_by=str(user_id) if user_id else None,
            workflow_id=workflow_id,
            workflow_state_json={
                "workflow_id": workflow_id,
                "agent_name": self.name,
                "action": str(action),
                "command": command,
                "payload_json": payload,
                "approval_status": "PENDING",
            },
            db=self.db,
        )
        response_type = "approval_diff_card" if action == EmployeeAgentAction.UPDATE_SALARY else "action_card"
        return {
            "agent": self.name,
            "agent_display_name": "Employee Agent",
            "action": str(action),
            "message": "Employee Agent prepared a governed employee change for approval.",
            "operation_summary": self._operation_summary(action),
            "execution_status": "Waiting for Approval",
            "workflow_status": "Waiting for Approval",
            "execution_summary": "This employee operation is paused until an authorized approver reviews it.",
            "next_actions": "Review the approval request inline or from the Approval Inbox.",
            "approval_request_id": approval_id,
            "structured_response": {
                "type": response_type,
                "title": self._operation_summary(action),
                "summary": "Approval is required before this employee change can be executed.",
                "payload": payload,
                "actions": ["Send For Approval", "Edit Request"],
            },
            "workflow_id": workflow_id,
            "completed_at": None,
        }

    def _request_confirmation(self, action: EmployeeAgentAction, command: str) -> dict[str, Any]:
        payload = self._approval_payload(action, command)
        if not payload.get("employee_id"):
            return self._status_response("Employee not found", "I could not find the employee record to update. Please include the employee name as it appears in the employee list.")
        fields = payload.get("fields") or {}
        if not any(value is not None for value in fields.values()):
            if action == EmployeeAgentAction.CHANGE_MANAGER and payload.get("proposed_value"):
                return self._status_response("Manager not found", f"I could not find {payload['proposed_value']} in the employee directory. Add the manager first, then try again.")
            return self._status_response("Update details needed", "Please include the employee name and the field you want to update.")
        return {
            "agent": self.name,
            "agent_display_name": "Employee Agent",
            "action": str(action),
            "message": "Please confirm this employee update.",
            "operation_summary": self._operation_summary(action),
            "execution_status": "Needs Confirmation",
            "workflow_status": "Needs Confirmation",
            "structured_response": {
                "type": "confirmation_card",
                "title": self._operation_summary(action),
                "summary": self._confirmation_summary(payload),
                "payload": payload,
                "actions": ["Yes", "No"],
            },
        }

    def _handle_confirmation(self, command: str, user_id: UUID | None) -> dict[str, Any]:
        pending = self._latest_confirmation(user_id)
        if not pending:
            return self._status_response("Nothing to confirm", "I could not find a pending employee update. Please describe the update first.")
        normalized = command.strip().lower()
        if normalized in {"no", "cancel", "do not update", "don't update"}:
            return self._status_response("Update cancelled", "The employee update was cancelled. No employee data was changed.")
        if normalized not in {"yes", "confirm", "proceed", "apply", "save", "yes update"}:
            return self._status_response("Confirmation needed", "Reply Yes to apply the employee update or No to cancel it.")
        payload = pending.get("payload") or {}
        employee_id = payload.get("employee_id")
        fields = {key: value for key, value in (payload.get("fields") or {}).items() if value is not None}
        employee, old_value, new_value = update_employee_fields(self.db, UUID(str(employee_id)), fields)
        audit_employee_action(
            self.db,
            action=f"employee.{payload.get('action', 'update')}.confirmed",
            payload=payload,
            performed_by=user_id,
            entity_id=employee.id,
            old_value=old_value,
            new_value=new_value,
        )
        self.db.commit()
        return {
            "agent": self.name,
            "agent_display_name": "Employee Agent",
            "action": "update",
            "message": f"Done. {employee_to_summary(employee)['name']} has been updated.",
            "operation_summary": "Employee update completed",
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "structured_response": {
                "type": "employee_card",
                "title": "Employee updated",
                "summary": "The confirmed employee change was applied and audited.",
                "employee": employee_profile(employee),
            },
        }

    def _latest_confirmation(self, user_id: UUID | None) -> dict[str, Any] | None:
        if not user_id:
            return None
        runs = self.db.scalars(
            select(AgentRun)
            .where(AgentRun.agent_name == "coordinator_agent", AgentRun.requested_by == user_id)
            .order_by(AgentRun.created_at.desc())
            .limit(10)
        )
        for run in runs:
            response = ((run.metadata_json or {}).get("result") or {}).get("structured_response") or {}
            if response.get("type") == "confirmation_card":
                return response
        return None

    def _confirmation_summary(self, payload: dict[str, Any]) -> str:
        proposed = payload.get("proposed_value")
        employee_name = payload.get("employee_name", "employee")
        action = str(payload.get("action", "update"))
        if action == "change_manager":
            return f"Change {employee_name}'s manager to {proposed}?"
        if action == "change_department":
            return f"Change {employee_name}'s department to {proposed}?"
        return f"Apply this update to {employee_name}?"

    def _employee_card_response(self, command: str, employee, title: str) -> dict[str, Any]:
        summary = employee_profile(employee)
        return {
            "agent": self.name,
            "agent_display_name": "Employee Agent",
            "action": "show_profile",
            "message": "Employee profile is ready.",
            "operation_summary": title,
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "execution_summary": "Employee profile retrieval completed successfully.",
            "structured_response": {
                "type": "employee_card",
                "title": summary["name"],
                "summary": "Employee profile preview",
                "employee": summary,
                "payload": {"query": command},
                "actions": ["View Profile", "Update", "Deactivate"],
            },
        }

    def _employee_table_response(
        self,
        command: str,
        employees: list,
        title: str,
        page: int,
        page_size: int,
        total: int,
        filters: dict[str, Any],
    ) -> dict[str, Any]:
        rows = [employee_to_summary(employee) for employee in employees]
        return {
            "agent": self.name,
            "agent_display_name": "Employee Agent",
            "action": "search",
            "message": "Employee results are ready.",
            "operation_summary": title,
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "execution_summary": f"{total} employee record(s) matched the request.",
            "structured_response": {
                "type": "employee_table",
                "title": title,
                "summary": f"{total} employee record(s) found for: {command}",
                "employees": rows,
                "payload": {
                    "query": command,
                    "page": page,
                    "page_size": page_size,
                    "total": total,
                    "filters": {key: value for key, value in filters.items() if value},
                    "group_by": "department",
                },
                "actions": ["View Profile", "Update", "Deactivate"],
            },
        }

    def _status_response(self, title: str, summary: str) -> dict[str, Any]:
        return {
            "agent": self.name,
            "agent_display_name": "Employee Agent",
            "action": "status",
            "message": summary,
            "operation_summary": title,
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "execution_summary": summary,
            "structured_response": {"type": "status_banner", "title": title, "summary": summary, "payload": {}},
        }

    def _approval_payload(self, action: EmployeeAgentAction, command: str) -> dict[str, Any]:
        employee = self._resolve_employee(command)
        payload: dict[str, Any] = {
            "command": command,
            "action": str(action),
            "requested_at": datetime.now(timezone.utc).isoformat(),
            "employee_id": str(employee.id) if employee else None,
            "employee_name": employee_to_summary(employee)["name"] if employee else self._employee_query(command) or "Employee",
        }
        if action == EmployeeAgentAction.UPDATE_SALARY:
            payload.update(
                {
                    "field": "current_salary",
                    "current_value": _salary_display(employee.current_salary if employee else None),
                    "proposed_value": self._salary_from_command(command),
                    "fields": {"current_salary": self._salary_number(command)},
                }
            )
        elif action == EmployeeAgentAction.CHANGE_DEPARTMENT:
            department_name = self._department_from_command(command)
            department = find_department(self.db, department_name)
            payload.update({"field": "department_id", "proposed_value": department_name, "fields": {"department_id": str(department.id) if department else None}})
        elif action == EmployeeAgentAction.CHANGE_MANAGER:
            manager_query = self._manager_from_command(command)
            manager = find_one_employee(self.db, manager_query) if manager_query else None
            payload.update({"field": "reporting_manager_id", "proposed_value": manager_query, "fields": {"reporting_manager_id": str(manager.id) if manager else None}})
        elif action == EmployeeAgentAction.DEACTIVATE:
            payload.update({"field": "employment_status", "proposed_value": "SUSPENDED", "fields": {"employment_status": "SUSPENDED"}})
        elif action == EmployeeAgentAction.UPDATE:
            payload.update({"fields": self._fields_from_command(command)})
        elif action == EmployeeAgentAction.CREATE:
            payload.update({"fields": self._create_fields_from_command(command)})
        return payload

    def _classify_action(self, action: str, command: str) -> EmployeeAgentAction:
        normalized = command.lower()
        if self._manager_relationship(command):
            return EmployeeAgentAction.CHANGE_MANAGER
        if "salary" in normalized:
            return EmployeeAgentAction.UPDATE_SALARY
        if "deactivate" in normalized:
            return EmployeeAgentAction.DEACTIVATE
        if "delete" in normalized or "remove employee" in normalized:
            return EmployeeAgentAction.DELETE
        if "manager" in normalized and ("change" in normalized or "update" in normalized):
            return EmployeeAgentAction.CHANGE_MANAGER
        if "department" in normalized and ("change" in normalized or "update" in normalized):
            return EmployeeAgentAction.CHANGE_DEPARTMENT
        try:
            return EmployeeAgentAction(action)
        except ValueError:
            pass
        if "create" in normalized or "add employee" in normalized:
            return EmployeeAgentAction.CREATE
        if "reporting manager" in normalized or "manager of" in normalized:
            return EmployeeAgentAction.SHOW_MANAGER
        if "profile" in normalized and "employees" not in normalized and "list" not in normalized and "all" not in normalized:
            return EmployeeAgentAction.SHOW_PROFILE
        if "show" in normalized and "employee" in normalized and "employees" not in normalized and "list" not in normalized and "all" not in normalized:
            return EmployeeAgentAction.SHOW_PROFILE
        if "department" in normalized or any(item in normalized for item in ("engineering", "finance", "people", "hr", "sales", "marketing")):
            return EmployeeAgentAction.SHOW_DEPARTMENT
        if "search" in normalized or "find" in normalized:
            return EmployeeAgentAction.SEARCH
        return EmployeeAgentAction.LIST

    def _operation_summary(self, action: EmployeeAgentAction) -> str:
        return {
            EmployeeAgentAction.CREATE: "Create employee request",
            EmployeeAgentAction.UPDATE: "Update employee request",
            EmployeeAgentAction.DELETE: "Delete employee request",
            EmployeeAgentAction.UPDATE_SALARY: "Salary update request",
            EmployeeAgentAction.CHANGE_MANAGER: "Manager change request",
            EmployeeAgentAction.CHANGE_DEPARTMENT: "Department change request",
            EmployeeAgentAction.DEACTIVATE: "Employee deactivation request",
        }.get(action, "Employee operation")

    def _resolve_employee(self, command: str):
        query = self._employee_query(command)
        logger.info(f"_resolve_employee: extracted query = {query!r}")
        return find_one_employee(self.db, query) if query else None

    def _onboarding_employee_query(self, command: str) -> str:
        query = self._employee_query(command)
        if query:
            return query
        stripped = _ONBOARDING_PROGRESS_STOPWORDS.sub(" ", command)
        stripped = re.sub(r"[^A-Za-z\s.]", " ", stripped)
        stripped = re.sub(r"\s+", " ", stripped).strip(" .")
        return stripped

    def _onboarding_progress_response(self, command: str) -> dict[str, Any]:
        query = self._onboarding_employee_query(command)
        employee = find_one_employee(self.db, query) if query else None
        if not employee:
            return self._status_response(
                "Employee not found",
                f"I could not find an employee matching '{query or command}' to check onboarding progress for. "
                "Please check the spelling or use the full name as it appears in the employee list.",
            )
        progress = compute_onboarding_progress(self.db, employee)
        summary = employee_to_summary(employee)
        pending = progress["pending"]
        card_summary = (
            f"{progress['percent']}% complete — {len(pending)} step(s) remaining: {', '.join(pending)}."
            if pending
            else "Onboarding is fully complete."
        )
        return {
            "agent": self.name,
            "agent_display_name": "Employee Agent",
            "action": "onboarding_progress",
            "message": f"{summary['name']} is {progress['percent']}% through onboarding.",
            "operation_summary": "Onboarding progress check",
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "execution_summary": f"{len(progress['completed'])} of {len(progress['items'])} onboarding steps are complete.",
            "structured_response": {
                "type": "onboarding_progress_check",
                "title": f"{summary['name']}'s onboarding progress",
                "summary": card_summary,
                "employee": summary,
                "percent": progress["percent"],
                "items": progress["items"],
                "completed": progress["completed"],
                "pending": pending,
                "welcome_kit_ready": progress["welcome_kit_ready"],
                "payload": {"employee_id": str(employee.id)},
            },
        }

    def _is_onboarding_progress_query(self, command: str) -> bool:
        normalized = command.lower()
        progress_phrases = ("onboarding progress", "onboarding step", "onboarding status", "onboarding stage", "which step")
        if any(phrase in normalized for phrase in progress_phrases):
            return True
        return "onboarding" in normalized and "progress" in normalized

    def _employee_query(self, command: str) -> str:
        """
        Extract employee name from natural language commands.
        Supports:
            - show employee Nikita Bhilare
            - employee Nikita Bhilare
            - Nikita Bhilare (if it looks like a name)
        """
        if not command:
            return ""

        # 1. Direct patterns for commands starting with show/employee
        patterns = [
            r"^(?:show|find|get|display|view)\s+employee\s+(.+)$",
            r"^employee\s+(.+)$",
            r"^(?:profile for|info on)\s+(.+)$",
        ]
        for pat in patterns:
            match = re.match(pat, command.strip(), re.IGNORECASE)
            if match:
                name = _clean_employee_name(match.group(1))
                # Skip if it's "all", "list", etc.
                if name and name.lower() not in {"employees", "employee", "all", "list", "directory"}:
                    logger.info(f"Direct pattern matched: {name!r}")
                    return name

        # 2. Check if the command is just "show employees" or similar – return empty
        if re.search(r"\b(?:employee|employees|staff)\s+(?:list|directory)\b|\b(?:list|show|give|get)\s+(?:me\s+)?(?:all\s+)?(?:employee|employees|staff)\b", command, re.IGNORECASE):
            return ""

        # 3. Special case: "show <name>" without "employee" – if it has exactly two words, treat as name
        match = re.match(r"^(?:show|find|get|display|view)\s+([A-Za-z]+\s+[A-Za-z]+)$", command.strip(), re.IGNORECASE)
        if match:
            name = _clean_employee_name(match.group(1))
            if name and name.lower() not in {"employees", "employee", "all", "list"}:
                return name

        # 4. Handle "update <name> salary to <amount>"
        match = re.search(r"(?:salary|pay|ctc)\s+(?:for|to|of)\s+([a-z][a-z\s.]+?)(?:\s+from|\s+effective|$)", command, re.IGNORECASE)
        if match:
            name = _clean_employee_name(match.group(1))
            if name and name.lower() not in {"employees", "employee", "all"}:
                return name

        # 5. Handle "profile of <name>"
        match = re.search(r"\bprofile\s+(?:of|for)\s+([a-z][a-z\s.]+?)(?:['’]s)?(?:\s+salary|\s+department|\s+manager|\s+to|\s+from|$)", command, re.IGNORECASE)
        if match:
            name = _clean_employee_name(match.group(1))
            if name and name.lower() not in {"employees", "employee"}:
                return name

        # 6. Relationship patterns like "manager of X" – we already handle them separately, but fallback
        relationship = self._manager_relationship(command)
        if relationship:
            return relationship[1]  # employee name

        # 7. General fallback: if command has at least two words, take the last two as name (e.g., "show me Nikita Bhilare" → "Nikita Bhilare")
        parts = command.strip().split()
        if len(parts) >= 2:
            candidate = " ".join(parts[-2:])
            # Ensure it doesn't contain words like "salary", "manager", etc.
            if not any(word in candidate.lower() for word in ("salary", "manager", "department", "employee", "all", "list")):
                return candidate

        # 8. Last resort: if only one word, and it's not a stop word, treat as name
        if len(parts) == 1 and parts[0].lower() not in {"show", "find", "get", "view", "display"}:
            return parts[0]

        return ""

    def _department_from_command(self, command: str) -> str:
        match = re.search(r"(?:department|to|from)\s+([a-z][a-z\s]+)$", command, re.IGNORECASE)
        if match and "salary" not in command.lower():
            return match.group(1).strip()
        for department in ("engineering", "finance", "people ops", "people", "hr", "sales", "marketing"):
            if department in command.lower():
                return department
        return command

    def _manager_from_command(self, command: str) -> str:
        relationship = self._manager_relationship(command)
        if relationship:
            return relationship[0]
        match = re.search(r"(?:manager|to)\s+([a-z][a-z\s.]+)$", command, re.IGNORECASE)
        return match.group(1).strip() if match else ""

    def _manager_relationship(self, command: str) -> tuple[str, str] | None:
        patterns = (
            r"^\s*(?P<manager>[a-z][a-z\s.]*?)\s+is\s+(?:the\s+)?manager\s+of\s+(?P<employee>[a-z][a-z\s.]*?)\s*[.!]?\s*$",
            r"^\s*make\s+(?P<manager>[a-z][a-z\s.]*?)\s+(?:the\s+)?manager\s+of\s+(?P<employee>[a-z][a-z\s.]*?)\s*[.!]?\s*$",
            r"^\s*(?P<employee>[a-z][a-z\s.]*?)\s+reports\s+to\s+(?P<manager>[a-z][a-z\s.]*?)\s*[.!]?\s*$",
            r"^\s*assign\s+(?P<manager>[a-z][a-z\s.]*?)\s+as\s+(?:the\s+)?manager\s+(?:of|to|for)\s+(?P<employee>[a-z][a-z\s.]*?)\s*[.!]?\s*$",
            r"^\s*(?:update|change)\s+manager\s+of\s+(?P<employee>[a-z][a-z\s.]*?)\s+to\s+(?P<manager>[a-z][a-z\s.]*?)\s*[.!?]?\s*$",
            r"^\s*(?:update|change)\s+(?P<employee>[a-z][a-z\s.]*?)\s+(?:change\s+)?manager\s+to\s+(?P<manager>[a-z][a-z\s.]*?)\s*[.!?]?\s*$",
            r"^\s*(?:update|change)\s+(?P<employee>[a-z][a-z\s.]*?)['’]s\s+manager\s+to\s+(?P<manager>[a-z][a-z\s.]*?)\s*[.!?]?\s*$",
        )
        for pattern in patterns:
            match = re.match(pattern, command, re.IGNORECASE)
            if match:
                return match.group("manager").strip(" ."), match.group("employee").strip(" .")
        return None

    def _salary_from_command(self, command: str) -> str:
        amount = self._salary_number(command)
        return _salary_display(amount)

    def _salary_number(self, command: str) -> float | None:
        match = re.search(r"(?:salary|to)\s*(?:rs\.?|inr|₹)?\s*(\d[\d,]*)", command, re.IGNORECASE)
        if not match:
            match = re.search(r"\b(?:add|set|update|change)?\s*(?:rs\.?|inr|â‚¹)?\s*(\d[\d,]*)\s*(?:per\s+month|monthly|month)?\s+(?:salary|pay|ctc)\b", command, re.IGNORECASE)
        return float(Decimal(match.group(1).replace(",", ""))) if match else None

    def _pagination(self, command: str) -> tuple[int, int]:
        page_match = re.search(r"page\s+(\d+)", command, re.IGNORECASE)
        limit_match = re.search(r"(?:limit|top|first)\s+(\d+)", command, re.IGNORECASE)
        return int(page_match.group(1)) if page_match else 1, min(int(limit_match.group(1)) if limit_match else 10, 50)

    def _status_from_command(self, command: str) -> str | None:
        normalized = command.lower()
        for status in ("active", "probation", "notice_period", "exited", "suspended"):
            if status.replace("_", " ") in normalized:
                return status.upper()
        return None

    def _fields_from_command(self, command: str) -> dict[str, Any]:
        fields: dict[str, Any] = {}
        phone_match = re.search(r"phone\s+(?:to\s+)?([\d+\-\s]+)", command, re.IGNORECASE)
        if phone_match:
            fields["phone"] = phone_match.group(1).strip()
        email_match = re.search(r"email\s+(?:to\s+)?([\w.\-+]+@[\w.\-]+)", command, re.IGNORECASE)
        if email_match:
            fields["official_email"] = email_match.group(1).strip()
        return fields

    def _create_fields_from_command(self, command: str) -> dict[str, Any]:
        name = self._employee_query(command)
        email_match = re.search(r"([\w.\-+]+@[\w.\-]+)", command)
        return {"name": name.title() if name else None, "official_email": email_match.group(1) if email_match else None}


def audit_employee_action(
    db: Session,
    *,
    action: str,
    payload: dict[str, Any],
    performed_by: UUID | None = None,
    entity_id: UUID | None = None,
    old_value: dict[str, Any] | None = None,
    new_value: dict[str, Any] | None = None,
) -> None:
    db.add(
        AuditLog(
            entity_type="employee",
            entity_id=entity_id,
            action=action,
            old_value=old_value,
            new_value=new_value or payload,
            performed_by=performed_by,
        )
    )


def _salary_display(value: Decimal | float | None) -> str:
    if value is None:
        return "Not assigned"
    return f"₹{float(value):,.0f}"