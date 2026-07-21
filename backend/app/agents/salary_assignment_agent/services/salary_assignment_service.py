from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.agents.employee_agent.tools import employee_display_name, find_one_employee
from app.agents.payroll_agent.tools import STANDARD_COMPONENT_TYPES, normalize_code
from app.models.audit import AuditLog
from app.models.employee import Employee
from app.models.payroll import (
    EmployeeSalaryAssignment,
    SalaryApprovalStatus,
    SalaryAssignmentApproval,
    SalaryAssignmentStatus,
    SalaryComponent,
    SalaryRevisionHistory,
    SalaryRevisionType,
    SalaryStructure,
)


def money(value: Decimal | float | int | None) -> str:
    if value is None:
        return "Not available"
    return f"₹{float(value):,.0f}"


def _evaluate_salary_formula(formula: str | None, gross: Decimal, amounts: dict[str, Decimal]) -> Decimal:
    if not formula:
        return Decimal("0")
    expression = formula.upper()
    values = {"GROSS": gross, "GROSS_SALARY": gross, "CTC": gross, **amounts}
    for token in sorted(values, key=len, reverse=True):
        expression = re.sub(rf"\b{re.escape(token)}\b", str(values[token]), expression)
    if re.search(r"[^0-9+\-*/().\s]", expression):
        raise ValueError(f"Unsupported salary formula: {formula}")
    try:
        value = eval(expression, {"__builtins__": {}}, {})
    except Exception as exc:
        raise ValueError(f"Salary formula could not be calculated: {formula}") from exc
    return Decimal(str(value))


class SalaryAssignmentService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def find_employee(self, query: str) -> Employee | None:
        return find_one_employee(self.db, query)

    def find_structure(self, query: str) -> SalaryStructure | None:
        code = f"SS_{normalize_code(query)}"
        return self.db.scalar(
            select(SalaryStructure)
            .where(SalaryStructure.deleted_at.is_(None), SalaryStructure.active.is_(True))
            .where((SalaryStructure.code == code) | (SalaryStructure.name.ilike(f"%{query}%")))
            .options(selectinload(SalaryStructure.items))
            .limit(1)
        )

    def active_assignment(self, employee_id: UUID) -> EmployeeSalaryAssignment | None:
        return self.db.scalar(
            select(EmployeeSalaryAssignment)
            .where(
                EmployeeSalaryAssignment.deleted_at.is_(None),
                EmployeeSalaryAssignment.employee_id == employee_id,
                EmployeeSalaryAssignment.status == SalaryAssignmentStatus.ACTIVE,
            )
            .options(selectinload(EmployeeSalaryAssignment.salary_structure).selectinload(SalaryStructure.items))
            .order_by(EmployeeSalaryAssignment.effective_from.desc())
            .limit(1)
        )

    def pending_assignments(self) -> list[EmployeeSalaryAssignment]:
        return list(
            self.db.scalars(
                select(EmployeeSalaryAssignment)
                .where(EmployeeSalaryAssignment.deleted_at.is_(None), EmployeeSalaryAssignment.status == SalaryAssignmentStatus.PENDING_APPROVAL)
                .options(selectinload(EmployeeSalaryAssignment.employee), selectinload(EmployeeSalaryAssignment.salary_structure))
                .order_by(EmployeeSalaryAssignment.created_at.desc())
            )
        )

    def active_assignments(self) -> list[EmployeeSalaryAssignment]:
        return list(
            self.db.scalars(
                select(EmployeeSalaryAssignment)
                .where(
                    EmployeeSalaryAssignment.deleted_at.is_(None),
                    EmployeeSalaryAssignment.status == SalaryAssignmentStatus.ACTIVE,
                )
                .options(
                    selectinload(EmployeeSalaryAssignment.employee),
                    selectinload(EmployeeSalaryAssignment.salary_structure).selectinload(SalaryStructure.items),
                )
                .order_by(EmployeeSalaryAssignment.created_at.desc())
            )
        )

    def salary_breakup_refresh_preview(self) -> dict[str, Any]:
        assignments = self.active_assignments()
        structure_ids = {assignment.salary_structure_id for assignment in assignments}
        component_map = {
            component.code: component
            for component in self.db.scalars(
                select(SalaryComponent).where(SalaryComponent.deleted_at.is_(None), SalaryComponent.active.is_(True))
            ).all()
        }
        changed_items = 0
        missing_components: set[str] = set()
        inspected_structures: set[UUID] = set()
        for assignment in assignments:
            if assignment.salary_structure_id in inspected_structures:
                continue
            inspected_structures.add(assignment.salary_structure_id)
            for item in assignment.salary_structure.items:
                component = component_map.get(item.component_code)
                if not component:
                    missing_components.add(item.component_code)
                    continue
                if (
                    item.calculation_type != component.calculation_type
                    or item.calculation_value != component.calculation_value
                    or item.formula != component.formula
                    or item.reference_component_code != component.reference_component_code
                ):
                    changed_items += 1
        return {
            "employee_count": len(assignments),
            "structure_count": len(structure_ids),
            "component_rules_to_sync": changed_items,
            "missing_component_codes": sorted(missing_components),
        }

    def refresh_salary_breakups(self, performed_by: UUID | None) -> dict[str, Any]:
        assignments = self.active_assignments()
        component_map = {
            component.code: component
            for component in self.db.scalars(
                select(SalaryComponent).where(SalaryComponent.deleted_at.is_(None), SalaryComponent.active.is_(True))
            ).all()
        }
        now = datetime.now(timezone.utc)
        synced_items = 0
        processed_structures: set[UUID] = set()
        missing_components: set[str] = set()

        for assignment in assignments:
            structure = assignment.salary_structure
            if structure.id in processed_structures:
                continue
            processed_structures.add(structure.id)
            for item in structure.items:
                component = component_map.get(item.component_code)
                if not component:
                    missing_components.add(item.component_code)
                    continue
                next_values = {
                    "calculation_type": component.calculation_type,
                    "calculation_value": component.calculation_value,
                    "formula": component.formula,
                    "reference_component_code": component.reference_component_code,
                }
                if any(getattr(item, field) != value for field, value in next_values.items()):
                    for field, value in next_values.items():
                        setattr(item, field, value)
                    item.updated_at = now
                    self.db.add(item)
                    synced_items += 1

        invalid_breakups: list[dict[str, str]] = []
        for assignment in assignments:
            try:
                self.calculate_breakup(assignment.salary_structure, assignment.gross_salary)
            except ValueError as exc:
                invalid_breakups.append(
                    {
                        "employee_name": employee_display_name(assignment.employee),
                        "salary_structure": assignment.salary_structure.name,
                        "issue": str(exc),
                    }
                )

        result = {
            "employee_count": len(assignments),
            "structure_count": len(processed_structures),
            "synced_component_rules": synced_items,
            "missing_component_codes": sorted(missing_components),
            "invalid_breakups": invalid_breakups,
        }
        self.db.add(
            AuditLog(
                entity_type="salary_breakup_refresh",
                entity_id=None,
                action="salary_breakups.refreshed",
                old_value=None,
                new_value=result,
                performed_by=performed_by,
                created_at=now,
                updated_at=now,
            )
        )
        self.db.flush()
        return result

    def assignment_history(self, employee_id: UUID) -> list[dict[str, Any]]:
        rows = self.db.scalars(
            select(SalaryRevisionHistory)
            .where(SalaryRevisionHistory.deleted_at.is_(None), SalaryRevisionHistory.employee_id == employee_id)
            .order_by(SalaryRevisionHistory.effective_from.desc(), SalaryRevisionHistory.created_at.desc())
        ).all()
        return [
            {
                "id": str(row.id),
                "old_salary": money(row.old_salary),
                "new_salary": money(row.new_salary),
                "revision_type": str(row.revision_type),
                "reason": row.reason,
                "effective_from": row.effective_from.isoformat() if row.effective_from else None,
                "approved_by": str(row.approved_by) if row.approved_by else None,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ]

    def calculate_breakup(self, structure: SalaryStructure, gross_salary: float | Decimal) -> dict[str, Any]:
        gross = Decimal(str(gross_salary))
        component_map = {
            component.code: component
            for component in self.db.scalars(select(SalaryComponent).where(SalaryComponent.deleted_at.is_(None))).all()
        }
        amounts: dict[str, Decimal] = {}
        lines: list[dict[str, Any]] = []

        for item in sorted(structure.items, key=lambda row: row.sort_order):
            if item.calculation_type == "fixed":
                amount = Decimal(str(item.calculation_value or 0))
            elif item.calculation_type == "percentage" and item.reference_component_code:
                reference_code = normalize_code(item.reference_component_code)
                reference_amount = gross if reference_code in {"GROSS", "GROSS_SALARY"} else amounts.get(reference_code, Decimal("0"))
                amount = reference_amount * Decimal(str(item.calculation_value or 0)) / Decimal("100")
            elif item.calculation_type == "percentage":
                amount = gross * Decimal(str(item.calculation_value or 0)) / Decimal("100")
            elif item.calculation_type in {"balance", "formula"}:
                amount = _evaluate_salary_formula(item.formula, gross, amounts)
            else:
                amount = Decimal("0")

            amounts[item.component_code] = amount
            component = component_map.get(item.component_code)
            component_type = STANDARD_COMPONENT_TYPES.get(
                item.component_code,
                component.type if component else "earning",
            )
            lines.append(
                {
                    "component_code": item.component_code,
                    "component_name": component.name if component else item.component_code.replace("_", " ").title(),
                    "type": component_type,
                    "calculation_type": item.calculation_type,
                    "calculation_value": float(item.calculation_value) if item.calculation_value is not None else None,
                    "reference_component_code": item.reference_component_code,
                    "amount": float(amount),
                    "amount_display": money(amount),
                }
            )

        configured_earnings = sum(Decimal(str(line["amount"])) for line in lines if line["type"] == "earning")
        employer_contributions = sum(Decimal(str(line["amount"])) for line in lines if line["type"] == "employer_contribution")
        deductions = sum(Decimal(str(line["amount"])) for line in lines if line["type"] == "deduction")
        has_earning_components = any(line["type"] == "earning" for line in lines)
        ctc_gap = gross - configured_earnings - employer_contributions
        ctc_balanced = abs(ctc_gap) <= Decimal("0.01")
        earnings_total = configured_earnings if has_earning_components and ctc_balanced else gross
        unallocated_gross = ctc_gap if has_earning_components else Decimal("0")
        if deductions > gross:
            raise ValueError(
                "Salary structure is invalid because total deductions exceed gross salary. "
                "Review component types and calculation values before assigning it."
            )
        net_salary = earnings_total - deductions
        return {
            "gross_salary": float(gross),
            "gross_salary_display": money(gross),
            "earnings": float(earnings_total),
            "earnings_display": money(earnings_total),
            "configured_earnings": float(configured_earnings),
            "configured_earnings_display": money(configured_earnings),
            "unallocated_gross": float(unallocated_gross),
            "unallocated_gross_display": money(unallocated_gross),
            "deductions": float(deductions),
            "deductions_display": money(deductions),
            "employer_contributions": float(employer_contributions),
            "employer_contributions_display": money(employer_contributions),
            "ctc_validation_total": float(configured_earnings + employer_contributions),
            "ctc_validation_total_display": money(configured_earnings + employer_contributions),
            "ctc_balanced": ctc_balanced,
            "net_salary": float(net_salary),
            "net_salary_display": money(net_salary),
            "items": lines,
        }

    def create_pending_assignment(
        self,
        *,
        employee: Employee,
        structure: SalaryStructure,
        gross_salary: float,
        effective_from: date,
        requested_by: UUID | None,
        reason: str,
    ) -> EmployeeSalaryAssignment:
        active = self.active_assignment(employee.id)
        now = datetime.now(timezone.utc)
        assignment = EmployeeSalaryAssignment(
            employee_id=employee.id,
            salary_structure_id=structure.id,
            gross_salary=gross_salary,
            effective_from=effective_from,
            status=SalaryAssignmentStatus.PENDING_APPROVAL,
            created_at=now,
            updated_at=now,
        )
        self.db.add(assignment)
        self.db.flush()
        self.db.add(SalaryAssignmentApproval(assignment_id=assignment.id, status=SalaryApprovalStatus.PENDING, created_at=now, updated_at=now))
        self.db.add(
            AuditLog(
                entity_type="employee_salary_assignment",
                entity_id=assignment.id,
                action="salary_assignment.requested",
                old_value={"active_assignment_id": str(active.id), "gross_salary": money(active.gross_salary)} if active else None,
                new_value=self.assignment_summary(assignment, employee=employee, structure=structure),
                performed_by=requested_by,
            )
        )
        self.db.flush()
        return assignment

    def activate_assignment(self, assignment_id: UUID, approved_by: UUID | None) -> dict[str, Any]:
        assignment = self.db.scalar(
            select(EmployeeSalaryAssignment)
            .where(EmployeeSalaryAssignment.id == assignment_id)
            .options(selectinload(EmployeeSalaryAssignment.employee), selectinload(EmployeeSalaryAssignment.salary_structure).selectinload(SalaryStructure.items))
        )
        if not assignment:
            raise LookupError("Salary assignment not found")
        if assignment.status == SalaryAssignmentStatus.ACTIVE:
            return self.assignment_summary(assignment)

        current = self.active_assignment(assignment.employee_id)
        old_salary = Decimal(str(current.gross_salary)) if current else None
        if current and current.id != assignment.id:
            current.status = SalaryAssignmentStatus.EXPIRED
            current.effective_to = assignment.effective_from - timedelta(days=1)
            self.db.add(current)

        assignment.status = SalaryAssignmentStatus.ACTIVE
        assignment.approved_by = approved_by
        assignment.updated_at = datetime.now(timezone.utc)
        approval = self.db.scalar(select(SalaryAssignmentApproval).where(SalaryAssignmentApproval.assignment_id == assignment.id).limit(1))
        if approval:
            approval.status = SalaryApprovalStatus.APPROVED
            approval.approver_id = approved_by
            approval.approved_at = datetime.now(timezone.utc)
            approval.updated_at = datetime.now(timezone.utc)
            self.db.add(approval)

        assignment.employee.current_salary = assignment.gross_salary
        revision_type = SalaryRevisionType.ASSIGNMENT if old_salary is None else SalaryRevisionType.INCREASE if Decimal(str(assignment.gross_salary)) >= old_salary else SalaryRevisionType.DECREASE
        self.db.add(
            SalaryRevisionHistory(
                employee_id=assignment.employee_id,
                old_salary=old_salary,
                new_salary=assignment.gross_salary,
                revision_type=revision_type,
                reason="Approved salary assignment",
                effective_from=assignment.effective_from,
                approved_by=approved_by,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
        )
        self.db.add(
            AuditLog(
                entity_type="employee_salary_assignment",
                entity_id=assignment.id,
                action="salary_assignment.activated",
                old_value={"gross_salary": money(old_salary)} if old_salary is not None else None,
                new_value=self.assignment_summary(assignment),
                performed_by=approved_by,
            )
        )
        self.db.flush()
        return self.assignment_summary(assignment)

    def assignment_summary(self, assignment: EmployeeSalaryAssignment, employee: Employee | None = None, structure: SalaryStructure | None = None) -> dict[str, Any]:
        employee = employee or assignment.employee
        structure = structure or assignment.salary_structure
        return {
            "id": str(assignment.id),
            "employee_id": str(assignment.employee_id),
            "employee_name": employee_display_name(employee) if employee else None,
            "salary_structure_id": str(assignment.salary_structure_id),
            "salary_structure": structure.name if structure else None,
            "gross_salary": float(assignment.gross_salary),
            "gross_salary_display": money(assignment.gross_salary),
            "effective_from": assignment.effective_from.isoformat() if assignment.effective_from else None,
            "effective_to": assignment.effective_to.isoformat() if assignment.effective_to else None,
            "status": str(assignment.status),
            "approved_by": str(assignment.approved_by) if assignment.approved_by else None,
        }
