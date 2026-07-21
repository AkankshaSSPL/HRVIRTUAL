from typing import Any

from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.employee_agent.tools import create_employee_draft, deactivate_employee, employee_profile, employee_to_summary, get_employee_by_id, list_employees, search_employees, soft_delete_employee, update_employee_fields
from app.api.deps import get_current_user, require_permissions
from app.db.session import get_db
from app.models.audit import AuditLog
from app.models.auth import User
from app.models.employee import Department, Designation, Employee
from app.services.onboarding_progress import compute_onboarding_progress

router = APIRouter()


def _without_salary(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if key != "salary"}


class EmployeeListResponse(BaseModel):
    items: list[dict[str, Any]]
    total: int
    page: int
    page_size: int


class EmployeeCreateRequest(BaseModel):
    first_name: str
    last_name: str
    employee_code: str | None = None
    joining_date: date
    employment_status: str = "ACTIVE"
    employment_type: str = "FULL_TIME"
    department_id: UUID | None = None
    designation_id: UUID | None = None
    reporting_manager_id: UUID | None = None
    official_email: EmailStr | None = None
    personal_email: EmailStr
    phone: str | None = None
    dob: date | None = None
    gender: str | None = None
    bank_account_number: str | None = None
    ifsc_code: str | None = None
    pan_number: str | None = None
    aadhaar_number: str | None = None
    uan_number: str | None = None


class EmployeeUpdateRequest(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    employee_code: str | None = None
    joining_date: date | None = None
    employment_status: str | None = None
    employment_type: str | None = None
    department_id: UUID | None = None
    designation_id: UUID | None = None
    reporting_manager_id: UUID | None = None
    official_email: EmailStr | None = None
    personal_email: EmailStr | None = None
    phone: str | None = None
    dob: date | None = None
    gender: str | None = None
    bank_account_number: str | None = None
    ifsc_code: str | None = None
    pan_number: str | None = None
    aadhaar_number: str | None = None
    uan_number: str | None = None


@router.get("", response_model=EmployeeListResponse, dependencies=[Depends(require_permissions("employees:view"))])
def employees(
    db: Session = Depends(get_db),
    q: str | None = Query(default=None),
    department: str | None = Query(default=None),
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> EmployeeListResponse:
    if q:
        records, total = search_employees(db, q, page=page, page_size=page_size)
    else:
        records, total = list_employees(db, page=page, page_size=page_size, department=department, status=status)

    items = []
    for employee in records:
        items.append(_without_salary(employee_to_summary(employee)))
    return EmployeeListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/form-options", dependencies=[Depends(require_permissions("employees:view"))])
def employee_form_options(db: Session = Depends(get_db)):
    departments = db.scalars(select(Department).where(Department.deleted_at.is_(None), Department.active.is_(True)).order_by(Department.name)).all()
    designations = db.scalars(select(Designation).where(Designation.deleted_at.is_(None)).order_by(Designation.title)).all()
    managers = db.scalars(select(Employee).where(Employee.deleted_at.is_(None)).order_by(Employee.first_name, Employee.last_name)).all()
    return {
        "departments": [{"id": str(item.id), "name": item.name} for item in departments],
        "designations": [{"id": str(item.id), "name": item.title} for item in designations],
        "managers": [{"id": str(item.id), "name": employee_to_summary(item)["name"]} for item in managers],
    }


@router.get("/{employee_id}", dependencies=[Depends(require_permissions("employees:view"))])
def employee_detail(employee_id: UUID, db: Session = Depends(get_db)):
    employee = get_employee_by_id(db, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    return _without_salary(employee_profile(employee))


@router.get("/{employee_id}/onboarding-progress", dependencies=[Depends(require_permissions("employees:view"))])
def employee_onboarding_progress(employee_id: UUID, db: Session = Depends(get_db)):
    employee = get_employee_by_id(db, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    return compute_onboarding_progress(db, employee)


@router.post("/{employee_id}/send-welcome-kit", dependencies=[Depends(require_permissions("employees:manage"))])
def send_welcome_kit(
    employee_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    employee = get_employee_by_id(db, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    progress = compute_onboarding_progress(db, employee)
    if not progress["welcome_kit_ready"]:
        raise HTTPException(status_code=400, detail="Complete the remaining onboarding steps before sending the welcome kit.")
    if employee.welcome_kit_sent_at is not None:
        raise HTTPException(status_code=400, detail="Welcome kit was already sent.")

    employee.welcome_kit_sent_at = datetime.now(timezone.utc)
    db.add(
        AuditLog(
            entity_type="employee",
            entity_id=employee.id,
            action="employee.welcome_kit_sent",
            new_value={"welcome_kit_sent_at": employee.welcome_kit_sent_at.isoformat()},
            performed_by=current_user.id,
        )
    )
    db.commit()
    return compute_onboarding_progress(db, employee)


@router.post("", dependencies=[Depends(require_permissions("employees:manage"))])
def create_employee(
    payload: EmployeeCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        employee, snapshot = create_employee_draft(db, payload.model_dump())
        db.add(
            AuditLog(
                entity_type="employee",
                entity_id=employee.id,
                action="employee.created_from_form",
                new_value=snapshot,
                performed_by=current_user.id,
            )
        )
        db.commit()
        db.refresh(employee)
        return _without_salary(employee_profile(employee))
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/{employee_id}", dependencies=[Depends(require_permissions("employees:manage"))])
def update_employee(
    employee_id: UUID,
    payload: EmployeeUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        fields = payload.model_dump(exclude_unset=True)
        employee, old_value, new_value = update_employee_fields(db, employee_id, fields)
        db.add(
            AuditLog(
                entity_type="employee",
                entity_id=employee.id,
                action="employee.updated_from_form",
                old_value=old_value,
                new_value=new_value,
                performed_by=current_user.id,
            )
        )
        db.commit()
        return _without_salary(new_value)
    except (LookupError, ValueError) as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{employee_id}/deactivate", dependencies=[Depends(require_permissions("employees:manage"))])
def deactivate_employee_endpoint(
    employee_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        employee, old_value, new_value = deactivate_employee(db, employee_id)
        db.add(
            AuditLog(
                entity_type="employee",
                entity_id=employee.id,
                action="employee.deactivated_from_form",
                old_value=old_value,
                new_value=new_value,
                performed_by=current_user.id,
            )
        )
        db.commit()
        return _without_salary(new_value)
    except LookupError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/{employee_id}", dependencies=[Depends(require_permissions("employees:manage"))])
def delete_employee(
    employee_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        employee, old_value, new_value = soft_delete_employee(db, employee_id)
        db.add(
            AuditLog(
                entity_type="employee",
                entity_id=employee.id,
                action="employee.deleted_from_form",
                old_value=old_value,
                new_value=new_value,
                performed_by=current_user.id,
            )
        )
        db.commit()
        return {"status": "deleted", "employee_id": str(employee.id)}
    except LookupError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc