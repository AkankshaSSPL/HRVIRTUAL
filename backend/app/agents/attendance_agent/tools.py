from __future__ import annotations

import re
import calendar
from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import extract, func, or_, select
from sqlalchemy.orm import Session

from app.agents.employee_agent.tools import employee_display_name, find_one_employee
from app.models.audit import AuditLog
from app.models.employee import AttendanceRecord, Department, Employee, LeaveRequest
from app.models.employee.models import AttendanceStatus, LeaveCategory, LeaveRequestStatus
from app.services.lop_calculator import calculate_lop
from app.services.payroll_preparation_service import prepare_employee_payroll_input, prepare_monthly_payroll_input


def parse_month_year(command: str) -> tuple[int, int]:
    month_names = {name.lower(): idx for idx, name in enumerate(calendar.month_name) if name}
    normalized = command.lower()
    for name, idx in month_names.items():
        if name in normalized:
            year_match = re.search(r"\b(20\d{2})\b", command)
            return idx, int(year_match.group(1)) if year_match else date.today().year
    return date.today().month, date.today().year


def employee_query(command: str) -> str | None:
    match = re.search(r"(?:show|record|calculate|mark|open|regularize|correct)\s+([A-Za-z][A-Za-z\s.]*?)\s+(?:as\s+)?(?:attendance|lop|present|absent|half day|half-day|wfh|work from home)", command, re.IGNORECASE)
    return match.group(1).strip() if match else None


def parse_attendance_status(command: str) -> AttendanceStatus:
    normalized = command.lower().replace("-", "_")
    if "half_day" in normalized or "half day" in normalized:
        return AttendanceStatus.HALF_DAY
    if "weekly off" in normalized:
        return AttendanceStatus.WEEKLY_OFF
    if "holiday" in normalized:
        return AttendanceStatus.HOLIDAY
    if "work from home" in normalized or "wfh" in normalized:
        return AttendanceStatus.WORK_FROM_HOME
    if "on duty" in normalized:
        return AttendanceStatus.ON_DUTY
    if "absent" in normalized:
        return AttendanceStatus.ABSENT
    return AttendanceStatus.PRESENT


def parse_attendance_date(command: str) -> date:
    iso_match = re.search(r"\b(20\d{2}-\d{2}-\d{2})\b", command)
    if iso_match:
        return date.fromisoformat(iso_match.group(1))
    if re.search(r"\byesterday\b", command, re.IGNORECASE):
        return date.today() - timedelta(days=1)
    if re.search(r"\btomorrow\b", command, re.IGNORECASE):
        return date.today() + timedelta(days=1)
    day_month = re.search(r"\b(\d{1,2})\s+(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december)\b", command, re.IGNORECASE)
    if day_month:
        months = {name.lower(): idx for idx, names in enumerate([(), ("jan", "january"), ("feb", "february"), ("mar", "march"), ("apr", "april"), ("may",), ("jun", "june"), ("jul", "july"), ("aug", "august"), ("sep", "september"), ("oct", "october"), ("nov", "november"), ("dec", "december")]) for name in names}
        return date(date.today().year, months[day_month.group(2).lower()], int(day_month.group(1)))
    return date.today()


def record_attendance(
    db: Session,
    *,
    employee: Employee,
    attendance_date: date,
    status: str,
    check_in: time | None = None,
    check_out: time | None = None,
    total_hours: float | None = None,
    remarks: str | None = None,
    actor_id: str | UUID | None = None,
    action: str = "attendance.recorded",
) -> AttendanceRecord:
    now = datetime.now(timezone.utc)
    existing = db.scalar(select(AttendanceRecord).where(AttendanceRecord.employee_id == employee.id, AttendanceRecord.attendance_date == attendance_date))
    old_value = attendance_record_payload(existing, employee) if existing else None
    record = existing or AttendanceRecord(
        employee_id=employee.id,
        attendance_date=attendance_date,
        status=AttendanceStatus.PRESENT,
        created_at=now,
        updated_at=now,
    )
    record.status = AttendanceStatus(status.upper())
    record.check_in_time = check_in
    record.check_out_time = check_out
    record.total_hours = total_hours
    record.remarks = remarks
    record.source = "attendance_agent"
    if not record.created_at:
        record.created_at = now
    record.updated_at = now
    db.add(record)
    db.flush()
    db.refresh(record)
    audit_attendance_action(db, action=action, record=record, employee=employee, old_value=old_value, performed_by=actor_id)
    return record


def audit_attendance_action(db: Session, *, action: str, record: AttendanceRecord, employee: Employee, old_value: dict[str, Any] | None = None, performed_by: str | UUID | None = None) -> None:
    db.add(
        AuditLog(
            entity_type="attendance_record",
            entity_id=record.id,
            action=action,
            old_value=old_value,
            new_value=attendance_record_payload(record, employee),
            performed_by=UUID(str(performed_by)) if performed_by else None,
        )
    )


def monthly_attendance_records(db: Session, *, employee: Employee, month: int, year: int) -> list[AttendanceRecord]:
    return list(
        db.scalars(
            select(AttendanceRecord)
            .where(
                AttendanceRecord.employee_id == employee.id,
                extract("month", AttendanceRecord.attendance_date) == month,
                extract("year", AttendanceRecord.attendance_date) == year,
                AttendanceRecord.deleted_at.is_(None),
            )
            .order_by(AttendanceRecord.attendance_date.asc())
        )
    )


def attendance_summary(db: Session, *, employee: Employee, month: int, year: int) -> dict[str, Any]:
    days = [date(year, month, day) for day in range(1, calendar.monthrange(year, month)[1] + 1)]
    records = monthly_attendance_records(db, employee=employee, month=month, year=year)
    leaves = list(
        db.scalars(
            select(LeaveRequest).where(
                LeaveRequest.employee_id == employee.id,
                LeaveRequest.status == LeaveRequestStatus.APPROVED,
                LeaveRequest.start_date <= days[-1],
                LeaveRequest.end_date >= days[0],
                LeaveRequest.deleted_at.is_(None),
            )
        )
    )
    record_map = {record.attendance_date: record for record in records}
    cells = [_attendance_cell(employee, current_day, record_map.get(current_day), leaves) for current_day in days]
    counts = _empty_totals()
    earned_through = min(date.today(), days[-1])
    for cell in cells:
        if date.fromisoformat(cell["date"]) > earned_through:
            continue
        counts[cell["status"]] = counts.get(cell["status"], 0) + cell.get("count", 1)
    display_totals = _display_totals(cells, year=year, month=month)
    lop_days = (
        float(counts.get("ABSENT", 0))
        + float(counts.get("UNPAID_LEAVE", 0))
        + (float(counts.get("HALF_DAY", 0)) * 0.5)
    )
    return {
        "employee_id": str(employee.id),
        "employee_name": employee_display_name(employee),
        "employment_type": str(employee.employment_type),
        "month": month,
        "year": year,
        "working_days": display_totals["working_days"],
        "payable_days": display_totals["payable_days"],
        "present_days": counts.get("PRESENT", 0),
        "wfh_days": counts.get("WORK_FROM_HOME", 0),
        "absent_days": counts.get("ABSENT", 0),
        "half_days": counts.get("HALF_DAY", 0),
        "paid_leave_days": counts.get("PAID_LEAVE", 0),
        "unpaid_leave_days": counts.get("UNPAID_LEAVE", 0),
        "lop_days": round(lop_days, 2),
        "records": cells,
    }


def absent_on(db: Session, target_date: date) -> list[dict[str, Any]]:
    records = db.scalars(
        select(AttendanceRecord)
        .where(AttendanceRecord.attendance_date == target_date, AttendanceRecord.status == AttendanceStatus.ABSENT, AttendanceRecord.deleted_at.is_(None))
        .order_by(AttendanceRecord.created_at.desc())
    )
    return [attendance_record_payload(record, record.employee) for record in records]


def attendance_matrix(
    db: Session,
    *,
    month: int,
    year: int,
    employee: str | None = None,
    department: str | None = None,
    status: str | None = None,
    page: int = 1,
    page_size: int = 10,
) -> dict[str, Any]:
    days_in_month = calendar.monthrange(year, month)[1]
    days = [date(year, month, day) for day in range(1, days_in_month + 1)]
    page = max(page, 1)
    page_size = min(max(page_size, 1), 50)
    employees, total_rows = _matrix_employees(db, employee=employee, department=department, page=page, page_size=page_size)
    employee_ids = [item.id for item in employees]
    if not employee_ids:
        return {
            "month": month,
            "year": year,
            "days": [{"date": item.isoformat(), "day": item.day, "weekday": item.strftime("%a")} for item in days],
            "rows": [],
            "legend": ATTENDANCE_LEGEND,
            "filters": {"employee": employee, "department": department, "status": status},
            "summary": _empty_totals(),
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total_rows": total_rows,
                "total_pages": max(1, (total_rows + page_size - 1) // page_size),
            },
        }
    records = list(
        db.scalars(
            select(AttendanceRecord).where(
                AttendanceRecord.employee_id.in_(employee_ids),
                extract("month", AttendanceRecord.attendance_date) == month,
                extract("year", AttendanceRecord.attendance_date) == year,
                AttendanceRecord.deleted_at.is_(None),
            )
        )
    )
    leaves = list(
        db.scalars(
            select(LeaveRequest).where(
                LeaveRequest.employee_id.in_(employee_ids),
                LeaveRequest.status == LeaveRequestStatus.APPROVED,
                LeaveRequest.start_date <= days[-1],
                LeaveRequest.end_date >= days[0],
                LeaveRequest.deleted_at.is_(None),
            )
        )
    )
    record_map = {(record.employee_id, record.attendance_date): record for record in records}
    rows = []
    for item in employees:
        cells = []
        totals = _empty_totals()
        for current_day in days:
            cell = _attendance_cell(item, current_day, record_map.get((item.id, current_day)), leaves)
            if status and cell["status"] != status.upper():
                pass
            totals[cell["status"]] = totals.get(cell["status"], 0) + cell.get("count", cell["weight"])
            cells.append(cell)
        if status and not any(cell["status"] == status.upper() for cell in cells):
            continue
        rows.append(
            {
                "employee_id": str(item.id),
                "employee_name": employee_display_name(item),
                "department": item.department.name if item.department else "Unassigned",
                "designation": item.designation.title if item.designation else "Employee",
                "employment_type": str(item.employment_type),
                "status": str(item.employment_status),
                "cells": cells,
                "totals": totals,
                **_display_totals(cells, year=year, month=month),
            }
        )
    return {
        "month": month,
        "year": year,
        "days": [{"date": item.isoformat(), "day": item.day, "weekday": item.strftime("%a")} for item in days],
        "rows": rows,
        "legend": ATTENDANCE_LEGEND,
        "filters": {"employee": employee, "department": department, "status": status},
        "summary": _matrix_summary(rows),
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_rows": total_rows,
            "total_pages": max(1, (total_rows + page_size - 1) // page_size),
        },
    }


def attendance_calendar(db: Session, *, month: int, year: int, employee: str | None = None, department: str | None = None) -> dict[str, Any]:
    matrix = attendance_matrix(db, month=month, year=year, employee=employee, department=department, page_size=50)
    calendar_days: dict[str, list[dict[str, Any]]] = {}
    for row in matrix["rows"]:
        for cell in row["cells"]:
            calendar_days.setdefault(cell["date"], []).append(
                {
                    "employee_id": row["employee_id"],
                    "employee_name": row["employee_name"],
                    "status": cell["status"],
                    "label": cell["label"],
                }
            )
    return {**matrix, "calendar": calendar_days}


def attendance_dashboard(db: Session, *, target_date: date | None = None) -> dict[str, Any]:
    target_date = target_date or date.today()
    matrix = attendance_matrix(db, month=target_date.month, year=target_date.year)
    today_cells = [cell for row in matrix["rows"] for cell in row["cells"] if cell["date"] == target_date.isoformat()]
    return {
        "date": target_date.isoformat(),
        "present_today": sum(1 for cell in today_cells if cell["status"] == "PRESENT"),
        "absent_today": sum(1 for cell in today_cells if cell["status"] == "ABSENT"),
        "wfh_today": sum(1 for cell in today_cells if cell["status"] == "WORK_FROM_HOME"),
        "missing_attendance": sum(1 for cell in today_cells if cell["status"] == "MISSING"),
        "pending_regularizations": 0,
    }


def attendance_detail(db: Session, *, employee_id: str, attendance_date: date) -> dict[str, Any]:
    employee = db.get(Employee, UUID(str(employee_id)))
    if not employee:
        raise LookupError("Employee not found")
    record = db.scalar(select(AttendanceRecord).where(AttendanceRecord.employee_id == employee.id, AttendanceRecord.attendance_date == attendance_date))
    cell = _attendance_cell(employee, attendance_date, record, [])
    return {
        **cell,
        "employee_id": str(employee.id),
        "employee_name": employee_display_name(employee),
        "department": employee.department.name if employee.department else "Unassigned",
        "designation": employee.designation.title if employee.designation else "Employee",
        "shift": (record.metadata_json or {}).get("shift") if record and record.metadata_json else "Default Shift",
        "remarks": record.remarks if record else None,
    }


def payroll_attendance_input(db: Session, *, employee: Employee, month: int, year: int) -> dict[str, Any]:
    return prepare_employee_payroll_input(db, employee_id=employee.id, month=month, year=year)


def payroll_attendance_inputs(db: Session, *, month: int, year: int) -> list[dict[str, Any]]:
    employees = list(db.scalars(select(Employee).where(Employee.deleted_at.is_(None)).order_by(Employee.created_at.desc())))
    rows = prepare_monthly_payroll_input(db, employee_ids=[employee.id for employee in employees], month=month, year=year)
    employee_names = {str(employee.id): employee_display_name(employee) for employee in employees}
    return [{**row, "employee_name": employee_names.get(row["employee_id"])} for row in rows]


def attendance_record_payload(record: AttendanceRecord, employee: Employee | None = None) -> dict[str, Any]:
    employee = employee or record.employee
    return {
        "id": str(record.id),
        "employee_id": str(record.employee_id),
        "employee_name": employee_display_name(employee) if employee else None,
        "attendance_date": record.attendance_date.isoformat(),
        "attendance_status": str(record.status),
        "check_in_time": record.check_in_time.isoformat() if record.check_in_time else None,
        "check_out_time": record.check_out_time.isoformat() if record.check_out_time else None,
        "total_hours": float(record.total_hours) if record.total_hours is not None else None,
        "remarks": record.remarks,
        "shift": (record.metadata_json or {}).get("shift") if record.metadata_json else None,
    }


def find_employee_or_raise(db: Session, query: str | None) -> Employee:
    employee = find_one_employee(db, query or "")
    if not employee:
        raise LookupError("Employee not found for attendance request")
    return employee


ATTENDANCE_LEGEND = {
    "PRESENT": {"label": "Present", "color": "emerald", "icon": "check"},
    "ABSENT": {"label": "Absent", "color": "rose", "icon": "x"},
    "HALF_DAY": {"label": "Half Day", "color": "amber", "icon": "split"},
    "PAID_LEAVE": {"label": "Paid Leave", "color": "blue", "icon": "calendar"},
    "UNPAID_LEAVE": {"label": "Unpaid Leave", "color": "orange", "icon": "minus"},
    "WORK_FROM_HOME": {"label": "WFH", "color": "cyan", "icon": "home"},
    "HOLIDAY": {"label": "Holiday", "color": "violet", "icon": "star"},
    "WEEKEND": {"label": "Weekend", "color": "slate", "icon": "dot"},
    "MISSING": {"label": "Missing Attendance", "color": "zinc", "icon": "alert"},
}


def _matrix_employees(db: Session, *, employee: str | None, department: str | None, page: int, page_size: int) -> tuple[list[Employee], int]:
    statement = select(Employee).where(Employee.deleted_at.is_(None)).order_by(Employee.first_name.asc(), Employee.last_name.asc())
    if employee:
        pattern = f"%{employee}%"
        statement = statement.where(or_(Employee.first_name.ilike(pattern), Employee.last_name.ilike(pattern)))
    if department:
        statement = statement.join(Department, Employee.department_id == Department.id).where(Department.name.ilike(f"%{department}%"))
    count_statement = select(func.count()).select_from(statement.order_by(None).subquery())
    total_rows = int(db.scalar(count_statement) or 0)
    rows = list(db.scalars(statement.offset((page - 1) * page_size).limit(page_size)))
    return rows, total_rows


def _attendance_cell(employee: Employee, current_day: date, record: AttendanceRecord | None, leaves: list[LeaveRequest]) -> dict[str, Any]:
    if current_day.weekday() >= 5:
        return _virtual_cell(employee, current_day, "WEEKEND", "Weekend", "calendar")
    leave = next((item for item in leaves if item.employee_id == employee.id and item.start_date <= current_day <= item.end_date), None)
    if leave:
        category = str(leave.leave_type_ref.category) if leave.leave_type_ref and leave.leave_type_ref.category else ("UNPAID" if "unpaid" in leave.leave_type.lower() else "PAID")
        status = "WORK_FROM_HOME" if category == "WFH" else ("UNPAID_LEAVE" if category == "UNPAID" else "PAID_LEAVE")
        return _virtual_cell(employee, current_day, status, leave.leave_type, "leave")
    if record:
        status = str(record.status)
        return {
            **attendance_record_payload(record, employee),
            "date": current_day.isoformat(),
            "status": status,
            "label": ATTENDANCE_LEGEND.get(status, {}).get("label", status.replace("_", " ").title()),
            "weight": 0.5 if status == "HALF_DAY" else 1,
            "count": 1,
            "source": record.source or "attendance",
        }
    return _virtual_cell(employee, current_day, "PRESENT", "Present", "default")


def _virtual_cell(employee: Employee, current_day: date, status: str, label: str, source: str) -> dict[str, Any]:
    return {
        "id": None,
        "employee_id": str(employee.id),
        "employee_name": employee_display_name(employee),
        "attendance_date": current_day.isoformat(),
        "date": current_day.isoformat(),
        "status": status,
        "attendance_status": status,
        "label": label,
        "check_in_time": None,
        "check_out_time": None,
        "total_hours": None,
        "remarks": None,
        "source": source,
        "weight": 0 if status in {"WEEKEND", "HOLIDAY", "MISSING"} else 1,
        "count": 1,
    }


def _empty_totals() -> dict[str, float]:
    return {status: 0 for status in ATTENDANCE_LEGEND}


def _display_totals(cells: list[dict[str, Any]], *, year: int, month: int) -> dict[str, float]:
    month_end = date(year, month, calendar.monthrange(year, month)[1])
    earned_through = min(date.today(), month_end)
    payable_statuses = {"PRESENT", "WORK_FROM_HOME", "PAID_LEAVE"}
    working_days = 0.0
    payable_days = 0.0

    for cell in cells:
        status = cell["status"]
        cell_date = date.fromisoformat(cell["date"])
        if status not in {"WEEKEND", "HOLIDAY"}:
            working_days += 1
        if cell_date > earned_through:
            continue
        if status in payable_statuses:
            payable_days += 1
        elif status == "HALF_DAY":
            payable_days += 0.5

    return {"payable_days": payable_days, "working_days": working_days}


def _matrix_summary(rows: list[dict[str, Any]]) -> dict[str, float]:
    summary = _empty_totals()
    for row in rows:
        for key, value in row["totals"].items():
            summary[key] = summary.get(key, 0) + value
    return summary
