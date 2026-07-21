from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from app.services.lop_calculator import calculate_lop


def prepare_employee_payroll_input(db: Session, *, employee_id: UUID, month: int, year: int) -> dict:
    lop = calculate_lop(db, employee_id=employee_id, month=month, year=year).as_dict()
    return {
        "employee_id": lop["employee_id"],
        "working_days": lop["working_days"],
        "attendance_days": lop["present_days"],
        "leave_days": lop["paid_leave_days"] + lop["unpaid_leave_days"],
        "lop_days": lop["lop_days"],
    }


def prepare_monthly_payroll_input(db: Session, *, employee_ids: list[UUID], month: int, year: int) -> list[dict]:
    return [prepare_employee_payroll_input(db, employee_id=employee_id, month=month, year=year) for employee_id in employee_ids]
