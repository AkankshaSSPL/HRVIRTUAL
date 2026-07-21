from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import SessionLocal
from app.models.employee import Department, Designation, Employee


def display_name(employee: Employee) -> str:
    name = " ".join(part for part in (employee.first_name, employee.last_name) if part).strip()
    if name:
        return name.title()
    if employee.user:
        name = " ".join(part for part in (employee.user.first_name, employee.user.last_name) if part).strip()
        if name:
            return name.title()
    if employee.official_email:
        return employee.official_email.split("@", 1)[0].replace(".", " ").title()
    return ""


def split_name(name: str) -> tuple[str | None, str | None]:
    parts = name.strip().split()
    if not parts:
        return None, None
    return parts[0], " ".join(parts[1:]) or None


def get_or_create_department(db, name: str) -> Department:
    existing = db.scalar(select(Department).where(Department.deleted_at.is_(None), Department.name.ilike(name)))
    if existing:
        existing.name = name
        existing.code = "".join(part[0] for part in name.split()).upper()[:12]
        db.add(existing)
        db.flush()
        return existing
    department = Department(name=name, code="".join(part[0] for part in name.split()).upper()[:12], description="Cleaned onboarding department")
    db.add(department)
    db.flush()
    return department


def get_or_create_designation(db, title: str) -> Designation:
    existing = db.scalar(select(Designation).where(Designation.deleted_at.is_(None), Designation.title.ilike(title)))
    if existing:
        return existing
    designation = Designation(title=title, code="".join(part[0] for part in title.split()).upper()[:12], description="Cleaned onboarding designation")
    db.add(designation)
    db.flush()
    return designation


def find_employee(db, query: str) -> Employee | None:
    normalized = "".join(ch for ch in query.lower() if ch.isalnum())
    employees = db.scalars(select(Employee).where(Employee.deleted_at.is_(None))).all()
    for employee in employees:
        name = "".join(ch for ch in display_name(employee).lower() if ch.isalnum())
        if normalized and (normalized == name or normalized in name):
            return employee
    return None


def remove_generated_identifiers(employee: Employee) -> None:
    if employee.official_email and employee.official_email.lower().endswith("@example.com"):
        employee.official_email = None
    if employee.employee_code and (employee.employee_code.startswith("ONB-") or employee.employee_code.startswith("SMOKE-")):
        employee.employee_code = None


def employee_quality_score(employee: Employee) -> int:
    score = 0
    if employee.department_id:
        score += 3
    if employee.designation_id:
        score += 2
    if employee.reporting_manager_id:
        score += 2
    if employee.current_salary:
        score += 2
    if employee.official_email and not employee.official_email.lower().endswith("@example.com"):
        score += 1
    department_name = employee.department.name if employee.department else ""
    if department_name and "salary" not in department_name.lower():
        score += 2
    return score


def soft_delete_duplicate_names(db, employees: list[Employee]) -> None:
    grouped: dict[str, list[Employee]] = {}
    for employee in employees:
        name = display_name(employee)
        if not name:
            continue
        grouped.setdefault(name, []).append(employee)

    for duplicates in grouped.values():
        if len(duplicates) < 2:
            continue
        keep = sorted(duplicates, key=lambda item: (employee_quality_score(item), item.created_at), reverse=True)[0]
        for employee in duplicates:
            if employee.id != keep.id:
                employee.deleted_at = datetime.now(timezone.utc)
                db.add(employee)


def main() -> None:
    db = SessionLocal()
    try:
        software = get_or_create_department(db, "Software Development")
        it = get_or_create_department(db, "IT")
        full_stack = get_or_create_designation(db, "Full Stack Developer")
        junior_dev = get_or_create_designation(db, "Junior Developer")
        dipali = find_employee(db, "Dipali")
        yash = find_employee(db, "Yash")

        employees = db.scalars(
            select(Employee)
            .where(Employee.deleted_at.is_(None))
            .options(selectinload(Employee.department), selectinload(Employee.designation), selectinload(Employee.reporting_manager), selectinload(Employee.user))
            .order_by(Employee.created_at.desc())
        ).all()
        for employee in employees:
            current_name = display_name(employee)
            if current_name:
                first_name, last_name = split_name(current_name)
                employee.first_name = employee.first_name or first_name
                employee.last_name = employee.last_name or last_name

            remove_generated_identifiers(employee)

            if current_name == "Kartik Patel":
                employee.department_id = software.id
                employee.designation_id = full_stack.id
                employee.reporting_manager_id = dipali.id if dipali else None
                employee.current_salary = Decimal("80000")

            if current_name == "Dipti G":
                employee.department_id = it.id
                employee.designation_id = junior_dev.id
                employee.reporting_manager_id = yash.id if yash else None
                employee.current_salary = Decimal("45000")

            if current_name == "Nikita Patel":
                employee.department_id = software.id
                employee.designation_id = full_stack.id
                employee.reporting_manager_id = dipali.id if dipali else None
                employee.current_salary = Decimal("100000")

            db.add(employee)

        soft_delete_duplicate_names(db, employees)

        db.commit()
        print("Cleaned onboarding employee data.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
