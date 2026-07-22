from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.employee import Employee
from app.models.employee.models import DocumentStatus, EmployeeDocument


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


def compute_onboarding_progress(db: Session, employee: Employee) -> dict[str, Any]:
    """7-step onboarding checklist: personal, employment, payroll readiness,
    salary, documents, seating, and welcome mail dispatch."""

    personal_complete = bool(employee.first_name and employee.last_name and employee.personal_email)
    employment_complete = bool(employee.department_id and employee.designation_id and employee.reporting_manager_id)
    payroll_complete = bool(employee.bank_account_number and employee.ifsc_code and employee.pan_number)
    salary_complete = employee.current_salary is not None
    documents_complete = _has_verified_document(db, employee.id)
    seating_complete = bool(employee.seat_label)
    welcome_mail_complete = employee.welcome_kit_sent_at is not None

    items = [
        {"key": "personal_details", "label": "Personal details", "complete": personal_complete, "tab": "Personal"},
        {"key": "employment_details", "label": "Employment details", "complete": employment_complete, "tab": "Employment"},
        {"key": "payroll_readiness", "label": "Payroll readiness", "complete": payroll_complete, "tab": "Payroll Impact"},
        {"key": "salary", "label": "Salary", "complete": salary_complete, "tab": "Salary"},
        {"key": "documents", "label": "Documents", "complete": documents_complete, "tab": "Documents"},
        {"key": "seating", "label": "Seating", "complete": seating_complete, "tab": "Personal"},
        {"key": "welcome_mail", "label": "Welcome mail", "complete": welcome_mail_complete, "tab": "Personal"},
    ]
    completed = [item["label"] for item in items if item["complete"]]
    pending = [item["label"] for item in items if not item["complete"]]
    percent = round((len(completed) / len(items)) * 100) if items else 0

    return {
        "percent": percent,
        "items": items,
        "completed": completed,
        "pending": pending,
        "welcome_kit_ready": all(item["complete"] for item in items if item["key"] != "welcome_mail"),
    }