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
from app.services.pay_type_service import PayTypeSyncService


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
        "create_pay_type",
        "inspect_pay_types",
        "add_pay_type_rule",
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

        if action == "create_pay_type":
            return self._create_pay_type(command, workflow_id)

        if action == "inspect_pay_types":
            return self._inspect_pay_types(command, workflow_id)

        if action == "add_pay_type_rule":
            return self._add_pay_type_rule(command, workflow_id)

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
                "download_url": f"/payroll/export/{filename}",
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
        # Pay-type classification — before component classification
        if any(word in normalized for word in ("pay type", "pay-type", "paytype")):
            if any(word in normalized for word in ("create", "add new", "new")):
                return "create_pay_type"
            if any(word in normalized for word in ("add rule", "add a rule", "add earning", "add deduction")):
                return "add_pay_type_rule"
            return "inspect_pay_types"
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

    # ── Pay-type agent handlers ────────────────────────────────────────────

    def _create_pay_type(self, command: str, workflow_id: str | None) -> dict[str, Any]:
        """Parse a natural-language create-pay-type command and invoke the service."""
        import re
        normalized = command.lower()
        # Extract code-like token (first ALL-CAPS or quoted word after "pay type")
        code_match = re.search(r"pay[\s\-]?type\s+[\"']?([A-Za-z_]+)", command, re.IGNORECASE)
        code = code_match.group(1).upper().replace(" ", "_") if code_match else None
        name = code.replace("_", " ").title() if code else None

        pay_basis = "FLAT_FEE" if "flat" in normalized else "STRUCTURE"

        if not code:
            return self._status_response(
                "Pay type name required",
                "Please specify a name, e.g. 'create pay type Intern, flat fee'.",
            )

        svc = PayTypeSyncService(self.db)
        existing = svc.get_by_code(code)
        if existing:
            return self._status_response(
                "Pay type already exists",
                f"A pay type with code '{code}' already exists.",
            )

        pay_type = svc.create_pay_type(code=code, name=name, pay_basis=pay_basis)
        return {
            "agent": self.name,
            "agent_display_name": "Payroll Agent",
            "action": "create_pay_type",
            "message": f"Pay type '{pay_type.name}' ({pay_type.code}) created with {pay_type.pay_basis} basis.",
            "operation_summary": "Pay type created",
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "approval_request_id": None,
            "workflow_id": workflow_id,
            "structured_response": {
                "type": "status_banner",
                "title": f"Pay type '{pay_type.name}' created",
                "summary": f"Code: {pay_type.code}, Basis: {pay_type.pay_basis}. "
                           f"Use the Settings tab to add rules, or say 'add rule to {pay_type.name}'.",
                "payload": {"pay_type_id": str(pay_type.id), "code": pay_type.code},
            },
        }

    def _inspect_pay_types(self, command: str, workflow_id: str | None) -> dict[str, Any]:
        svc = PayTypeSyncService(self.db)
        pay_types = svc.list_pay_types(active_only=False)
        items = []
        for pt in pay_types:
            rules = [r for r in pt.rules if r.deleted_at is None]
            items.append({
                "id": str(pt.id), "code": pt.code, "name": pt.name,
                "pay_basis": pt.pay_basis, "active": pt.active,
                "rule_count": len(rules),
            })
        return {
            "agent": self.name,
            "agent_display_name": "Payroll Agent",
            "action": "inspect_pay_types",
            "message": f"Found {len(items)} pay type(s).",
            "operation_summary": "Pay type catalog",
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "approval_request_id": None,
            "workflow_id": workflow_id,
            "structured_response": {
                "type": "status_banner",
                "title": "Pay Types",
                "summary": "\n".join(
                    f"• {pt['name']} ({pt['code']}) — {pt['pay_basis']}, {pt['rule_count']} rule(s)"
                    + (" [inactive]" if not pt["active"] else "")
                    for pt in items
                ) or "No pay types configured.",
                "payload": {"pay_types": items},
            },
        }

    def _add_pay_type_rule(self, command: str, workflow_id: str | None) -> dict[str, Any]:
        """Parse 'add HRA 40% of basic to Full Time' style commands."""
        import re
        normalized = command.lower()

        # Find the pay type name/code — look for "to <name>" at the end
        to_match = re.search(r"\bto\s+([a-z_\s]+?)(?:\s+pay[\s\-]?type)?$", normalized)
        pay_type_query = to_match.group(1).strip() if to_match else None

        svc = PayTypeSyncService(self.db)
        pay_type = None
        if pay_type_query:
            pay_type = svc.get_by_code(pay_type_query.upper().replace(" ", "_"))
            if not pay_type:
                # Try matching by name
                for pt in svc.list_pay_types(active_only=True):
                    if pt.name.lower() == pay_type_query or pt.code.lower() == pay_type_query.replace(" ", "_"):
                        pay_type = pt
                        break

        if not pay_type:
            return self._status_response(
                "Pay type not found",
                f"Could not find pay type '{pay_type_query or '?'}'. Please specify which pay type to add the rule to.",
            )

        # Parse rule details from the command
        rule_code = None
        calc_type = "FIXED"
        value = None
        reference_code = None
        kind = "EARNING"

        # Check for percentage pattern: "40% of BASIC"
        pct_match = re.search(r"(\d+(?:\.\d+)?)\s*%\s*(?:of\s+)?(\w+)", normalized)
        if pct_match:
            value = float(pct_match.group(1))
            reference_code = pct_match.group(2).upper()
            calc_type = "PERCENT_OF"

        # Check for fixed amount: "₹5000" or "Rs 5000"
        fixed_match = re.search(r"(?:₹|rs\.?\s*)(\d+(?:\.\d+)?)", normalized)
        if fixed_match and not pct_match:
            value = float(fixed_match.group(1))
            calc_type = "FIXED"

        # Check for statutory types
        if "epf" in normalized:
            calc_type = "STATUTORY_EPF"
            kind = "DEDUCTION"
            rule_code = "EPF"
        elif "professional tax" in normalized or " pt " in f" {normalized} ":
            calc_type = "STATUTORY_PT"
            kind = "DEDUCTION"
            rule_code = "PT"
        elif "tds" in normalized:
            if "flat" in normalized:
                calc_type = "FLAT_TDS"
                # Try to extract rate
                rate_match = re.search(r"(\d+(?:\.\d+)?)\s*%", normalized)
                if rate_match:
                    value = float(rate_match.group(1))
            else:
                calc_type = "STATUTORY_TDS"
            kind = "DEDUCTION"
            rule_code = "TDS"
        elif "leave deduction" in normalized:
            calc_type = "LEAVE_DEDUCTION"
            kind = "DEDUCTION"
            rule_code = "LEAVE_DEDUCTION"

        if "deduction" in normalized:
            kind = "DEDUCTION"

        # Extract rule code/name from command
        if not rule_code:
            # Look for a component name: "add HRA" → HRA
            name_match = re.search(r"\badd\s+([A-Za-z]+)", command, re.IGNORECASE)
            if name_match:
                rule_code = name_match.group(1).upper()

        if not rule_code:
            return self._status_response(
                "Rule details needed",
                "Please specify what rule to add (e.g. 'add HRA 40% of BASIC to Full Time').",
            )

        label = rule_code.replace("_", " ").title()
        rule = svc.add_rule(
            pay_type.id,
            code=rule_code,
            label=label,
            kind=kind,
            calc_type=calc_type,
            value=value,
            reference_code=reference_code,
            taxable=kind == "EARNING",
            prorate=kind == "EARNING",
        )

        return {
            "agent": self.name,
            "agent_display_name": "Payroll Agent",
            "action": "add_pay_type_rule",
            "message": f"Rule '{rule.code}' added to {pay_type.name}.",
            "operation_summary": f"Rule added to {pay_type.name}",
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "approval_request_id": None,
            "workflow_id": workflow_id,
            "structured_response": {
                "type": "status_banner",
                "title": f"Rule '{rule.code}' added to {pay_type.name}",
                "summary": f"{kind.title()} rule: {calc_type}"
                           + (f" = {value}" if value else "")
                           + (f" of {reference_code}" if reference_code else ""),
                "payload": {"rule_id": str(rule.id), "pay_type_id": str(pay_type.id)},
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