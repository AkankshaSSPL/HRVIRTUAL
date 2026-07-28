from __future__ import annotations

import re  # <-- ADDED
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID
from uuid import uuid4

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.security import get_password_hash
from app.models.auth import User
from app.models.employee import Department, Designation, Employee
from app.models.employee.models import EmploymentStatus, EmploymentType


EMPLOYEE_LOAD_OPTIONS = (
    selectinload(Employee.user),
    selectinload(Employee.department),
    selectinload(Employee.designation),
    selectinload(Employee.reporting_manager).selectinload(Employee.user),
    selectinload(Employee.reporting_manager).selectinload(Employee.department),
    selectinload(Employee.reporting_manager).selectinload(Employee.designation),
)


def employee_display_name(employee: Employee) -> str:
    employee_name = " ".join(part for part in (employee.first_name, employee.last_name) if part)
    if employee_name.strip():
        return employee_name.strip().title()
    if employee.user:
        full_name = " ".join(part for part in (employee.user.first_name, employee.user.last_name) if part)
        if full_name.strip():
            return full_name
    if employee.official_email:
        return employee.official_email.split("@")[0].replace(".", " ").title()
    return employee.employee_code or "Unnamed Employee"


def salary_to_display(value: Decimal | float | None) -> str | None:
    if value is None:
        return None
    return f"₹{float(value):,.0f}"


def employee_to_summary(employee: Employee) -> dict[str, Any]:
    return {
        "id": str(employee.id),
        "employee_code": employee.employee_code,
        "name": employee_display_name(employee),
        "designation": employee.designation.title if employee.designation else None,
        "department": employee.department.name if employee.department else None,
        "manager": employee_display_name(employee.reporting_manager) if employee.reporting_manager else None,
        "status": str(employee.employment_status),
        "employment_type": str(employee.employment_type),
        "joining_date": employee.joining_date.isoformat() if employee.joining_date else None,
        "official_email": employee.official_email,
        "salary": salary_to_display(employee.current_salary),
        "profile_photo": employee.profile_photo,
        "seat_label": employee.seat_label,
    }


def employee_profile(employee: Employee) -> dict[str, Any]:
    summary = employee_to_summary(employee)
    summary.update(
        {
            "first_name": employee.first_name,
            "last_name": employee.last_name,
            "personal_email": employee.personal_email,
            "phone": employee.phone,
            "dob": employee.dob.isoformat() if employee.dob else None,
            "gender": str(employee.gender) if employee.gender else None,
            "bank_account_number": mask_last4(employee.bank_account_number),
            "ifsc_code": employee.ifsc_code,
            "pan_number": mask_pan(employee.pan_number),
            "aadhaar_number": mask_last4(employee.aadhaar_number),
            "uan_number": mask_last4(employee.uan_number),
            "reporting_manager_id": str(employee.reporting_manager_id) if employee.reporting_manager_id else None,
            "department_id": str(employee.department_id) if employee.department_id else None,
            "designation_id": str(employee.designation_id) if employee.designation_id else None,
        }
    )
    return summary


def mask_last4(value: str | None) -> str | None:
    if not value:
        return None
    text = str(value).strip()
    visible = text[-4:] if len(text) > 4 else text
    return f"****{visible}"


def mask_pan(value: str | None) -> str | None:
    if not value:
        return None
    text = str(value).strip().upper()
    if len(text) <= 4:
        return "****"
    return f"{text[:3]}******{text[-1]}"


def base_employee_query(include_deleted: bool = False):
    statement = select(Employee).options(*EMPLOYEE_LOAD_OPTIONS)
    if not include_deleted:
        statement = statement.where(Employee.deleted_at.is_(None))
    return statement


def list_employees(
    db: Session,
    *,
    page: int = 1,
    page_size: int = 10,
    department: str | None = None,
    status: str | None = None,
) -> tuple[list[Employee], int]:
    statement = base_employee_query()
    count_statement = select(func.count(Employee.id)).where(Employee.deleted_at.is_(None))

    if department:
        statement = statement.join(Department, Employee.department_id == Department.id).where(Department.name.ilike(f"%{department}%"))
        count_statement = count_statement.join(Department, Employee.department_id == Department.id).where(Department.name.ilike(f"%{department}%"))
    if status:
        statement = statement.where(Employee.employment_status == status.upper())
        count_statement = count_statement.where(Employee.employment_status == status.upper())

    total = db.scalar(count_statement) or 0
    employees = list(db.scalars(statement.order_by(Employee.created_at.desc()).offset((page - 1) * page_size).limit(page_size)))
    return employees, total


def search_employees(db: Session, query: str, *, page: int = 1, page_size: int = 10) -> tuple[list[Employee], int]:
    """
    Search employees by name, code, email, or phone with case-insensitive partial match.
    """
    if not query:
        return [], 0
    pattern = f"%{query}%"
    email_name_pattern = f"%{query.strip().lower().replace(' ', '.')}%"
    conditions = or_(
        Employee.employee_code.ilike(pattern),
        Employee.official_email.ilike(pattern),
        Employee.official_email.ilike(email_name_pattern),
        Employee.personal_email.ilike(pattern),
        Employee.phone.ilike(pattern),
        Employee.first_name.ilike(pattern),
        Employee.last_name.ilike(pattern),
        func.concat(Employee.first_name, " ", Employee.last_name).ilike(pattern),
        func.concat(Employee.last_name, " ", Employee.first_name).ilike(pattern),
    )
    statement = base_employee_query().outerjoin(User, Employee.user_id == User.id).where(
        or_(
            conditions,
            User.first_name.ilike(pattern),
            User.last_name.ilike(pattern),
            func.concat(User.first_name, " ", User.last_name).ilike(pattern),
        )
    )
    count_statement = (
        select(func.count(Employee.id))
        .outerjoin(User, Employee.user_id == User.id)
        .where(Employee.deleted_at.is_(None))
        .where(
            or_(
                conditions,
                User.first_name.ilike(pattern),
                User.last_name.ilike(pattern),
                func.concat(User.first_name, " ", User.last_name).ilike(pattern),
            )
        )
    )
    total = db.scalar(count_statement) or 0
    employees = list(db.scalars(statement.order_by(Employee.created_at.desc()).offset((page - 1) * page_size).limit(page_size)))
    return employees, total


def department_employees(db: Session, department_name: str, *, page: int = 1, page_size: int = 10) -> tuple[list[Employee], int]:
    return list_employees(db, page=page, page_size=page_size, department=department_name)


def get_employee_by_id(db: Session, employee_id: UUID) -> Employee | None:
    return db.scalar(base_employee_query().where(Employee.id == employee_id))


# ========== UPDATED find_one_employee with regex stripping ==========
def find_one_employee(db: Session, query: str) -> Employee | None:
    """
    Find a single employee by name, code, email, or ID.
    Strips common command prefixes using regex before matching.
    """
    if not query:
        return None
    original = query
    query = query.strip()

    # Regex patterns to remove common prefixes and capture the actual name/query.
    # Tried most-specific-first so longer phrasing (e.g. "status of onboarding of")
    # is fully consumed before the shorter "status of" pattern would otherwise stop
    # partway through and leave a dangling "onboarding of X".
    patterns = [
        r"^(?:show|find|get|update|employee)\s+(.+)$",
        r"^(?:status\s+of\s+onboarding\s+of|status\s+for\s+onboarding\s+of|onboarding\s+status\s+of)\s+(.+)$",
        r"^(?:status\s+of|status\s+for|profile\s+of|profile\s+for|profile for|details for|info for)\s+(.+)$",
        r"^(?:of)\s+(.+)$",  # defensive: strip a dangling leading "of" left by upstream trimming
        r"^(.+)$",  # fallback
    ]
    for pat in patterns:
        match = re.match(pat, query, re.IGNORECASE)
        if match:
            query = match.group(1).strip()
            break

    # If query now has more than 2 words, assume only first two are first+last name
    parts = query.split()
    if len(parts) > 2:
        query = " ".join(parts[:2])  # take first two tokens

    if not query:
        return None

    # 1. Try to parse as UUID (employee ID)
    try:
        uid = UUID(query)
        employee = get_employee_by_id(db, uid)
        if employee:
            return employee
    except ValueError:
        pass

    # 2. Try exact match on employee_code (case-insensitive)
    employee = db.scalar(
        base_employee_query().where(func.lower(Employee.employee_code) == func.lower(query))
    )
    if employee:
        return employee

    # 3. Try exact match on official_email or personal_email (case-insensitive)
    employee = db.scalar(
        base_employee_query().where(
            or_(
                func.lower(Employee.official_email) == func.lower(query),
                func.lower(Employee.personal_email) == func.lower(query),
            )
        )
    )
    if employee:
        return employee

    # 4. Use search_employees with a limit and pick the first
    employees, _ = search_employees(db, query, page=1, page_size=1)
    if employees:
        return employees[0]

    # 5. If the query ends with 's', try singular (e.g., "Akankshas" -> "Akanksha")
    parts2 = query.split()
    if len(parts2) > 1 and parts2[-1].lower().endswith("s"):
        singular_query = " ".join([*parts2[:-1], parts2[-1][:-1]])
        employees, _ = search_employees(db, singular_query, page=1, page_size=1)
        if employees:
            return employees[0]

    # 6. If query has two parts, try first_name + last_name exactly (case-insensitive)
    if len(parts2) == 2:
        first, last = parts2[0], parts2[1]
        employee = db.scalar(
            base_employee_query().where(
                func.lower(Employee.first_name) == func.lower(first),
                func.lower(Employee.last_name) == func.lower(last),
            )
        )
        if employee:
            return employee

    # 7. Try matching by first name only (if query is a single word)
    if len(parts2) == 1:
        employee = db.scalar(
            base_employee_query().where(
                or_(
                    func.lower(Employee.first_name) == func.lower(query),
                    func.lower(Employee.last_name) == func.lower(query),
                )
            )
        )
        if employee:
            return employee

    return None


def find_department(db: Session, name: str) -> Department | None:
    return db.scalar(select(Department).where(Department.deleted_at.is_(None), Department.name.ilike(f"%{name}%")).order_by(Department.name.asc()))


def find_designation(db: Session, title: str) -> Designation | None:
    return db.scalar(select(Designation).where(Designation.deleted_at.is_(None), Designation.title.ilike(f"%{title}%")).order_by(Designation.title.asc()))


def update_employee_fields(db: Session, employee_id: UUID, fields: dict[str, Any]) -> tuple[Employee, dict[str, Any], dict[str, Any]]:
    employee = get_employee_by_id(db, employee_id)
    if not employee:
        raise LookupError("Employee not found")

    allowed = {
        "first_name",
        "last_name",
        "employee_code",
        "joining_date",
        "official_email",
        "personal_email",
        "phone",
        "dob",
        "gender",
        "employment_status",
        "employment_type",
        "department_id",
        "designation_id",
        "reporting_manager_id",
        "current_salary",
        "bank_account_number",
        "ifsc_code",
        "pan_number",
        "aadhaar_number",
        "uan_number",
        "seat_label",
    }
    old_value = employee_profile(employee)
    for key, value in fields.items():
        if key in allowed:
            setattr(employee, key, value)
    db.add(employee)
    db.flush()
    db.refresh(employee)
    return employee, old_value, employee_profile(employee)


def generate_next_employee_code(db: Session) -> str:
    latest = db.scalar(
        select(Employee.employee_code)
        .where(Employee.employee_code.op("~")(r"^EMP\d+$"))
        .order_by(func.length(Employee.employee_code).desc(), Employee.employee_code.desc())
        .limit(1)
    )
    next_number = int(latest[3:]) + 1 if latest else 1
    return f"EMP{next_number:04d}"


def create_employee_draft(db: Session, payload: dict[str, Any]) -> tuple[Employee, dict[str, Any]]:
    user = None
    first_name = (payload.get("first_name") or "").strip()
    last_name = (payload.get("last_name") or "").strip()
    official_email = payload.get("official_email")
    joining_date = _parse_date(payload.get("joining_date"))
    if not joining_date:
        raise ValueError("joining_date is required and cannot be inferred")
    if first_name and official_email:
        existing_user = db.scalar(select(User).where(User.email == official_email))
        user = existing_user or User(
            email=official_email,
            password_hash=get_password_hash(uuid4().hex),
            first_name=first_name,
            last_name=last_name or "Employee",
            is_active=True,
            is_superuser=False,
        )
        db.add(user)
        db.flush()

    employee = Employee(
        user_id=user.id if user else None,
        first_name=first_name or None,
        last_name=last_name or None,
        employee_code=payload.get("employee_code"),
        joining_date=joining_date,
        employment_status=_parse_employment_status(payload.get("employment_status")) or EmploymentStatus.PROBATION,
        employment_type=_parse_employment_type(payload.get("employment_type")) or EmploymentType.FULL_TIME,
        official_email=official_email,
        personal_email=payload.get("personal_email"),
        phone=payload.get("phone"),
        department_id=payload.get("department_id"),
        designation_id=payload.get("designation_id"),
        reporting_manager_id=payload.get("reporting_manager_id"),
        current_salary=_parse_decimal(payload.get("current_salary") or payload.get("salary")),
        dob=_parse_date(payload.get("dob")),
        gender=payload.get("gender") or None,
        emergency_contact=payload.get("emergency_contact"),
        bank_account_number=payload.get("bank_account_number") or None,
        ifsc_code=payload.get("ifsc_code") or None,
        pan_number=payload.get("pan_number") or None,
        aadhaar_number=payload.get("aadhaar_number") or None,
        uan_number=payload.get("uan_number") or None,
        seat_label=payload.get("seat_label") or None,
    )
    db.add(employee)
    db.flush()
    db.refresh(employee)
    return employee, employee_profile(employee)


def soft_delete_employee(db: Session, employee_id: UUID) -> tuple[Employee, dict[str, Any], dict[str, Any]]:
    employee = get_employee_by_id(db, employee_id)
    if not employee:
        raise LookupError("Employee not found")
    old_value = employee_profile(employee)
    employee.deleted_at = datetime.now(timezone.utc)
    db.add(employee)
    db.flush()
    db.refresh(employee)
    return employee, old_value, employee_profile(employee)


def deactivate_employee(db: Session, employee_id: UUID) -> tuple[Employee, dict[str, Any], dict[str, Any]]:
    return update_employee_fields(db, employee_id, {"employment_status": EmploymentStatus.SUSPENDED})


def _parse_decimal(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    if isinstance(value, Decimal):
        return value
    text = str(value).replace("₹", "").replace(",", "").strip()
    return Decimal(text)


def _parse_employment_status(value: Any) -> EmploymentStatus | None:
    if not value:
        return None
    if isinstance(value, EmploymentStatus):
        return value
    return EmploymentStatus(str(value).upper())


def _parse_employment_type(value: Any) -> EmploymentType | None:
    if not value:
        return None
    if isinstance(value, EmploymentType):
        return value
    normalized = str(value).strip().upper().replace(" ", "_").replace("-", "_")
    return EmploymentType(normalized)


def _parse_date(value: Any) -> date | None:
    if not value:
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))