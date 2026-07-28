from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user, require_permissions
from app.db.session import get_db
from app.models.auth import User
from app.models.employee.models import Employee, EmployeeAsset
from app.services.asset_service import asset_to_dict, create_employee_asset

router = APIRouter()

ASSET_TYPES = [
    "Laptop", "Accessories", "ID Card", "Email Access", "Software Access",
    "Monitor", "Mouse", "Keyboard",
    "Headphones", "Pendrive", "Hard Disk", "Mobile Device",
]


class AssetCreateRequest(BaseModel):
    employee_id: UUID
    asset_type: str
    asset_name: str | None = None
    validity_date: date | None = None


class AssetStatusRequest(BaseModel):
    status: str


@router.get("/types")
def get_asset_types():
    return {"types": ASSET_TYPES}


@router.get("", dependencies=[Depends(require_permissions("employees:view"))])
def list_assets(
    employee_id: UUID | None = Query(default=None),
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    stmt = (
        select(EmployeeAsset)
        .options(selectinload(EmployeeAsset.employee))
        .where(EmployeeAsset.deleted_at.is_(None))
        .order_by(EmployeeAsset.created_at.desc())
    )
    if employee_id:
        stmt = stmt.where(EmployeeAsset.employee_id == employee_id)
    if status:
        stmt = stmt.where(EmployeeAsset.asset_status == status.upper())
    assets = db.scalars(stmt).all()
    return [asset_to_dict(a) for a in assets]


@router.post("", status_code=201, dependencies=[Depends(require_permissions("employees:view"))])
def create_asset(
    payload: AssetCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    employee = db.get(Employee, payload.employee_id)
    if not employee or employee.deleted_at:
        raise HTTPException(status_code=404, detail="Employee not found")
    asset = create_employee_asset(
        db,
        employee,
        payload.asset_type,
        asset_name=payload.asset_name,
        validity_date=payload.validity_date,
        source="hr_manual",
    )
    db.commit()
    return asset_to_dict(asset)


@router.patch("/{asset_id}", dependencies=[Depends(require_permissions("employees:view"))])
def update_asset(
    asset_id: UUID,
    payload: AssetStatusRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    asset = db.scalar(
        select(EmployeeAsset)
        .options(selectinload(EmployeeAsset.employee))
        .where(EmployeeAsset.id == asset_id, EmployeeAsset.deleted_at.is_(None))
    )
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    asset.asset_status = payload.status.upper()
    if payload.status.upper() == "RETURNED":
        asset.returned_at = datetime.now(timezone.utc)
    asset.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(asset)
    return asset_to_dict(asset)