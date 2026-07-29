from __future__ import annotations

import calendar
import re
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.agents.shared.base_agent import BaseAgent
from app.agents.approval_agent.service import ApprovalEngineService
from app.agents.payroll_agent.tools import (
    component_query_from_command,
    component_to_dict,
    find_salary_component,
    list_salary_components,
    parse_salary_component_command,
    validate_salary_component_data,
)

_MONTH_NAMES = {name.lower(): idx for idx, name in enumerate(calendar.month_name) if name}
_MONTH_NAMES.update({name.lower(): idx for idx, name in enumerate(calendar.month_abbr) if name})


def parse_month_year_from_command(command: str, default: datetime | None = None) -> tuple[int, int]:
    """Extract (month, year) from a free-text command like "generate payroll
    for July 2026" or "download bank sheet for 7/2026". Falls back to the
    current month/year if nothing is found — this is intentionally forgiving
    since the UI always sends an explicit month via the Generate Payroll modal.
    NOTE: this duplicates none of your existing tools.py parsing — it's kept
    local here since I don't have that file's contents to safely extend it.
    If you already have similar date-parsing helpers in tools.py, feel free
    to delete this and import yours instead."""
    now = default or datetime.now(timezone.utc)
    normalized = command.lower()

    numeric_match = re.search(r"\b(\d{1,2})[/\-](\d{4})\b", normalized)
    if numeric_match:
        return int(numeric_match.group(1)), int(numeric_match.group(2))

    year_match = re.search(r"\b(20\d{2})\b", normalized)
    year = int(year_match.group(1)) if year_match else now.year

    for name, idx in _MONTH_NAMES.items():
        if re.search(rf"\b{name}\b", normalized):
            return idx, year

    return now.month, year
from app.models.payroll import CompanySettings, PayrollRun, PayrollRunItem, PayrollRunStatus, SalaryComponent
from app.services.payroll_computation import compute_payroll_run
from app.services.payroll_export import (
    generate_bank_sheet,
    generate_consultant_sheet,
    generate_employee_sheet,
    generate_tds_sheet,
    is_safe_filename,
)


class PayrollAgent(BaseAgent):
    name = "payroll_agent"
    description = "Payroll salary component master, payroll processing, and payroll configuration agent."
    supported_actions = [
        "inspect",
        "create_component",
        "update_component",
        "delete_component",
        "list",
        "process",
        "export",
        "submit_approval",
    ]
    approval_required_actions = []

    def __init__(self, db: Session | None = None) -> None:
        self.db = db

    async def run(self, state):  # pragma: no cover - BaseAgent compatibility
        return {"message": "Payroll Agent requires runtime invocation."}

    def execute(self, *, action: str, command: str, user_id=None, workflow_id: str | None = None) -> dict[str, Any]:
        if self.db is None:
            raise RuntimeError("PayrollAgent requires a database session")

        action = self._classify_action(action, command)

        if action == "process":
            return self._process(command, user_id, workflow_id)

        if action == "export":
            return self._export(command, workflow_id)

        if action == "submit_approval":
            return self._submit_for_approval(command, user_id, workflow_id)

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

    # ── Payroll processing ────────────────────────────────────────────────

    def _process(self, command: str, user_id, workflow_id: str | None) -> dict[str, Any]:
        month, year = parse_month_year_from_command(command)
        existing = self.db.scalar(
            select(PayrollRun).where(PayrollRun.month == month, PayrollRun.year == year, PayrollRun.deleted_at.is_(None))
        )
        if existing and existing.status != PayrollRunStatus.DRAFT:
            return self._payroll_summary_response(existing, [], workflow_id, already_existed=True)

        line_items, skipped = compute_payroll_run(self.db, month, year)

        payroll_run = existing or PayrollRun(month=month, year=year, status=PayrollRunStatus.DRAFT)
        if not existing:
            payroll_run.generated_by = UUID(str(user_id)) if user_id else None
            self.db.add(payroll_run)
            self.db.flush()
        else:
            for item in list(payroll_run.items):
                self.db.delete(item)
            self.db.flush()

        for line in line_items:
            self.db.add(PayrollRunItem(payroll_run_id=payroll_run.id, **line))

        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            return self._status_response(
                "Payroll generation failed",
                "Could not save this payroll run — check for duplicate month/year runs.",
            )
        self.db.refresh(payroll_run)
        return self._payroll_summary_response(payroll_run, skipped, workflow_id)

    def _export(self, command: str, workflow_id: str | None) -> dict[str, Any]:
        month, year = parse_month_year_from_command(command)
        payroll_run = self.db.scalar(
            select(PayrollRun).where(PayrollRun.month == month, PayrollRun.year == year, PayrollRun.deleted_at.is_(None))
        )
        if not payroll_run:
            return self._status_response("Payroll run not found", f"No payroll run exists for {calendar.month_name[month]} {year}. Generate it first.")

        normalized = command.lower()
        export_type = "employee"
        if "consultant" in normalized:
            export_type = "consultant"
        elif "bank" in normalized:
            export_type = "bank"
        elif "tds" in normalized:
            export_type = "tds"

        if export_type == "bank" and payroll_run.status not in {PayrollRunStatus.APPROVED, PayrollRunStatus.BANK_SHEET_GENERATED, PayrollRunStatus.COMPLETED}:
            return self._status_response(
                "Bank sheet locked",
                "The bank sheet unlocks only after finance approves this payroll run.",
            )

        company = self.db.scalar(select(CompanySettings).where(CompanySettings.active == True))  # noqa: E712
        if not company:
            return self._status_response(
                "Company settings missing",
                "Set up Company Settings (name, bank account) in Masters before exporting payroll sheets.",
            )

        generators = {
            "employee": generate_employee_sheet,
            "consultant": generate_consultant_sheet,
            "bank": generate_bank_sheet,
            "tds": generate_tds_sheet,
        }
        filename = generators[export_type](self.db, payroll_run, company)
        if export_type == "bank" and payroll_run.status == PayrollRunStatus.APPROVED:
            payroll_run.status = PayrollRunStatus.BANK_SHEET_GENERATED
            self.db.commit()

        title = f"{export_type.title()} Sheet — {calendar.month_name[month]} {year}"
        return {
            "agent": self.name,
            "agent_display_name": "Payroll Agent",
            "action": "export",
            "message": f"{title} generated.",
            "operation_summary": title,
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "approval_request_id": None,
            "workflow_id": workflow_id,
            "structured_response": {
                "type": "payroll_export",
                "title": title,
                "filename": filename,
                "download_url": f"/api/v1/payroll/export/{filename}",
            },
        }

    def _submit_for_approval(self, command: str, user_id, workflow_id: str | None) -> dict[str, Any]:
        """Manual trigger: HR clicks "Submit for Approval" in the UI.
        TODO (future): connect to agent command router once the coordinator
        agent's TRIAGE_TOOLS description is updated to route payroll-submit
        phrases here."""
        month, year = parse_month_year_from_command(command)
        payroll_run = self.db.scalar(
            select(PayrollRun).where(PayrollRun.month == month, PayrollRun.year == year, PayrollRun.deleted_at.is_(None))
        )
        if not payroll_run:
            return self._status_response("Payroll run not found", f"No payroll run exists for {calendar.month_name[month]} {year}. Generate it first.")
        if payroll_run.status != PayrollRunStatus.DRAFT:
            return self._status_response("Already submitted", "This payroll run has already been submitted or processed.")

        payroll_run.status = PayrollRunStatus.PENDING_APPROVAL
        ApprovalEngineService(self.db).create_approval(
            module_name="payroll",
            action_name="approve_payroll_run",
            payload_json={
                "payroll_run_id": str(payroll_run.id),
                "month": payroll_run.month,
                "year": payroll_run.year,
                "total_employees": len(payroll_run.items),
                "total_net_payable": float(sum(i.net_salary for i in payroll_run.items)),
            },
            approval_reason="Payroll run requires finance approval before bank sheet export.",
            requested_by=user_id,
            workflow_id=workflow_id or str(payroll_run.id),
        )
        self.db.commit()
        self.db.refresh(payroll_run)
        return self._payroll_summary_response(payroll_run, [], workflow_id)

    def _payroll_summary_response(self, payroll_run: PayrollRun, skipped: list[str], workflow_id: str | None, already_existed: bool = False) -> dict[str, Any]:
        month_label = f"{calendar.month_name[payroll_run.month]} {payroll_run.year}"
        title = f"Payroll {'Draft' if payroll_run.status == PayrollRunStatus.DRAFT else '—'} {month_label}"
        summary = (
            f"Payroll run for {month_label} already exists with status {payroll_run.status}."
            if already_existed
            else f"Payroll processed for {len(payroll_run.items)} employee(s) for {month_label}."
        )
        return {
            "agent": self.name,
            "agent_display_name": "Payroll Agent",
            "action": "process",
            "message": summary,
            "operation_summary": title,
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "approval_request_id": None,
            "workflow_id": workflow_id,
            "structured_response": {
                "type": "payroll_summary",
                "title": title,
                "run_id": str(payroll_run.id),
                "month": payroll_run.month,
                "year": payroll_run.year,
                "status": str(payroll_run.status),
                "employee_count": len(payroll_run.items),
                "skipped": skipped,
                "exports_locked": payroll_run.status not in {
                    PayrollRunStatus.APPROVED,
                    PayrollRunStatus.BANK_SHEET_GENERATED,
                    PayrollRunStatus.COMPLETED,
                },
            },
        }

    # ── Existing component-management logic (unchanged) ────────────────────

    def _classify_action(self, action: str, command: str) -> str:
        normalized = command.lower()
        if any(word in normalized for word in ("submit", "send for approval")) and "payroll" in normalized:
            return "submit_approval"
        if any(word in normalized for word in ("download", "export", "generate sheet")) and any(
            word in normalized for word in ("sheet", "payroll", "bank", "tds")
        ):
            return "export"
        if any(word in normalized for word in ("process", "generate", "run")) and "payroll" in normalized:
            return "process"
        if any(word in normalized for word in ("remove", "delete")) and "component" in normalized:
            return "delete_component"
        if any(word in normalized for word in ("update", "change")) and "component" in normalized:
            return "update_component"
        if any(word in normalized for word in ("create", "add")) and "structure" not in normalized and any(keyword in normalized for keyword in ("earning", "deduction", "component", "salary", "%", "₹", "rs")):
            return "create_component"
        if any(keyword in normalized for keyword in ("component", "components", "salary components", "list components", "show components", "show payroll")):
            return "inspect"
        if action in {"process", "export", "submit_approval"}:
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