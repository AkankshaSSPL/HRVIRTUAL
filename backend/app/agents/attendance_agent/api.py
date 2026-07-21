from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.agents.attendance_agent.tools import (
    attendance_calendar,
    attendance_dashboard,
    attendance_detail,
    attendance_matrix,
    attendance_summary,
    find_employee_or_raise,
    record_attendance,
)
from app.api.deps import get_current_user, require_permissions
from app.db.session import get_db
from app.models.auth import User
from app.models.employee import Employee

router = APIRouter()


class AttendanceActionRequest(BaseModel):
    employee_id: str
    attendance_date: date
    status: str
    remarks: str | None = None


@router.get("/matrix", dependencies=[Depends(require_permissions("attendance:view"))])
def matrix(
    month: int,
    year: int,
    employee: str | None = None,
    department: str | None = None,
    status: str | None = None,
    page: int = 1,
    page_size: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return attendance_matrix(db, month=month, year=year, employee=employee, department=department, status=status, page=page, page_size=page_size)


@router.get("/calendar", dependencies=[Depends(require_permissions("attendance:view"))])
def calendar(month: int, year: int, employee: str | None = None, department: str | None = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return attendance_calendar(db, month=month, year=year, employee=employee, department=department)


@router.get("/dashboard", dependencies=[Depends(require_permissions("attendance:view"))])
def dashboard(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return attendance_dashboard(db)


@router.get("/detail", dependencies=[Depends(require_permissions("attendance:view"))])
def detail(employee_id: str, attendance_date: date, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return attendance_detail(db, employee_id=employee_id, attendance_date=attendance_date)


@router.get("/employees/{employee_id}/summary", dependencies=[Depends(require_permissions("attendance:view"))])
def employee_monthly_summary(
    employee_id: UUID,
    month: int,
    year: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    employee = db.get(Employee, employee_id)
    if not employee:
        return {}
    return attendance_summary(db, employee=employee, month=month, year=year)


@router.post("/actions", dependencies=[Depends(require_permissions("attendance:manage"))])
def action(payload: AttendanceActionRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    employee = None
    try:
        employee = db.get(Employee, UUID(str(payload.employee_id)))
    except ValueError:
        employee = None
    employee = employee or find_employee_or_raise(db, payload.employee_id)
    record = record_attendance(
        db,
        employee=employee,
        attendance_date=payload.attendance_date,
        status=payload.status,
        remarks=payload.remarks or "Updated from Attendance Matrix",
        actor_id=current_user.id,
        action="attendance.corrected",
    )
    db.commit()
    return attendance_detail(db, employee_id=str(record.employee_id), attendance_date=payload.attendance_date)
