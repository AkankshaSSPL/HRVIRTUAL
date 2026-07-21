from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from app.agents.employee_agent.tools import employee_display_name, find_one_employee
from app.models.audit import AuditLog
from app.models.employee import AttendanceRecord, Employee, LeaveApproval, LeaveBalance, LeaveRequest, LeaveType
from app.models.employee.models import AttendanceStatus, LeaveCategory, LeaveRequestStatus


DEFAULT_LEAVE_TYPES = [
    ("Paid Leave", "PL", LeaveCategory.PAID, 12, True, False),
    ("Casual Leave", "CL", LeaveCategory.PAID, 12, True, False),
    ("Work From Home", "WFH", LeaveCategory.WFH, 0, True, False),
    ("Unpaid Leave", "UL", LeaveCategory.UNPAID, 0, True, True),
]


def create_or_update_leave_type(db: Session, command: str) -> dict[str, Any]:
    parsed = parse_leave_policy(command)
    existing = db.scalar(select(LeaveType).where(LeaveType.code == parsed["code"], LeaveType.deleted_at.is_(None)))
    leave_type = existing or LeaveType(name=parsed["name"], code=parsed["code"])
    now = datetime.now(timezone.utc)
    columns = _table_columns(db, "leave_types")
    leave_type.name = parsed["name"]
    leave_type.code = parsed["code"]
    leave_type.annual_quota = parsed["annual_allocation"]
    leave_type.is_paid = parsed["category"] != LeaveCategory.UNPAID
    if "category" in columns:
        leave_type.category = parsed["category"]
    if "annual_allocation" in columns:
        leave_type.annual_allocation = parsed["annual_allocation"]
    if "carry_forward_allowed" in columns:
        leave_type.carry_forward_allowed = parsed["carry_forward_allowed"]
    if "requires_approval" in columns:
        leave_type.requires_approval = parsed["requires_approval"]
    if "affects_payroll" in columns:
        leave_type.affects_payroll = parsed["affects_payroll"]
    if "active" in columns:
        leave_type.active = True
    leave_type.description = parsed.get("description")
    if not leave_type.created_at:
        leave_type.created_at = now
    leave_type.updated_at = now
    db.add(leave_type)
    db.flush()
    return leave_type_payload(leave_type)


def _table_columns(db: Session, table_name: str) -> set[str]:
    if not db.bind:
        return set()
    return {column["name"] for column in inspect(db.bind).get_columns(table_name)}


def parse_leave_policy(command: str) -> dict[str, Any]:
    normalized = command.lower()
    leave_name = parse_leave_type(command)
    category = leave_category_from_name(leave_name)
    allocation_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:days?)\s*(?:per|yearly|annual|annually|a year|year)?", command, re.IGNORECASE)
    allocation = float(allocation_match.group(1)) if allocation_match else (0 if category in {LeaveCategory.WFH, LeaveCategory.UNPAID} else 12)
    return {
        "name": leave_name,
        "code": leave_code(leave_name),
        "category": category,
        "annual_allocation": allocation,
        "carry_forward_allowed": "carry forward" in normalized,
        "requires_approval": "no approval" not in normalized,
        "affects_payroll": category == LeaveCategory.UNPAID,
        "description": f"Created from Agent Command: {command}",
    }


def parse_leave_dates(command: str) -> tuple[date, date]:
    iso_dates = re.findall(r"\b(20\d{2}-\d{2}-\d{2})\b", command)
    if len(iso_dates) >= 2:
        return date.fromisoformat(iso_dates[0]), date.fromisoformat(iso_dates[1])
    if len(iso_dates) == 1:
        target = date.fromisoformat(iso_dates[0])
        return target, target
    day_months = re.findall(r"\b(\d{1,2})\s+(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december)\b", command, re.IGNORECASE)
    if day_months:
        start = _date_from_day_month(day_months[0])
        end = _date_from_day_month(day_months[1]) if len(day_months) > 1 else start
        return start, end
    ordinal_range = re.search(
        r"\b(?:date\s+)?(?:from\s+|on\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:\s*(?:to|-|through|till|until)\s*(\d{1,2})(?:st|nd|rd|th)?)?\b",
        command,
        re.IGNORECASE,
    )
    if ordinal_range:
        start = _date_from_day_number(ordinal_range.group(1))
        end = _date_from_day_number(ordinal_range.group(2) or ordinal_range.group(1))
        if end < start:
            end = _date_from_day_number(ordinal_range.group(2) or ordinal_range.group(1), month_offset=1)
        return start, end
    if re.search(r"\btomorrow\b", command, re.IGNORECASE):
        target = date.today() + timedelta(days=1)
        return target, target
    weekday_match = re.search(r"\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b", command, re.IGNORECASE)
    if weekday_match:
        target = _next_weekday(weekday_match.group(1))
        return target, target
    today = date.today()
    return today, today


def parse_leave_type(command: str) -> str:
    normalized = command.lower()
    if "work from home" in normalized or "wfh" in normalized:
        return "Work From Home"
    if "unpaid" in normalized or "lop" in normalized:
        return "Unpaid Leave"
    if "sick" in normalized:
        return "Sick Leave"
    if "paid" in normalized or "earned" in normalized or "privilege" in normalized:
        return "Paid Leave"
    if "casual" in normalized:
        return "Casual Leave"
    return "Casual Leave"


def employee_query(command: str) -> str | None:
    normalized = command.lower()
    if "pending" in normalized and ("leave" in normalized or "approval" in normalized) and " for " not in normalized:
        return None
    patterns = [
        r"(?:leave\s+)?(?:balance|history|calendar)\s+for\s+([A-Za-z][A-Za-z\s.]*?)$",
        r"(?:for|balance for|history for|calendar for)\s+([A-Za-z][A-Za-z\s.]*?)(?=\s+(?:from|on|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|balance|history|$))",
        r"(?:approve|reject|cancel)\s+([A-Za-z][A-Za-z\s.]*?)\s+leave",
        r"(?:show)\s+([A-Za-z][A-Za-z\s.]*?)\s+leave",
    ]
    for pattern in patterns:
        match = re.search(pattern, command, re.IGNORECASE)
        if match:
            value = match.group(1).strip()
            if value.lower() in {"pending", "team", "all"}:
                return None
            return value
    return None


def create_leave_request(db: Session, *, employee: Employee, leave_type_name: str, start_date: date, end_date: date, reason: str | None = None, requested_by=None) -> LeaveRequest:
    ensure_default_leave_types(db)
    if end_date < start_date:
        raise ValueError("Leave end date cannot be before the start date.")
    overlapping = find_overlapping_leave_request(db, employee_id=employee.id, start_date=start_date, end_date=end_date)
    if overlapping:
        raise ValueError(
            f"{employee_display_name(employee)} already has {str(overlapping.status).lower()} "
            f"{overlapping.leave_type} from {overlapping.start_date.strftime('%d %b %Y')} "
            f"to {overlapping.end_date.strftime('%d %b %Y')}."
        )
    leave_type = get_leave_type(db, leave_type_name)
    working_dates = leave_working_dates(db, employee_id=employee.id, start_date=start_date, end_date=end_date)
    total_days = len(working_dates)
    if not total_days:
        raise ValueError("The selected date range contains only weekends or non-working days.")
    validate_available_balance(
        db,
        employee=employee,
        leave_type_name=leave_type.name if leave_type else leave_type_name,
        year=start_date.year,
        requested_days=total_days,
    )
    request = LeaveRequest(
        employee_id=employee.id,
        leave_type_id=leave_type.id if leave_type else None,
        leave_type=leave_type.name if leave_type else leave_type_name,
        start_date=start_date,
        end_date=end_date,
        from_date=start_date,
        to_date=end_date,
        total_days=total_days,
        reason=reason,
        status=LeaveRequestStatus.PENDING,
        requested_by=requested_by,
    )
    db.add(request)
    db.flush()
    db.refresh(request)
    db.add(LeaveApproval(leave_request_id=request.id, status=LeaveRequestStatus.PENDING))
    audit_leave_action(db, action="leave.applied", payload=leave_request_payload(request, employee), performed_by=requested_by, entity_id=request.id)
    return request


def leave_working_dates(db: Session, *, employee_id: UUID, start_date: date, end_date: date) -> list[date]:
    non_working_records = db.scalars(
        select(AttendanceRecord).where(
            AttendanceRecord.employee_id == employee_id,
            AttendanceRecord.attendance_date >= start_date,
            AttendanceRecord.attendance_date <= end_date,
            AttendanceRecord.status.in_([AttendanceStatus.WEEKLY_OFF, AttendanceStatus.HOLIDAY]),
            AttendanceRecord.deleted_at.is_(None),
        )
    )
    non_working_dates = {record.attendance_date for record in non_working_records}
    dates: list[date] = []
    current = start_date
    while current <= end_date:
        if current.weekday() < 5 and current not in non_working_dates:
            dates.append(current)
        current += timedelta(days=1)
    return dates


def validate_available_balance(
    db: Session,
    *,
    employee: Employee,
    leave_type_name: str,
    year: int,
    requested_days: int,
) -> None:
    balance_leave_type = "Paid Leave" if leave_type_name in {"Sick Leave", "Earned Leave"} else leave_type_name
    if balance_leave_type in {"Unpaid Leave", "Work From Home"}:
        return
    ensure_default_balances(db, employee=employee, year=year)
    balance = db.scalar(
        select(LeaveBalance).where(
            LeaveBalance.employee_id == employee.id,
            LeaveBalance.leave_type == balance_leave_type,
            LeaveBalance.year == year,
            LeaveBalance.deleted_at.is_(None),
        )
    )
    remaining = float(balance.remaining or 0) if balance else 0
    if requested_days > remaining:
        raise ValueError(
            f"{employee_display_name(employee)} requested {requested_days} working days of {balance_leave_type}, "
            f"but only {remaining:g} days are available."
        )


def find_overlapping_leave_request(db: Session, *, employee_id: UUID, start_date: date, end_date: date) -> LeaveRequest | None:
    return db.scalar(
        select(LeaveRequest)
        .where(
            LeaveRequest.employee_id == employee_id,
            LeaveRequest.deleted_at.is_(None),
            LeaveRequest.status.in_([LeaveRequestStatus.PENDING, LeaveRequestStatus.APPROVED]),
            LeaveRequest.start_date <= end_date,
            LeaveRequest.end_date >= start_date,
        )
        .order_by(LeaveRequest.created_at.desc())
        .limit(1)
    )


def approve_leave_request(db: Session, *, request_id: str, actor_id: str | None = None, comments: str | None = None) -> dict[str, Any]:
    request = db.scalar(select(LeaveRequest).where(LeaveRequest.id == UUID(str(request_id))).with_for_update())
    if request is None:
        raise LookupError("Leave request not found")
    if request.status == LeaveRequestStatus.APPROVED:
        return leave_request_payload(request)
    request.status = LeaveRequestStatus.APPROVED
    request.approved_by = UUID(str(actor_id)) if actor_id else None
    request.approved_at = datetime.now(timezone.utc)
    approval = _latest_leave_approval(db, request.id) or LeaveApproval(leave_request_id=request.id)
    approval.status = LeaveRequestStatus.APPROVED
    approval.approver_id = UUID(str(actor_id)) if actor_id else None
    approval.comments = comments
    approval.action_date = datetime.now(timezone.utc)
    db.add(approval)
    category = leave_request_category(db, request)
    if category == LeaveCategory.WFH:
        mark_wfh_attendance(db, request)
    elif category == LeaveCategory.PAID:
        consume_balance(db, request)
    audit_leave_action(db, action="leave.approved", payload=leave_request_payload(request), performed_by=actor_id, entity_id=request.id)
    db.add(request)
    db.flush()
    return leave_request_payload(request)


def reject_leave_request(db: Session, *, request_id: str, actor_id: str | None = None, comments: str | None = None) -> dict[str, Any]:
    request = db.scalar(select(LeaveRequest).where(LeaveRequest.id == UUID(str(request_id))).with_for_update())
    if request is None:
        raise LookupError("Leave request not found")
    request.status = LeaveRequestStatus.REJECTED
    approval = _latest_leave_approval(db, request.id) or LeaveApproval(leave_request_id=request.id)
    approval.status = LeaveRequestStatus.REJECTED
    approval.approver_id = UUID(str(actor_id)) if actor_id else None
    approval.comments = comments
    approval.action_date = datetime.now(timezone.utc)
    db.add(approval)
    audit_leave_action(db, action="leave.rejected", payload=leave_request_payload(request), performed_by=actor_id, entity_id=request.id)
    db.add(request)
    db.flush()
    return leave_request_payload(request)


def cancel_leave_request(db: Session, *, request_id: str, actor_id: str | None = None) -> dict[str, Any]:
    request = db.scalar(select(LeaveRequest).where(LeaveRequest.id == UUID(str(request_id))).with_for_update())
    if request is None:
        raise LookupError("Leave request not found")
    if request.status == LeaveRequestStatus.CANCELLED:
        return leave_request_payload(request)
    was_approved = request.status == LeaveRequestStatus.APPROVED
    old_payload = leave_request_payload(request)
    if was_approved:
        category = leave_request_category(db, request)
        if category == LeaveCategory.WFH:
            remove_wfh_attendance(db, request)
        elif category == LeaveCategory.PAID:
            restore_balance(db, request)
    request.status = LeaveRequestStatus.CANCELLED
    approval = _latest_leave_approval(db, request.id)
    if approval:
        approval.status = LeaveRequestStatus.CANCELLED
        approval.approver_id = UUID(str(actor_id)) if actor_id else approval.approver_id
        approval.action_date = datetime.now(timezone.utc)
        db.add(approval)
    audit_leave_action(
        db,
        action="leave.cancelled",
        payload={"before": old_payload, "after": leave_request_payload(request)},
        performed_by=actor_id,
        entity_id=request.id,
    )
    db.add(request)
    db.flush()
    return leave_request_payload(request)


def leave_request_payload(request: LeaveRequest, employee: Employee | None = None) -> dict[str, Any]:
    employee = employee or request.employee
    return {
        "id": str(request.id),
        "employee_id": str(request.employee_id),
        "employee_name": employee_display_name(employee) if employee else None,
        "leave_type": request.leave_type,
        "leave_type_id": str(request.leave_type_id) if request.leave_type_id else None,
        "start_date": request.start_date.isoformat(),
        "end_date": request.end_date.isoformat(),
        "from_date": (request.from_date or request.start_date).isoformat(),
        "to_date": (request.to_date or request.end_date).isoformat(),
        "total_days": float(request.total_days),
        "status": str(request.status),
        "reason": request.reason,
        "applied_at": request.created_at.isoformat() if request.created_at else None,
        "approved_at": request.approved_at.isoformat() if request.approved_at else None,
    }


def leave_type_payload(leave_type: LeaveType) -> dict[str, Any]:
    return {
        "id": str(leave_type.id),
        "name": leave_type.name,
        "code": leave_type.code,
        "category": str(leave_type.category),
        "annual_allocation": float(leave_type.annual_allocation or leave_type.annual_quota or 0),
        "carry_forward_allowed": bool(leave_type.carry_forward_allowed),
        "requires_approval": bool(leave_type.requires_approval),
        "affects_payroll": bool(leave_type.affects_payroll),
        "active": bool(leave_type.active),
    }


def leave_balances(db: Session, *, employee: Employee, year: int | None = None) -> list[dict[str, Any]]:
    year = year or date.today().year
    ensure_default_balances(db, employee=employee, year=year)
    balances = db.scalars(
        select(LeaveBalance)
        .join(LeaveType, LeaveBalance.leave_type_id == LeaveType.id)
        .where(
            LeaveBalance.employee_id == employee.id,
            LeaveBalance.year == year,
            LeaveBalance.deleted_at.is_(None),
            LeaveType.deleted_at.is_(None),
            LeaveType.active.is_(True),
        )
    )
    return [
        {
            "employee_id": str(balance.employee_id),
            "employee_name": employee_display_name(employee),
            "leave_type": balance.leave_type,
            "leave_type_id": str(balance.leave_type_id) if balance.leave_type_id else None,
            "year": balance.year,
            "allocated": float(balance.allocated or balance.opening_balance or 0),
            "opening_balance": float(balance.opening_balance or 0),
            "accrued": float(balance.accrued or 0),
            "used": float(balance.used or 0),
            "remaining": float(balance.remaining or 0),
        }
        for balance in balances
    ]


def leave_history(db: Session, *, employee: Employee, limit: int = 20) -> list[dict[str, Any]]:
    requests = db.scalars(select(LeaveRequest).where(LeaveRequest.employee_id == employee.id, LeaveRequest.deleted_at.is_(None)).order_by(LeaveRequest.created_at.desc()).limit(limit))
    return [leave_request_payload(request, employee) for request in requests]


def pending_leave_requests(db: Session, employee_name: str | None = None) -> list[dict[str, Any]]:
    statement = select(LeaveRequest).where(LeaveRequest.status == LeaveRequestStatus.PENDING, LeaveRequest.deleted_at.is_(None)).order_by(LeaveRequest.created_at.desc())
    requests = list(db.scalars(statement))
    if employee_name:
        normalized = _normalize(employee_name)
        requests = [request for request in requests if normalized in _normalize(employee_display_name(request.employee))]
    return [leave_request_payload(request) for request in requests]


def cancellable_leave_requests(
    db: Session,
    *,
    employee_name: str,
    start_date: date,
    end_date: date,
) -> list[dict[str, Any]]:
    employee = find_one_employee(db, employee_name)
    if not employee:
        return []
    requests = db.scalars(
        select(LeaveRequest)
        .where(
            LeaveRequest.employee_id == employee.id,
            LeaveRequest.deleted_at.is_(None),
            LeaveRequest.status.in_([LeaveRequestStatus.PENDING, LeaveRequestStatus.APPROVED]),
            LeaveRequest.start_date <= end_date,
            LeaveRequest.end_date >= start_date,
        )
        .order_by(LeaveRequest.created_at.desc())
    )
    return [leave_request_payload(request, employee) for request in requests]


def team_leave_calendar(db: Session, *, start_date: date | None = None, end_date: date | None = None) -> list[dict[str, Any]]:
    start_date = start_date or date.today()
    end_date = end_date or (start_date + timedelta(days=30))
    requests = db.scalars(
        select(LeaveRequest)
        .where(
            LeaveRequest.deleted_at.is_(None),
            LeaveRequest.status.in_([LeaveRequestStatus.PENDING, LeaveRequestStatus.APPROVED]),
            LeaveRequest.start_date <= end_date,
            LeaveRequest.end_date >= start_date,
        )
        .order_by(LeaveRequest.start_date.asc())
    )
    return [leave_request_payload(request) for request in requests]


def find_employee_or_raise(db: Session, query: str | None) -> Employee:
    if not query or not query.strip():
        raise LookupError("Please provide the employee name for this leave request")
    employee = find_one_employee(db, query or "")
    if not employee:
        raise LookupError("Employee not found for leave request")
    return employee


def get_leave_type(db: Session, name: str) -> LeaveType | None:
    ensure_default_leave_types(db)
    return db.scalar(select(LeaveType).where(LeaveType.deleted_at.is_(None), LeaveType.active.is_(True), LeaveType.name.ilike(name)))


def get_leave_type_for_request(db: Session, request: LeaveRequest) -> LeaveType | None:
    if request.leave_type_id:
        leave_type = db.get(LeaveType, request.leave_type_id)
        if leave_type and not leave_type.deleted_at:
            return leave_type
    if request.leave_type:
        return db.scalar(
            select(LeaveType).where(
                LeaveType.deleted_at.is_(None),
                LeaveType.name.ilike(request.leave_type),
            )
        )
    return None


def leave_request_category(db: Session, request: LeaveRequest) -> LeaveCategory:
    leave_type = get_leave_type_for_request(db, request)
    if leave_type and leave_type.category:
        return LeaveCategory(str(leave_type.category))
    return leave_category_from_name(request.leave_type or "")


def ensure_default_leave_types(db: Session) -> None:
    now = datetime.now(timezone.utc)
    for name, code, category, allocation, requires_approval, affects_payroll in DEFAULT_LEAVE_TYPES:
        existing = db.scalar(select(LeaveType).where(LeaveType.code == code, LeaveType.deleted_at.is_(None)))
        if existing:
            continue
        db.add(
            LeaveType(
                name=name,
                code=code,
                category=category,
                annual_allocation=allocation,
                annual_quota=allocation,
                is_paid=category != LeaveCategory.UNPAID,
                requires_approval=requires_approval,
                affects_payroll=affects_payroll,
                active=True,
                created_at=now,
                updated_at=now,
            )
        )
    db.flush()


def ensure_default_balances(db: Session, *, employee: Employee, year: int) -> None:
    ensure_default_leave_types(db)
    types = db.scalars(select(LeaveType).where(LeaveType.deleted_at.is_(None), LeaveType.active.is_(True)))
    for leave_type in types:
        existing = db.scalar(
            select(LeaveBalance).where(
                LeaveBalance.employee_id == employee.id,
                LeaveBalance.leave_type == leave_type.name,
                LeaveBalance.year == year,
            )
        )
        if existing:
            if not existing.leave_type_id:
                existing.leave_type_id = leave_type.id
            if not float(existing.allocated or 0):
                existing.allocated = float(existing.opening_balance or leave_type.annual_allocation or 0)
            db.add(existing)
            continue
        allocation = float(leave_type.annual_allocation or leave_type.annual_quota or 0)
        db.add(
            LeaveBalance(
                employee_id=employee.id,
                leave_type_id=leave_type.id,
                leave_type=leave_type.name,
                year=year,
                allocated=allocation,
                opening_balance=allocation,
                accrued=0,
                used=0,
                remaining=allocation,
            )
        )
    db.flush()


def consume_balance(db: Session, request: LeaveRequest) -> None:
    ensure_default_balances(db, employee=request.employee, year=request.start_date.year)
    leave_type = get_leave_type_for_request(db, request)
    balance_leave_type_id = leave_type.id if leave_type else request.leave_type_id
    balance_leave_type = leave_type.name if leave_type else ("Paid Leave" if request.leave_type in {"Sick Leave", "Earned Leave"} else request.leave_type)
    balance = db.scalar(
        select(LeaveBalance).where(
            LeaveBalance.employee_id == request.employee_id,
            (
                LeaveBalance.leave_type_id == balance_leave_type_id
                if balance_leave_type_id
                else LeaveBalance.leave_type == balance_leave_type
            ),
            LeaveBalance.year == request.start_date.year,
            LeaveBalance.deleted_at.is_(None),
        ).with_for_update()
    )
    if balance:
        balance.used = float(balance.used or 0) + float(request.total_days or 0)
        balance.remaining = max(0, float(balance.remaining or 0) - float(request.total_days or 0))
        db.add(balance)


def restore_balance(db: Session, request: LeaveRequest) -> None:
    ensure_default_balances(db, employee=request.employee, year=request.start_date.year)
    leave_type = get_leave_type_for_request(db, request)
    balance_leave_type_id = leave_type.id if leave_type else request.leave_type_id
    balance_leave_type = leave_type.name if leave_type else ("Paid Leave" if request.leave_type in {"Sick Leave", "Earned Leave"} else request.leave_type)
    balance = db.scalar(
        select(LeaveBalance).where(
            LeaveBalance.employee_id == request.employee_id,
            (
                LeaveBalance.leave_type_id == balance_leave_type_id
                if balance_leave_type_id
                else LeaveBalance.leave_type == balance_leave_type
            ),
            LeaveBalance.year == request.start_date.year,
            LeaveBalance.deleted_at.is_(None),
        ).with_for_update()
    )
    if balance:
        restored_days = float(request.total_days or 0)
        balance.used = max(0, float(balance.used or 0) - restored_days)
        balance.remaining = min(float(balance.allocated or 0), float(balance.remaining or 0) + restored_days)
        db.add(balance)


def mark_wfh_attendance(db: Session, request: LeaveRequest) -> None:
    now = datetime.now(timezone.utc)
    current = request.start_date
    while current <= request.end_date:
        existing = db.scalar(select(AttendanceRecord).where(AttendanceRecord.employee_id == request.employee_id, AttendanceRecord.attendance_date == current))
        record = existing or AttendanceRecord(employee_id=request.employee_id, attendance_date=current, created_at=now, updated_at=now)
        record.status = AttendanceStatus.WORK_FROM_HOME
        record.source = "leave_agent"
        record.remarks = f"WFH approved via leave request {request.id}"
        if not record.created_at:
            record.created_at = now
        record.updated_at = now
        db.add(record)
        current += timedelta(days=1)


def remove_wfh_attendance(db: Session, request: LeaveRequest) -> None:
    now = datetime.now(timezone.utc)
    records = db.scalars(
        select(AttendanceRecord).where(
            AttendanceRecord.employee_id == request.employee_id,
            AttendanceRecord.attendance_date >= request.start_date,
            AttendanceRecord.attendance_date <= request.end_date,
            AttendanceRecord.source == "leave_agent",
            AttendanceRecord.remarks == f"WFH approved via leave request {request.id}",
            AttendanceRecord.deleted_at.is_(None),
        )
    )
    for record in records:
        record.deleted_at = now
        record.updated_at = now
        db.add(record)


def audit_leave_action(db: Session, *, action: str, payload: dict[str, Any], performed_by: str | UUID | None = None, entity_id: UUID | None = None) -> None:
    db.add(
        AuditLog(
            entity_type="leave_request",
            entity_id=entity_id,
            action=action,
            old_value=None,
            new_value=payload,
            performed_by=UUID(str(performed_by)) if performed_by else None,
        )
    )


def _latest_leave_approval(db: Session, request_id: UUID) -> LeaveApproval | None:
    return db.scalar(select(LeaveApproval).where(LeaveApproval.leave_request_id == request_id).order_by(LeaveApproval.created_at.desc()))


def leave_category_from_name(name: str) -> LeaveCategory:
    normalized = name.lower()
    if "wfh" in normalized or "work from home" in normalized:
        return LeaveCategory.WFH
    if "unpaid" in normalized:
        return LeaveCategory.UNPAID
    return LeaveCategory.PAID


def leave_code(name: str) -> str:
    known = {
        "Paid Leave": "PL",
        "Sick Leave": "SL",
        "Casual Leave": "CL",
        "Work From Home": "WFH",
        "Unpaid Leave": "UL",
    }
    return known.get(name, "".join(part[0] for part in name.split()).upper()[:12])


def _date_from_day_month(value: tuple[str, str]) -> date:
    months = {name.lower(): idx for idx, names in enumerate([(), ("jan", "january"), ("feb", "february"), ("mar", "march"), ("apr", "april"), ("may",), ("jun", "june"), ("jul", "july"), ("aug", "august"), ("sep", "september"), ("oct", "october"), ("nov", "november"), ("dec", "december")]) for name in names}
    return date(date.today().year, months[value[1].lower()], int(value[0]))


def _date_from_day_number(day: str, *, month_offset: int = 0) -> date:
    today = date.today()
    month = today.month + month_offset
    year = today.year
    while month > 12:
        month -= 12
        year += 1
    last_day = 28
    while True:
        try:
            date(year, month, last_day + 1)
            last_day += 1
        except ValueError:
            break
    return date(year, month, min(int(day), last_day))


def _next_weekday(name: str) -> date:
    weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    target = weekdays.index(name.lower())
    today = date.today()
    delta = (target - today.weekday()) % 7
    return today + timedelta(days=delta or 7)


def _normalize(value: str) -> str:
    return "".join(ch for ch in value.lower() if ch.isalnum())
