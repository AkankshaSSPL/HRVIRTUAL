from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date, timedelta
from uuid import UUID

from sqlalchemy import and_, extract, select
from sqlalchemy.orm import Session

from app.models.employee import AttendanceRecord, LeaveRequest, LeaveType
from app.models.employee.models import AttendanceStatus, LeaveCategory, LeaveRequestStatus


@dataclass(frozen=True)
class LOPResult:
    employee_id: str
    working_days: float
    present_days: float
    paid_leave_days: float
    unpaid_leave_days: float
    lop_days: float

    def as_dict(self) -> dict:
        return {
            "employee_id": self.employee_id,
            "working_days": self.working_days,
            "present_days": self.present_days,
            "paid_leave_days": self.paid_leave_days,
            "unpaid_leave_days": self.unpaid_leave_days,
            "lop_days": self.lop_days,
        }


UNPAID_LEAVE_NAMES = {"UNPAID LEAVE", "LOP", "UL", "LOSS OF PAY"}


def calculate_lop(db: Session, *, employee_id: UUID, month: int, year: int) -> LOPResult:
    month_start = date(year, month, 1)
    month_end = date(year, month, calendar.monthrange(year, month)[1])
    attendance = list(
        db.scalars(
            select(AttendanceRecord).where(
                AttendanceRecord.employee_id == employee_id,
                extract("month", AttendanceRecord.attendance_date) == month,
                extract("year", AttendanceRecord.attendance_date) == year,
                AttendanceRecord.deleted_at.is_(None),
            )
        )
    )
    approved_leaves = list(
        db.scalars(
            select(LeaveRequest).where(
                LeaveRequest.employee_id == employee_id,
                LeaveRequest.status == LeaveRequestStatus.APPROVED,
                LeaveRequest.deleted_at.is_(None),
                and_(LeaveRequest.start_date <= month_end, LeaveRequest.end_date >= month_start),
            )
        )
    )

    working_days = 0.0
    present_days = 0.0
    for record in attendance:
        status = str(record.status)
        if status in {AttendanceStatus.WEEKLY_OFF, AttendanceStatus.HOLIDAY}:
            continue
        working_days += 1
        if status in {AttendanceStatus.PRESENT, AttendanceStatus.WORK_FROM_HOME, AttendanceStatus.ON_DUTY}:
            present_days += 1
        elif status == AttendanceStatus.HALF_DAY:
            present_days += 0.5

    paid_leave_days = 0.0
    unpaid_leave_days = 0.0
    for leave in approved_leaves:
        days = _working_days_in_overlap(leave, month_start, month_end)
        if not days:
            continue
        category = _leave_category(db, leave)
        if category == LeaveCategory.UNPAID:
            unpaid_leave_days += days
        elif category == LeaveCategory.PAID:
            paid_leave_days += days

    if not working_days:
        days_in_month = calendar.monthrange(year, month)[1]
        working_days = sum(1 for day in range(1, days_in_month + 1) if date(year, month, day).weekday() < 5)

    lop_days = max(0.0, working_days - present_days - paid_leave_days) + unpaid_leave_days
    return LOPResult(
        employee_id=str(employee_id),
        working_days=working_days,
        present_days=present_days,
        paid_leave_days=paid_leave_days,
        unpaid_leave_days=unpaid_leave_days,
        lop_days=round(lop_days, 2),
    )


def _leave_category(db: Session, leave: LeaveRequest) -> LeaveCategory:
    leave_type = None
    if leave.leave_type_id:
        leave_type = db.get(LeaveType, leave.leave_type_id)
    if not leave_type and leave.leave_type:
        leave_type = db.scalar(
            select(LeaveType).where(
                LeaveType.deleted_at.is_(None),
                LeaveType.name.ilike(leave.leave_type),
            )
        )
    if leave_type:
        return LeaveCategory(str(leave_type.category))
    if str(leave.leave_type or "").upper() in UNPAID_LEAVE_NAMES:
        return LeaveCategory.UNPAID
    return LeaveCategory.PAID


def _working_days_in_overlap(leave: LeaveRequest, month_start: date, month_end: date) -> float:
    start = max(leave.start_date, month_start)
    end = min(leave.end_date, month_end)
    if end < start:
        return 0.0
    total = 0
    current = start
    while current <= end:
        if current.weekday() < 5:
            total += 1
        current += timedelta(days=1)
    return float(total)
