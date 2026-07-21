from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import or_, select

from app.agents.approval_agent.handlers import handler_registry
from app.agents.employee_agent.tools import create_employee_draft, employee_display_name, employee_profile, find_one_employee
from app.agents.onboarding_agent.service import audit_onboarding_action, onboarding_response
from app.db.session import SessionLocal
from app.models.audit import AuditLog
from app.models.employee import Department, Designation, Employee
from app.models.employee import EmployeeAsset, Notification


def _actor(payload: dict[str, Any]) -> UUID | None:
    value = payload.get("approved_by") or payload.get("requested_by")
    return UUID(str(value)) if value else None


def execute_onboarding_start(payload: dict[str, Any]) -> dict[str, Any]:
    db = SessionLocal()
    try:
        candidate = payload.get("candidate") or {}
        _validate_required_candidate(candidate)
        first_name, last_name = _split_name(candidate.get("name"))
        official_email = _unique_employee_email(db, candidate.get("email")) if candidate.get("email") else None
        department = _find_or_create_department(db, candidate.get("department"))
        designation = _find_or_create_designation(db, candidate.get("designation"))
        manager = _find_manager(db, candidate.get("manager"))
        employee, employee_snapshot = create_employee_draft(
            db,
            {
                "first_name": first_name,
                "last_name": last_name,
                "employee_code": candidate.get("employee_code"),
                "employment_status": "ACTIVE",
                "employment_type": candidate.get("employment_type"),
                "official_email": official_email,
                "personal_email": candidate.get("email"),
                "phone": candidate.get("phone"),
                "joining_date": candidate.get("joining_date"),
                "current_salary": candidate.get("salary"),
                "department_id": department.id if department else None,
                "designation_id": designation.id if designation else None,
                "reporting_manager_id": manager.id if manager else None,
            },
        )
        for asset in payload.get("assets") or []:
            db.add(EmployeeAsset(employee_id=employee.id, asset_type=asset["name"], asset_code=f"REQ-{asset['name'].upper().replace(' ', '-')}-{str(employee.id)[:8]}", asset_status="ASSIGNED", metadata_json={"source": "onboarding_agent"}))
        if employee.user_id:
            db.add(Notification(user_id=employee.user_id, title="Welcome to the organization", message="Your onboarding workflow has started.", channel="email", status="UNREAD", payload_json={"employee_id": str(employee.id)}))
        audit_onboarding_action(db, action="onboarding.completed", payload={**payload, "employee_id": str(employee.id)}, performed_by=_actor(payload))
        db.add(
            AuditLog(
                entity_type="employee",
                entity_id=employee.id,
                action="employee.created_from_onboarding",
                old_value=None,
                new_value=employee_snapshot,
                performed_by=_actor(payload),
            )
        )
        db.commit()
        candidate_payload = {**candidate, "employee_id": str(employee.id)}
        return {
            "status": "executed",
            "message": "Onboarding approved. Employee, assets, document checklist, and notifications were generated.",
            "employee": employee_profile(employee),
            "structured_response": onboarding_response(
                title="Onboarding completed",
                summary="Employee record was created and downstream onboarding tasks were generated.",
                candidate=candidate_payload,
                approval_request_id=None,
                completed=True,
                include_resume_step=bool(candidate.get("resume_uploaded")),
            ),
        }
    finally:
        db.close()


def _split_name(name: str) -> tuple[str, str]:
    parts = name.split()
    return parts[0], " ".join(parts[1:]) if len(parts) > 1 else ""


def _validate_required_candidate(candidate: dict[str, Any]) -> None:
    missing = [field for field in ("name", "manager", "joining_date") if not candidate.get(field)]
    if missing:
        raise ValueError(f"Cannot create employee. Missing required onboarding fields: {', '.join(missing)}")


def _unique_employee_email(db, email: str) -> str:
    local, _, domain = email.partition("@")
    if not local or not domain:
        return email
    candidate = f"{local}@{domain}"
    suffix = 1
    while db.scalar(select(Employee.id).where(Employee.official_email == candidate)) is not None:
        suffix += 1
        candidate = f"{local}.{suffix}@{domain}"
    return candidate


def _find_or_create_department(db, name: str | None) -> Department | None:
    if not name:
        return None
    existing = db.scalar(select(Department).where(Department.deleted_at.is_(None), Department.name.ilike(name)))
    if existing:
        return existing
    department = Department(name=name, code=_code(name), description="Created from onboarding request")
    db.add(department)
    db.flush()
    return department


def _find_or_create_designation(db, title: str | None) -> Designation | None:
    if not title:
        return None
    existing = db.scalar(select(Designation).where(Designation.deleted_at.is_(None), Designation.title.ilike(title)))
    if existing:
        return existing
    designation = Designation(title=title, code=_code(title), description="Created from onboarding request")
    db.add(designation)
    db.flush()
    return designation


def _code(value: str) -> str:
    return "".join(part[0] for part in value.split() if part).upper()[:12] or "AUTO"


def _find_manager(db, name: str | None) -> Employee | None:
    if not name:
        return None
    manager = find_one_employee(db, name)
    if manager:
        return manager
    tokens = [token for token in name.split() if token]
    if not tokens:
        return None
    conditions = []
    for token in tokens:
        pattern = f"%{token}%"
        conditions.extend([Employee.first_name.ilike(pattern), Employee.last_name.ilike(pattern), Employee.official_email.ilike(pattern)])
    candidates = list(db.scalars(select(Employee).where(Employee.deleted_at.is_(None), or_(*conditions)).limit(10)))
    normalized = _normalize_name(name)
    for employee in candidates:
        if normalized in _normalize_name(employee_display_name(employee)) or all(token.lower() in _normalize_name(employee_display_name(employee)) for token in tokens):
            return employee
    return candidates[0] if len(candidates) == 1 else None


def _normalize_name(value: str) -> str:
    return "".join(ch for ch in value.lower() if ch.isalnum())


handler_registry.register("onboarding.start", execute_onboarding_start)
