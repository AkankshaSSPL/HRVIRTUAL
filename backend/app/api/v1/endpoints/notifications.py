from typing import Any
from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy import select, and_, func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.auth import User
from app.models.employee import Employee, LeaveRequest
from app.models.employee.models import EmploymentStatus

router = APIRouter()

@router.get("")
def get_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Lightweight endpoint to get notification counts and top items.
    """
    notifications = []

    # 1. Pending Leaves (Assuming HR/Manager can see these; for now just returning count of pending leaves)
    pending_leaves_count = db.scalar(
        select(func.count(LeaveRequest.id)).where(
            LeaveRequest.status == "PENDING",
            LeaveRequest.deleted_at.is_(None)
        )
    )
    if pending_leaves_count and pending_leaves_count > 0:
        notifications.append({
            "id": "pending-leaves",
            "title": f"{pending_leaves_count} Pending Leave Approval{'s' if pending_leaves_count > 1 else ''}",
            "description": "You have leave requests waiting for review.",
            "action_type": "leave"
        })

    # 2. Pending Onboarding
    pending_onboarding = db.scalars(
        select(Employee).where(
            Employee.deleted_at.is_(None),
            Employee.welcome_kit_sent_at.is_(None)
        ).limit(3)
    ).all()
    
    pending_onboarding_count = db.scalar(
        select(func.count(Employee.id)).where(
            Employee.deleted_at.is_(None),
            Employee.welcome_kit_sent_at.is_(None)
        )
    )

    if pending_onboarding_count and pending_onboarding_count > 0:
        names = ", ".join(e.first_name for e in pending_onboarding)
        if pending_onboarding_count > 3:
            names += "..."
        notifications.append({
            "id": "pending-onboarding",
            "title": f"{pending_onboarding_count} Pending Onboarding{'s' if pending_onboarding_count > 1 else ''}",
            "description": names,
            "action_type": "employees"
        })

    # 3. Absent / On Leave Today
    today = date.today()
    absent_today = db.scalars(
        select(LeaveRequest).where(
            LeaveRequest.start_date <= today,
            LeaveRequest.end_date >= today,
            LeaveRequest.status == "APPROVED",
            LeaveRequest.deleted_at.is_(None)
        ).limit(3)
    ).all()
    
    absent_count = db.scalar(
        select(func.count(LeaveRequest.id)).where(
            LeaveRequest.start_date <= today,
            LeaveRequest.end_date >= today,
            LeaveRequest.status == "APPROVED",
            LeaveRequest.deleted_at.is_(None)
        )
    )

    if absent_count and absent_count > 0:
        names = ", ".join(r.employee.first_name for r in absent_today if r.employee)
        if absent_count > 3:
            names += "..."
        notifications.append({
            "id": "absent-today",
            "title": f"{absent_count} Out of Office Today",
            "description": names,
            "action_type": "calendar"
        })

    return {"notifications": notifications}
