from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_permissions
from app.db.session import get_db
from app.models.audit import AuditLog
from app.models.auth import User
from app.models.employee import Department, Designation, LeaveType
from app.models.lookup import LookupValue

router = APIRouter()


class MasterPayload(BaseModel):
    name: str | None = None
    title: str | None = None
    code: str | None = None
    description: str | None = None
    level: str | None = None
    parent_department_id: UUID | None = None
    category: str | None = None
    label: str | None = None
    sort_order: int = 0
    active: bool = True
    annual_allocation: float = 0
    carry_forward_allowed: bool = False
    requires_approval: bool = True
    affects_payroll: bool = False


def _record_payload(record: Any, master_type: str) -> dict[str, Any]:
    if master_type == "departments":
        return {"id": str(record.id), "name": record.name, "active": record.active and record.deleted_at is None}
    if master_type == "designations":
        return {"id": str(record.id), "name": record.title, "code": record.code, "description": record.description, "level": record.level, "active": record.deleted_at is None}
    if master_type == "leave_types":
        return {"id": str(record.id), "name": record.name, "code": record.code, "category": str(record.category), "annual_allocation": float(record.annual_allocation or 0), "carry_forward_allowed": record.carry_forward_allowed, "requires_approval": record.requires_approval, "affects_payroll": record.affects_payroll, "active": record.active and record.deleted_at is None}
    return {"id": str(record.id), "name": record.label, "label": record.label, "code": record.code, "category": record.category, "sort_order": record.sort_order, "active": record.active and record.deleted_at is None}


@router.get("", dependencies=[Depends(require_permissions("settings:view"))])
def list_masters(db: Session = Depends(get_db)):
    departments = db.scalars(select(Department).where(Department.deleted_at.is_(None)).order_by(Department.name)).all()
    designations = db.scalars(select(Designation).where(Designation.deleted_at.is_(None)).order_by(Designation.title)).all()
    leave_types = db.scalars(select(LeaveType).where(LeaveType.deleted_at.is_(None)).order_by(LeaveType.name)).all()
    lookups = db.scalars(select(LookupValue).where(LookupValue.deleted_at.is_(None)).order_by(LookupValue.category, LookupValue.sort_order, LookupValue.label)).all()
    grouped: dict[str, list[dict[str, Any]]] = {}
    for lookup in lookups:
        grouped.setdefault(lookup.category, []).append(_record_payload(lookup, "lookups"))
    return {
        "departments": [_record_payload(item, "departments") for item in departments],
        "designations": [_record_payload(item, "designations") for item in designations],
        "leave_types": [_record_payload(item, "leave_types") for item in leave_types],
        "lookups": grouped,
    }


@router.post("/{master_type}", dependencies=[Depends(require_permissions("settings:manage"))])
def create_master(master_type: str, payload: MasterPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if master_type == "departments":
        record = Department(name=_required(payload.name, "name"), active=payload.active)
    elif master_type == "designations":
        record = Designation(title=_required(payload.name or payload.title, "name"), code=payload.code, level=payload.level, description=payload.description)
    elif master_type == "leave_types":
        record = LeaveType(name=_required(payload.name, "name"), code=_required(payload.code, "code"), category=payload.category or "PAID", annual_allocation=payload.annual_allocation, annual_quota=payload.annual_allocation, is_paid=(payload.category or "PAID") != "UNPAID", carry_forward_allowed=payload.carry_forward_allowed, requires_approval=payload.requires_approval, affects_payroll=payload.affects_payroll, active=payload.active, description=payload.description)
    elif master_type == "lookups":
        record = LookupValue(category=_required(payload.category, "category"), code=_required(payload.code, "code"), label=_required(payload.label or payload.name, "label"), sort_order=payload.sort_order, active=payload.active)
    else:
        raise HTTPException(status_code=404, detail="Unsupported master type")
    return _save_master(db, current_user, record, master_type, "created")


@router.patch("/{master_type}/{record_id}", dependencies=[Depends(require_permissions("settings:manage"))])
def update_master(master_type: str, record_id: UUID, payload: MasterPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    model = _model_for(master_type)
    record = db.get(model, record_id)
    if not record or record.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Master record not found")
    old_value = _record_payload(record, master_type)
    values = payload.model_dump(exclude_unset=True)
    if master_type == "departments":
        _assign(record, values, {"name", "active"})
    elif master_type == "designations":
        if "name" in values:
            record.title = values.pop("name")
        _assign(record, values, {"title", "code", "description", "level"})
    elif master_type == "leave_types":
        _assign(record, values, {"name", "code", "category", "annual_allocation", "carry_forward_allowed", "requires_approval", "affects_payroll", "active", "description"})
        record.annual_quota = record.annual_allocation
        record.is_paid = str(record.category) != "UNPAID"
    else:
        if "name" in values and "label" not in values:
            values["label"] = values.pop("name")
        _assign(record, values, {"category", "code", "label", "sort_order", "active"})
    return _save_master(db, current_user, record, master_type, "updated", old_value)


@router.delete("/{master_type}/{record_id}", dependencies=[Depends(require_permissions("settings:manage"))])
def delete_master(master_type: str, record_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    model = _model_for(master_type)
    record = db.get(model, record_id)
    if not record or record.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Master record not found")
    old_value = _record_payload(record, master_type)
    record.deleted_at = datetime.now(timezone.utc)
    if hasattr(record, "active"):
        record.active = False
    return _save_master(db, current_user, record, master_type, "deleted", old_value)


def _save_master(db: Session, user: User, record: Any, master_type: str, action: str, old_value: dict | None = None):
    try:
        db.add(record)
        db.flush()
        new_value = _record_payload(record, master_type)
        db.add(AuditLog(entity_type=f"master.{master_type}", entity_id=record.id, action=f"master.{master_type}.{action}", old_value=old_value, new_value=new_value, performed_by=user.id))
        db.commit()
        return new_value
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="A master record with this name or code already exists.") from exc


def _model_for(master_type: str):
    models = {"departments": Department, "designations": Designation, "leave_types": LeaveType, "lookups": LookupValue}
    if master_type not in models:
        raise HTTPException(status_code=404, detail="Unsupported master type")
    return models[master_type]


def _required(value: str | None, field: str) -> str:
    if not value or not value.strip():
        raise HTTPException(status_code=400, detail=f"{field} is required")
    return value.strip()


def _assign(record: Any, values: dict[str, Any], allowed: set[str]) -> None:
    for key, value in values.items():
        if key in allowed:
            setattr(record, key, value)
