from typing import Any
import re
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.employee_agent.tools import (
    create_employee_draft,
    employee_profile,
    employee_to_summary,
    generate_next_employee_code,
    get_employee_by_id,
    list_employees,
    search_employees,
    soft_delete_employee,
    update_employee_fields,
)
from app.api.deps import get_current_user, require_permissions
from app.db.session import get_db
from app.models.audit import AuditLog
from app.models.auth import User
from app.models.employee import Department, Designation, Employee
from app.models.employee.models import EmployeeAsset
from app.services.asset_service import asset_to_dict, assign_onboarding_assets
from app.services.onboarding_progress import compute_onboarding_progress
from app.services.email_service import send_welcome_email  # <-- NEW import
from app.services.seat_service import assign_seat

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
    designation_id: UUID
    reporting_manager_id: UUID | None = None
    official_email: EmailStr
    personal_email: EmailStr
    phone: str

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        v_clean = v.replace(" ", "").replace("-", "")
        if not v_clean.isdigit() or len(v_clean) != 10:
            raise ValueError("Phone number must be exactly 10 digits")
        return v_clean
        
    dob: date
    gender: str
    address: str

    @field_validator("dob")
    @classmethod
    def validate_dob(cls, v: date | None) -> date | None:
        if v:
            age = (date.today() - v).days / 365.25
            if age < 18:
                raise ValueError("Employee must be at least 18 years old")
        return v
    zip_code: str

    @field_validator("zip_code")
    @classmethod
    def validate_zip(cls, v: str) -> str:
        v_clean = v.strip()
        if not v_clean.isdigit() or len(v_clean) != 6:
            raise ValueError("Zip code must be exactly 6 digits")
        return v_clean
        
    city: str
    bank_account_number: str

    @field_validator("bank_account_number")
    @classmethod
    def validate_bank_account(cls, v: str) -> str:
        v_clean = v.replace(" ", "").replace("-", "")
        if not v_clean.isdigit() or not (9 <= len(v_clean) <= 12):
            raise ValueError("Bank account number must be between 9 and 12 digits")
        return v_clean
    ifsc_code: str
    bank_branch: str
    pan_number: str
    aadhaar_number: str

    @field_validator("aadhaar_number")
    @classmethod
    def validate_aadhaar(cls, v: str) -> str:
        v_clean = v.replace(" ", "").replace("-", "")
        if not v_clean.isdigit() or len(v_clean) != 12:
            raise ValueError("Aadhaar number must be exactly 12 digits")
        return v_clean

    @field_validator("pan_number")
    @classmethod
    def validate_pan(cls, v: str) -> str:
        v_clean = v.strip().upper()
        if len(v_clean) != 10 or not v_clean[0:5].isalpha() or not v_clean[5:9].isdigit() or not v_clean[9].isalpha():
            raise ValueError("Invalid PAN number format")
        return v_clean

    @field_validator("ifsc_code")
    @classmethod
    def validate_ifsc(cls, v: str) -> str:
        v_clean = v.strip().upper()
        if len(v_clean) != 11 or not v_clean[0:4].isalpha() or v_clean[4] != '0' or not v_clean[5:11].isalnum():
            raise ValueError("Invalid IFSC code format")
        return v_clean

    @field_validator("uan_number")
    @classmethod
    def validate_uan(cls, v: str | None) -> str | None:
        if v:
            v_clean = v.replace(" ", "").replace("-", "")
            if not v_clean.isdigit() or len(v_clean) != 12:
                raise ValueError("UAN number must be exactly 12 digits")
            return v_clean
        return v
    uan_number: str | None = None
    current_salary: Decimal | None = None
    emergency_contact: dict[str, Any]

    @field_validator("emergency_contact")
    @classmethod
    def validate_emergency_contact(cls, v: dict[str, Any]) -> dict[str, Any]:
        if v and "phone" in v:
            phone_clean = v["phone"].replace(" ", "").replace("-", "")
            if not phone_clean.isdigit() or len(phone_clean) != 10:
                raise ValueError("Emergency contact phone number must be exactly 10 digits")
            v["phone"] = phone_clean
        return v


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

    @field_validator("official_email")
    @classmethod
    def validate_official_email(cls, v: EmailStr | None) -> EmailStr | None:
        if v is None:
            raise ValueError("Official email is required and cannot be null")
        return v

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str | None) -> str | None:
        if v is not None:
            v_clean = v.replace(" ", "").replace("-", "")
            if not v_clean.isdigit() or len(v_clean) != 10:
                raise ValueError("Phone number must be exactly 10 digits")
            return v_clean
        return v
        
    dob: date | None = None
    gender: str | None = None
    address: str | None = None

    @field_validator("dob")
    @classmethod
    def validate_dob(cls, v: date | None) -> date | None:
        if v:
            age = (date.today() - v).days / 365.25
            if age < 18:
                raise ValueError("Employee must be at least 18 years old")
        return v
    zip_code: str | None = None

    @field_validator("zip_code")
    @classmethod
    def validate_zip(cls, v: str | None) -> str | None:
        if v is not None:
            v_clean = v.strip()
            if not v_clean.isdigit() or len(v_clean) != 6:
                raise ValueError("Zip code must be exactly 6 digits")
            return v_clean
        return v
        
    city: str | None = None
    bank_account_number: str | None = None

    @field_validator("bank_account_number")
    @classmethod
    def validate_bank_account(cls, v: str | None) -> str | None:
        if v is not None:
            v_clean = v.replace(" ", "").replace("-", "")
            if not v_clean.isdigit() or not (9 <= len(v_clean) <= 12):
                raise ValueError("Bank account number must be between 9 and 12 digits")
            return v_clean
        return v
    ifsc_code: str | None = None
    bank_branch: str | None = None
    pan_number: str | None = None
    aadhaar_number: str | None = None

    @field_validator("aadhaar_number")
    @classmethod
    def validate_aadhaar(cls, v: str | None) -> str | None:
        if v is not None:
            v_clean = v.replace(" ", "").replace("-", "")
            if not v_clean.isdigit() or len(v_clean) != 12:
                raise ValueError("Aadhaar number must be exactly 12 digits")
            return v_clean
        return v

    @field_validator("pan_number")
    @classmethod
    def validate_pan(cls, v: str | None) -> str | None:
        if v is not None:
            v_clean = v.strip().upper()
            if len(v_clean) != 10 or not v_clean[0:5].isalpha() or not v_clean[5:9].isdigit() or not v_clean[9].isalpha():
                raise ValueError("Invalid PAN number format")
            return v_clean
        return v

    @field_validator("ifsc_code")
    @classmethod
    def validate_ifsc(cls, v: str | None) -> str | None:
        if v is not None:
            v_clean = v.strip().upper()
            if len(v_clean) != 11 or not v_clean[0:4].isalpha() or v_clean[4] != '0' or not v_clean[5:11].isalnum():
                raise ValueError("Invalid IFSC code format")
            return v_clean
        return v

    @field_validator("uan_number")
    @classmethod
    def validate_uan(cls, v: str | None) -> str | None:
        if v:
            v_clean = v.replace(" ", "").replace("-", "")
            if not v_clean.isdigit() or len(v_clean) != 12:
                raise ValueError("UAN number must be exactly 12 digits")
            return v_clean
        return v
    uan_number: str | None = None
    current_salary: Decimal | None = None
    emergency_contact: dict[str, Any] | None = None

    @field_validator("emergency_contact")
    @classmethod
    def validate_emergency_contact(cls, v: dict[str, Any] | None) -> dict[str, Any] | None:
        if v and "phone" in v:
            phone_clean = v["phone"].replace(" ", "").replace("-", "")
            if not phone_clean.isdigit() or len(phone_clean) != 10:
                raise ValueError("Emergency contact phone number must be exactly 10 digits")
            v["phone"] = phone_clean
        return v
    seat_label: str | None = None


class SeatAssignmentRequest(BaseModel):
    seat_label: str
    optional_assets: list[str] = Field(default_factory=list)
    asset_names: dict[str, str] = Field(default_factory=dict)


class AssetAssignmentRequest(BaseModel):
    """Assets-only payload — does not touch seat occupancy at all."""
    optional_assets: list[str] = Field(default_factory=list)
    asset_names: dict[str, str] = Field(default_factory=dict)


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
        summary = _without_salary(employee_to_summary(employee))
        summary["onboarding_percent"] = compute_onboarding_progress(db, employee)["percent"]
        items.append(summary)
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
    payload = _without_salary(employee_profile(employee))
    payload["current_salary"] = float(employee.current_salary) if employee.current_salary is not None else None
    return payload


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
    """
    Send the welcome email to the employee and stamp the welcome_kit_sent_at timestamp.
    Requires that all other onboarding steps are complete.
    """
    employee = get_employee_by_id(db, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    progress = compute_onboarding_progress(db, employee)
    if not progress["welcome_kit_ready"]:
        raise HTTPException(
            status_code=400,
            detail="Complete the remaining onboarding steps before sending the welcome kit."
        )
    if employee.welcome_kit_sent_at is not None:
        raise HTTPException(status_code=400, detail="Welcome kit was already sent.")

    # Send the actual email
    sent = send_welcome_email(employee)
    if not sent:
        raise HTTPException(
            status_code=500,
            detail="Failed to send welcome email. Please check the server logs for details."
        )

    # Only stamp if email was sent successfully
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


@router.post("/{employee_id}/seat", dependencies=[Depends(require_permissions("employees:manage"))])
def assign_employee_seat(
    employee_id: UUID,
    payload: SeatAssignmentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        seat, employee, old_seat_label = assign_seat(db, payload.seat_label, employee_id)
        created_assets = assign_onboarding_assets(db, employee, payload.optional_assets, payload.asset_names)

        db.add(
            AuditLog(
                entity_type="employee",
                entity_id=employee.id,
                action="employee.seat_assigned",
                old_value={"seat_label": old_seat_label},
                new_value={"seat_label": seat.label},
                performed_by=current_user.id,
            )
        )
        if created_assets:
            db.add(
                AuditLog(
                    entity_type="employee",
                    entity_id=employee.id,
                    action="employee.onboarding_assets_assigned",
                    old_value=None,
                    new_value={"asset_types": [a.asset_type for a in created_assets]},
                    performed_by=current_user.id,
                )
            )

        db.commit()
        progress = compute_onboarding_progress(db, employee)
        progress["assets"] = [asset_to_dict(a) for a in created_assets]
        return progress
    except LookupError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{employee_id}/assets", dependencies=[Depends(require_permissions("employees:manage"))])
def assign_employee_assets(
    employee_id: UUID,
    payload: AssetAssignmentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Save optional assets (and brand/model names) for an employee who already
    has a seat, without going through seat assignment at all. Unlike
    `/seat`, this never raises on an already-OCCUPIED seat — it doesn't
    look at seat status in the first place.
    """
    employee = get_employee_by_id(db, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    if not employee.seat_label:
        raise HTTPException(
            status_code=400,
            detail="Assign a seat before adding onboarding assets. Use the seat assignment step first.",
        )

    try:
        created_assets = assign_onboarding_assets(db, employee, payload.optional_assets, payload.asset_names)

        if created_assets:
            db.add(
                AuditLog(
                    entity_type="employee",
                    entity_id=employee.id,
                    action="employee.onboarding_assets_assigned",
                    old_value=None,
                    new_value={"asset_types": [a.asset_type for a in created_assets]},
                    performed_by=current_user.id,
                )
            )

        db.commit()
        progress = compute_onboarding_progress(db, employee)
        all_assets = db.scalars(
            select(EmployeeAsset).where(
                EmployeeAsset.employee_id == employee.id,
                EmployeeAsset.deleted_at.is_(None),
                EmployeeAsset.asset_status == "ASSIGNED",
            )
        ).all()
        progress["assets"] = [asset_to_dict(a) for a in all_assets]
        return progress
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("", dependencies=[Depends(require_permissions("employees:manage"))])
def create_employee(
    payload: EmployeeCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = payload.model_dump()
        if not (data.get("employee_code") or "").strip():
            data["employee_code"] = generate_next_employee_code(db)
        employee, snapshot = create_employee_draft(db, data)
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
        payload = _without_salary(new_value)
        payload["current_salary"] = float(employee.current_salary) if employee.current_salary is not None else None
        return payload
    except (LookupError, ValueError) as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{employee_id}/deactivate", dependencies=[Depends(require_permissions("employees:manage"))])
def deactivate_employee_endpoint(
    employee_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    "Deactivate" now soft-deletes the employee (sets deleted_at), which is
    what actually removes them from the Employees list and search results —
    just flipping employment_status to SUSPENDED left the record fully
    visible everywhere, which wasn't the intent of this button.
    """
    try:
        employee, old_value, new_value = soft_delete_employee(db, employee_id)
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