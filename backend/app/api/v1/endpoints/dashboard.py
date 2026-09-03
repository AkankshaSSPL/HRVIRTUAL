from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_permissions, get_current_user
from app.models.employee.models import Employee, EmploymentStatus, LeaveRequest, EmployeeRecord, RecordType, AttendanceRecord, EmployeeAsset
from app.models.auth import User
from app.agents.attendance_agent.tools import attendance_summary
from app.models.approvals.models import ApprovalRequest, ApprovalStatus
from app.models.payroll.models import PayrollRunItem
from app.models.company.models import Announcement, CompanyHoliday
from app.models.employee.models import Meeting, MeetingAttendee, EmployeeDocument
from app.api.v1.endpoints.documents import document_payload
from sqlalchemy import desc, extract, or_, and_
from datetime import datetime, timezone, date as ddate

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
            "employment_type": "UNKNOWN",
            "seat_label": None,
            "assets": []
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

    # Fetch Assets
    active_assets = db.query(EmployeeAsset).filter(
        EmployeeAsset.employee_id == employee.id,
        EmployeeAsset.returned_at.is_(None)
    ).all()

    assets = [{
        "asset_type": a.asset_type,
        "asset_name": a.asset_name,
        "asset_code": a.asset_code,
    } for a in active_assets]

    return {
        "total_leaves": total_leaves,
        "warnings": warnings,
        "total_attendance": total_attendance,
        "working_days": working_days,
        "employment_type": employee.employment_type,
        "seat_label": employee.seat_label,
        "assets": assets
    }

@router.get("/my-records")
def get_my_records(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    employee = db.query(Employee).filter(Employee.user_id == current_user.id).first()
    if not employee:
        return []

    records = db.query(EmployeeRecord).filter(
        EmployeeRecord.employee_id == employee.id
    ).order_by(desc(EmployeeRecord.date_issued)).all()

    return [
        {
            "id": str(r.id),
            "record_type": r.record_type,
            "title": r.title,
            "description": r.description,
            "date_issued": r.date_issued.isoformat() if r.date_issued else None
        } for r in records
    ]

@router.get("/announcements")
def get_recent_announcements(db: Session = Depends(get_db)):
    announcements = db.query(Announcement).order_by(desc(Announcement.publish_date)).limit(5).all()
    return [
        {
            "id": str(a.id),
            "title": a.title,
            "category": a.category,
            "priority": a.priority,
            "publish_date": a.publish_date.strftime("%Y-%m-%d") if a.publish_date else None
        } for a in announcements
    ]

@router.get("/meetings")
def get_upcoming_meetings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    meetings = db.query(Meeting).join(MeetingAttendee).filter(
        MeetingAttendee.user_id == current_user.id,
        Meeting.end_time >= now
    ).order_by(Meeting.start_time).limit(5).all()

    return [
        {
            "id": str(m.id),
            "title": m.title,
            "description": m.description,
            "start_time": m.start_time.isoformat(),
            "end_time": m.end_time.isoformat(),
            "organizer_id": str(m.organizer_id)
        } for m in meetings
    ]

@router.get("/calendar")
def get_calendar_events(month: int, year: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    events = []
    
    # 1. Meetings
    meetings = db.query(Meeting).join(MeetingAttendee).filter(
        MeetingAttendee.user_id == current_user.id,
        extract('month', Meeting.start_time) == month,
        extract('year', Meeting.start_time) == year
    ).all()
    
    for m in meetings:
        events.append({
            "id": f"meeting_{m.id}",
            "type": "meeting",
            "title": m.title,
            "date": m.start_time.isoformat(),
            "end_date": m.end_time.isoformat()
        })
        
    # 2. Holidays
    holidays = db.query(CompanyHoliday).filter(
        extract('month', CompanyHoliday.date) == month,
        extract('year', CompanyHoliday.date) == year
    ).all()
    
    for h in holidays:
        events.append({
            "id": f"holiday_{h.id}",
            "type": "holiday",
            "title": h.title,
            "date": h.date.isoformat(),
            "end_date": None
        })
        
    # 3. Leaves
    leaves = db.query(LeaveRequest).join(Employee).filter(
        LeaveRequest.status == "APPROVED",
        or_(
            and_(extract('month', LeaveRequest.start_date) == month, extract('year', LeaveRequest.start_date) == year),
            and_(extract('month', LeaveRequest.end_date) == month, extract('year', LeaveRequest.end_date) == year)
        )
    ).all()
    
    for l in leaves:
        employee_name = f"{l.employee.first_name} {l.employee.last_name}" if l.employee else "Employee"
        events.append({
            "id": f"leave_{l.id}",
            "type": "leave",
            "title": f"{employee_name} - {l.leave_type.replace('_', ' ').title()}",
            "date": l.start_date.isoformat(),
            "end_date": l.end_date.isoformat()
        })
        
    # 4. Birthdays
    employees_with_birthdays = db.query(Employee).filter(
        extract('month', Employee.dob) == month,
        Employee.employment_status == EmploymentStatus.ACTIVE
    ).all()
    
    for e in employees_with_birthdays:
        if e.dob:
            bday_date = ddate(year, month, e.dob.day)
            events.append({
                "id": f"birthday_{e.id}",
                "type": "birthday",
                "title": f"{e.first_name} {e.last_name}",
                "date": bday_date.isoformat(),
                "end_date": None
            })
            
    return events

@router.get("/my-documents")
def get_my_documents(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    employee = db.query(Employee).filter(Employee.user_id == current_user.id).first()
    if not employee:
        return []

    documents = db.query(EmployeeDocument).filter(
        EmployeeDocument.employee_id == employee.id,
        EmployeeDocument.deleted_at.is_(None)
    ).order_by(desc(EmployeeDocument.created_at)).all()

    return [document_payload(doc) for doc in documents]
