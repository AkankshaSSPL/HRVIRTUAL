from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.employee import Employee
from app.models.employee.models import DocumentStatus, EmployeeDocument
from app.models.payroll.models import (
    EmployeeSalaryAssignment,
    SalaryApprovalStatus,
    SalaryAssignmentApproval,
    SalaryAssignmentStatus,
)


def _has_verified_document(db: Session, employee_id: UUID) -> bool:
    return (
        db.scalar(
            select(EmployeeDocument.id)
            .where(
                EmployeeDocument.employee_id == employee_id,
                EmployeeDocument.status == DocumentStatus.VERIFIED,
            )
            .limit(1)
        )
        is not None
    )


def _latest_salary_assignment(db: Session, employee_id: UUID) -> EmployeeSalaryAssignment | None:
    return db.scalar(
        select(EmployeeSalaryAssignment)
        .where(EmployeeSalaryAssignment.employee_id == employee_id)
        .order_by(EmployeeSalaryAssignment.effective_from.desc())
        .limit(1)
    )


def _is_approved(db: Session, assignment_id: UUID) -> bool:
    return (
        db.scalar(
            select(SalaryAssignmentApproval.id)
            .where(
                SalaryAssignmentApproval.assignment_id == assignment_id,
                SalaryAssignmentApproval.status == SalaryApprovalStatus.APPROVED,
            )
            .limit(1)
        )
        is not None
    )


def compute_onboarding_progress(db: Session, employee: Employee) -> dict[str, Any]:
    """Full onboarding checklist: personal/employment/payroll/document
    readiness, salary assignment, its approval, and welcome kit dispatch."""

    personal_complete = bool(employee.first_name and employee.last_name and employee.personal_email)
    employment_complete = bool(employee.department_id and employee.designation_id and employee.reporting_manager_id)
    payroll_complete = bool(employee.bank_account_number and employee.ifsc_code and employee.pan_number)
    documents_complete = _has_verified_document(db, employee.id)

    salary_assignment = _latest_salary_assignment(db, employee.id)
    salary_complete = bool(salary_assignment and salary_assignment.status == SalaryAssignmentStatus.ACTIVE)
    approval_complete = bool(salary_assignment and _is_approved(db, salary_assignment.id))

    welcome_kit_complete = employee.welcome_kit_sent_at is not None

    items = [
        {"key": "personal_details", "label": "Personal details", "complete": personal_complete, "tab": "Personal"},
        {"key": "employment_details", "label": "Employment details", "complete": employment_complete, "tab": "Employment"},
        {"key": "payroll_readiness", "label": "Payroll readiness", "complete": payroll_complete, "tab": "Payroll Impact"},
        {"key": "documents", "label": "Documents", "complete": documents_complete, "tab": "Documents"},
        {"key": "salary", "label": "Salary", "complete": salary_complete, "tab": "Salary"},
        {"key": "approval", "label": "Approval", "complete": approval_complete, "tab": "Salary"},
        {"key": "welcome_kit", "label": "Welcome kit", "complete": welcome_kit_complete, "tab": "Personal"},
    ]
    completed = [item["label"] for item in items if item["complete"]]
    pending = [item["label"] for item in items if not item["complete"]]
    percent = round((len(completed) / len(items)) * 100) if items else 0

    return {
        "percent": percent,
        "items": items,
        "completed": completed,
        "pending": pending,
        "welcome_kit_ready": all(item["complete"] for item in items if item["key"] != "welcome_kit"),
    }