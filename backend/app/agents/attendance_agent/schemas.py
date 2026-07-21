from enum import StrEnum
from pydantic import BaseModel


class AttendanceAgentAction(StrEnum):
    RECORD = "record"
    SHOW = "show"
    ABSENT_TODAY = "absent_today"
    PAYROLL_SUMMARY = "payroll_summary"
    LOP = "lop"


class AttendanceSummary(BaseModel):
    employee_id: str | None = None
    employee_name: str | None = None
    month: int
    year: int
    working_days: float
    present_days: float
    absent_days: float
    half_days: float
    paid_leave_days: float = 0
    unpaid_leave_days: float = 0
    lop_days: float = 0
