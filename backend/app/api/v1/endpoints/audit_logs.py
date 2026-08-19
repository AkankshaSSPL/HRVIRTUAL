from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_permissions
from app.db.session import get_db
from app.models.audit import AuditLog
from app.models.auth import User
from app.models.employee import Employee
from sqlalchemy import or_

router = APIRouter()

class AuditLogEntry(BaseModel):
    id: UUID
    created_at: datetime
    title: str
    message: str
    performed_by_name: str | None

class AuditLogsResponse(BaseModel):
    logs: list[AuditLogEntry]
    total: int

def format_audit_log(log: AuditLog, user_map: dict[UUID, str], emp_map: dict[UUID, str]) -> AuditLogEntry:
    performed_by_name = user_map.get(log.performed_by, "System") if log.performed_by else "System"
    
    # Try to extract a name from the new_value or old_value payload or emp_map
    payload = log.new_value or log.old_value or {}
    entity_name = ""
    
    if log.entity_type == "employee":
        entity_name = emp_map.get(log.entity_id, "")
    elif log.entity_type == "attendance_record":
        # Usually attendance records have employee_id in payload, but they also have employee_name directly
        entity_name = payload.get("employee_name") or ""
        
    if not entity_name:
        entity_name = payload.get("name") or payload.get("first_name", "") + " " + payload.get("last_name", "")
        entity_name = entity_name.strip()
        
    if not entity_name:
        entity_name = str(log.entity_id)

    title = "System Event"
    message = f"{log.action} performed on {log.entity_type} {entity_name}"
    
    action = log.action
    
    # Employee events
    if action == "employee.created_from_onboarding":
        title = "Employee Onboarded"
        message = f"{entity_name} is onboarded."
    elif action == "employee.deactivated_from_form":
        title = "Employee Deactivated"
        message = f"{entity_name} was deactivated."
    elif action == "employee.seat_assigned":
        title = "Seat Assigned"
        message = f"A seat was assigned to {entity_name}."
    elif action == "employee.onboarding_assets_assigned":
        title = "Assets Assigned"
        message = f"Assets were assigned to {entity_name}."
    elif action == "employee.welcome_kit_sent":
        title = "Welcome Kit Sent"
        message = f"Welcome kit was sent to {entity_name}."
    elif action == "employee.updated_from_form":
        title = "Employee Updated"
        message = f"Profile details updated for {entity_name}."
    elif action == "employee.onboarding_status_checked":
        title = "Onboarding Status Checked"
        message = f"Checked pending onboarding status for {entity_name}."
        
    # Attendance events
    elif log.entity_type == "attendance_record" or action.startswith("attendance."):
        # e.g., action="attendance.recorded" or "attendance.corrected"
        status = payload.get("attendance_status", payload.get("status", "recorded")).replace("_", " ").title()
        if "absent" in status.lower():
            title = "Attendance Marked"
            message = f"{entity_name} is absent today."
        else:
            title = "Attendance Marked"
            message = f"{entity_name} marked as {status}."
            
    # Approval events
    elif action == "approval.created":
        title = "Approval Requested"
        message = f"An approval request was created for {log.entity_type.replace('_', ' ')}."
    elif action == "approval.workflow_executed":
        title = "Approval Workflow Executed"
        message = f"Workflow executed for {log.entity_type.replace('_', ' ')}."
    elif action == "approval.approved":
        title = "Request Approved"
        message = f"{performed_by_name} approved the request."
    elif action == "approval.rejected":
        title = "Request Rejected"
        message = f"{performed_by_name} rejected the request."
        
    # Leave events
    elif action == "leave.applied":
        title = "Leave Requested"
        message = f"{entity_name} requested leave."
    elif action == "leave.approved":
        title = "Leave Approved"
        message = f"Leave approved for {entity_name}."
    elif action == "leave.rejected":
        title = "Leave Rejected"
        message = f"Leave rejected for {entity_name}."
    elif action == "leave.cancelled":
        title = "Leave Cancelled"
        message = f"Leave cancelled for {entity_name}."
        
    # Payroll events
    elif action == "salary_assignment.requested":
        title = "Salary Update Requested"
        message = f"Salary update requested for {entity_name}."
    elif action == "salary_assignment.activated" or action == "employee.salary_update.executed":
        title = "Salary Updated"
        message = f"Salary details updated for {entity_name}."
    
    # Very minor title fixes for attendance
    if "attendance" in action:
        status = payload.get("attendance_status", payload.get("status", "recorded")).replace("_", " ").title()
        if "absent" in status.lower():
            title = "Employee Absent"
            message = f"{entity_name} is absent today."
        else:
            title = "Attendance Marked"
            message = f"{entity_name} marked as {status}."

    return AuditLogEntry(
        id=log.id,
        created_at=log.created_at,
        title=title,
        message=message,
        performed_by_name=performed_by_name
    )

@router.get("", response_model=AuditLogsResponse, dependencies=[Depends(require_permissions("audit_logs:view"))])
def get_audit_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ALLOWED_ACTIONS = [
        # Employee / Onboarding / Assets
        "employee.created_from_onboarding",
        "employee.deactivated_from_form",
        "employee.seat_assigned",
        "employee.onboarding_assets_assigned",
        "employee.welcome_kit_sent",
        
        # Attendance (manual overrides only to prevent daily spam)
        "attendance.corrected",
        "attendance.regularized",
        
        # Leave
        "leave.applied",
        "leave.approved",
        "leave.rejected",
        "leave.cancelled",
        
        # Approvals
        "approval.created",
        "approval.approved",
        "approval.rejected",
        
        # Payroll / Salary
        "salary_assignment.requested",
        "salary_assignment.activated",
        "employee.salary_update.executed"
    ]
    
    query = db.query(AuditLog).filter(
        AuditLog.action.in_(ALLOWED_ACTIONS)
    )
    
    total = query.count()
    logs = query.order_by(desc(AuditLog.created_at)).offset(skip).limit(limit).all()
    
    user_ids = {log.performed_by for log in logs if log.performed_by}
    users = db.query(User).filter(User.id.in_(user_ids)).all() if user_ids else []
    user_map = {u.id: u.full_name for u in users}
    
    emp_ids = {log.entity_id for log in logs if log.entity_type == "employee"}
    employees = db.query(Employee).filter(Employee.id.in_(emp_ids)).all() if emp_ids else []
    emp_map = {e.id: f"{e.first_name} {e.last_name}" for e in employees}
    
    entries = [format_audit_log(log, user_map, emp_map) for log in logs if format_audit_log(log, user_map, emp_map).title != "System Event"]
    
    return AuditLogsResponse(logs=entries, total=total)
