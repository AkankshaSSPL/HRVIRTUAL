from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_permissions
from app.models.employee.models import Employee, EmploymentStatus, LeaveRequest
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
