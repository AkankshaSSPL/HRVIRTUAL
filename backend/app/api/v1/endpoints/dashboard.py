from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_permissions, get_current_user
from app.models.employee.models import Employee, EmploymentStatus, LeaveRequest, EmployeeRecord, RecordType, AttendanceRecord
from app.models.auth import User
from app.agents.attendance_agent.tools import attendance_summary
from app.models.approvals.models import ApprovalRequest, ApprovalStatus
from app.models.payroll.models import PayrollRunItem

router = APIRouter()

@router.get("/stats", dependencies=[Depends(require_permissions("employees:view"))])
def get_dashboard_stats(db: Session = Depends(get_db)):
    total_employees = db.query(Employee).filter(
        Employee.deleted_at.is_(None),
        Employee.employment_status == EmploymentStatus.ACTIVE
    ).count()

    pending_approvals = db.query(ApprovalRequest).filter(
        ApprovalRequest.deleted_at.is_(None),
        ApprovalRequest.status == ApprovalStatus.PENDING
    ).count()

    payroll_pending = db.query(PayrollRunItem).count()

    today = date.today()
    employees_on_leave = db.query(LeaveRequest).filter(
        LeaveRequest.deleted_at.is_(None),
        LeaveRequest.status == "APPROVED",
        LeaveRequest.start_date <= today,
        LeaveRequest.end_date >= today
    ).count()

    return {
        "total_employees": total_employees,
        "pending_approvals": pending_approvals,
        "active_agents": 3,
        "payroll_pending": payroll_pending,
        "employees_on_leave": employees_on_leave
    }


@router.get("/employee-stats")
def get_employee_dashboard_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # The current user should have an associated employee profile
    employee = db.query(Employee).filter(Employee.user_id == current_user.id).first()
    
    if not employee:
        # If no employee profile is attached, return zeroes
        return {
            "total_leaves": 0,
            "warnings": 0,
            "total_attendance": 0,
            "working_days": 0,
            "employment_type": "UNKNOWN"
        }

    total_leaves = db.query(LeaveRequest).filter(
        LeaveRequest.employee_id == employee.id
    ).count()

    warnings = db.query(EmployeeRecord).filter(
        EmployeeRecord.employee_id == employee.id,
        EmployeeRecord.record_type == RecordType.WARNING
    ).count()

    today = date.today()
    summary = attendance_summary(db, employee=employee, month=today.month, year=today.year)
    total_attendance = summary.get("present_days", 0)
    working_days = summary.get("working_days", 0)

    return {
        "total_leaves": total_leaves,
        "warnings": warnings,
        "total_attendance": total_attendance,
        "working_days": working_days,
        "employment_type": employee.employment_type
    }
