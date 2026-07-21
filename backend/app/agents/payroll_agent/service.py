from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.agents.shared.base_agent import BaseAgent
from app.agents.payroll_agent.tools import (
    component_query_from_command,
    component_to_dict,
    find_salary_component,
    list_salary_components,
    parse_salary_component_command,
    validate_salary_component_data,
)
from app.models.payroll import SalaryComponent


class PayrollAgent(BaseAgent):
    name = "payroll_agent"
    description = "Payroll salary component master and payroll configuration agent."
    supported_actions = ["inspect", "create_component", "update_component", "delete_component", "list"]
    approval_required_actions = []

    def __init__(self, db: Session | None = None) -> None:
        self.db = db

    async def run(self, state):  # pragma: no cover - BaseAgent compatibility
        return {"message": "Payroll Agent requires runtime invocation."}

    def execute(self, *, action: str, command: str, user_id=None, workflow_id: str | None = None) -> dict[str, Any]:
        if self.db is None:
            raise RuntimeError("PayrollAgent requires a database session")

        action = self._classify_action(action, command)
        if action in {"process", "generate_bank_sheet"}:
            return self._unsupported_response(
                "Payroll workflow not implemented",
                "Payroll run and bank-sheet generation are not available yet. No payroll records or bank files were created.",
                workflow_id,
            )

        if action == "create_component":
            component_data = parse_salary_component_command(command)
            missing_fields = validate_salary_component_data(component_data)
            if missing_fields:
                return self._clarification_response(component_data, missing_fields)
            now = datetime.now(timezone.utc)
            component_data["created_at"] = now
            component_data["updated_at"] = now
            component = SalaryComponent(**component_data)
            self.db.add(component)
            try:
                self.db.commit()
            except IntegrityError:
                self.db.rollback()
                existing = self.db.scalar(select(SalaryComponent).where(SalaryComponent.code == component.code))
                if existing:
                    return self._status_response(
                        "Salary component already exists",
                        f"A salary component with code '{component.code}' already exists. Use a different name or code.",
                    )
                raise
            self.db.refresh(component)
            return self._component_created_response(command, component, workflow_id)

        if action == "update_component":
            query = component_query_from_command(command)
            component = find_salary_component(self.db, query)
            if not component:
                return self._status_response("Salary component not found", "I could not find that salary component in the active component list.")
            updates = parse_salary_component_command(command)
            for field in ("name", "code", "type", "calculation_type", "calculation_value", "formula", "reference_component_code", "taxable", "active"):
                value = updates.get(field)
                if value is not None:
                    setattr(component, field, value)
            component.updated_at = datetime.now(timezone.utc)
            try:
                self.db.commit()
            except IntegrityError:
                self.db.rollback()
                return self._status_response("Salary component update failed", "Another salary component already uses that name or code.")
            self.db.refresh(component)
            return self._component_changed_response("Salary component updated", "The salary component was updated successfully.", component, workflow_id)

        if action == "delete_component":
            query = component_query_from_command(command)
            component = find_salary_component(self.db, query)
            if not component:
                return self._status_response("Salary component not found", "I could not find that salary component in the active component list.")
            component.active = False
            component.deleted_at = datetime.now(timezone.utc)
            component.updated_at = datetime.now(timezone.utc)
            self.db.add(component)
            self.db.commit()
            return self._component_changed_response("Salary component removed", "The salary component was removed from the active component list.", component, workflow_id)

        components = list_salary_components(self.db)
        return self._component_list_response(command, components, workflow_id)

    def _classify_action(self, action: str, command: str) -> str:
        normalized = command.lower()
        if any(word in normalized for word in ("remove", "delete")) and "component" in normalized:
            return "delete_component"
        if any(word in normalized for word in ("update", "change")) and "component" in normalized:
            return "update_component"
        if any(word in normalized for word in ("create", "add")) and "structure" not in normalized and any(keyword in normalized for keyword in ("earning", "deduction", "component", "salary", "%", "₹", "rs")):
            return "create_component"
        if any(keyword in normalized for keyword in ("component", "components", "salary components", "list components", "show components", "show payroll")):
            return "inspect"
        if action in {"process", "generate_bank_sheet"}:
            return action
        return action if action in self.supported_actions else "inspect"

    def _component_created_response(self, command: str, component: SalaryComponent, workflow_id: str | None) -> dict[str, Any]:
        return {
            "agent": self.name,
            "agent_display_name": "Payroll Agent",
            "action": "create_component",
            "message": f"Salary component '{component.name}' created.",
            "operation_summary": "Salary component created",
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "approval_request_id": None,
            "workflow_id": workflow_id,
            "structured_response": {
                "type": "salary_component_card",
                "title": component.name,
                "summary": f"{component.type.title()} component created with {component.calculation_type} calculation.",
                "component": component_to_dict(component),
            },
        }

    def _component_changed_response(self, title: str, summary: str, component: SalaryComponent, workflow_id: str | None) -> dict[str, Any]:
        return {
            "agent": self.name,
            "agent_display_name": "Payroll Agent",
            "action": "update_component",
            "message": summary,
            "operation_summary": title,
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "approval_request_id": None,
            "workflow_id": workflow_id,
            "structured_response": {
                "type": "salary_component_card",
                "title": title,
                "summary": summary,
                "component": component_to_dict(component),
            },
        }

    def _component_list_response(self, command: str, components: list[dict[str, Any]], workflow_id: str | None) -> dict[str, Any]:
        return {
            "agent": self.name,
            "agent_display_name": "Payroll Agent",
            "action": "inspect",
            "message": "Salary components loaded.",
            "operation_summary": "Salary component catalog",
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "approval_request_id": None,
            "workflow_id": workflow_id,
            "structured_response": {
                "type": "salary_component_table",
                "title": "Salary Components",
                "summary": f"Found {len(components)} salary component(s).",
                "components": components,
            },
        }

    def _status_response(self, title: str, summary: str) -> dict[str, Any]:
        return {
            "agent": self.name,
            "agent_display_name": "Payroll Agent",
            "action": "status",
            "message": summary,
            "operation_summary": title,
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "approval_request_id": None,
            "workflow_id": None,
            "structured_response": {"type": "status_banner", "title": title, "summary": summary, "payload": {}},
        }

    def _unsupported_response(self, title: str, summary: str, workflow_id: str | None) -> dict[str, Any]:
        return {
            "agent": self.name,
            "agent_display_name": "Payroll Agent",
            "action": "unsupported",
            "message": summary,
            "operation_summary": title,
            "execution_status": "Not Available",
            "workflow_status": "Blocked",
            "approval_request_id": None,
            "workflow_id": workflow_id,
            "structured_response": {
                "type": "status_banner",
                "title": title,
                "summary": summary,
                "payload": {},
            },
        }

    def _clarification_response(self, component_data: dict[str, Any], missing_fields: list[str]) -> dict[str, Any]:
        requested = ", ".join(missing_fields)
        component_name = component_data.get("name") or "salary component"
        summary = f"Please provide the {requested} for {component_name}."
        return {
            "agent": self.name,
            "agent_display_name": "Payroll Agent",
            "action": "clarification",
            "message": summary,
            "operation_summary": "A few component details are needed",
            "execution_status": "Needs review",
            "workflow_status": "Needs review",
            "approval_request_id": None,
            "workflow_id": None,
            "structured_response": {
                "type": "status_banner",
                "title": "A few component details are needed",
                "summary": summary,
                "payload": {"component": component_data, "missing_fields": missing_fields},
            },
        }
