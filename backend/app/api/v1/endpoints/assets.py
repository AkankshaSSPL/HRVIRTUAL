from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user, require_permissions
from app.db.session import get_db
from app.models.auth import User
from app.models.employee.models import Employee, EmployeeAsset

router = APIRouter()

ASSET_TYPES = [
    "Laptop", "Monitor", "Mouse", "Keyboard",
    "Headphones", "Pendrive", "Hard Disk", "Mobile Device",
]


class AssetCreateRequest(BaseModel):
    employee_id: UUID
    asset_type: str
    asset_name: str | None = None
    validity_date: date | None = None


class AssetStatusRequest(BaseModel):
    status: str


def _asset_payload(asset: EmployeeAsset) -> dict:
    employee = asset.employee
    name = ""
    if employee:
        name = " ".join(p for p in (employee.first_name, employee.last_name) if p).strip() or (employee.employee_code or "")
    today = date.today()
    validity_date = asset.validity_date
    asset_name = asset.asset_name or (asset.metadata_json or {}).get("asset_name")
    is_expired = bool(validity_date and validity_date < today)
    return {
        "id": str(asset.id),
        "employee_id": str(asset.employee_id),
        "employee_name": name,
        "asset_type": asset.asset_type,
        "asset_name": asset_name,
        "asset_code": asset.asset_code,
        "asset_status": str(asset.asset_status),
        "assigned_at": asset.assigned_at.isoformat() if asset.assigned_at else None,
        "returned_at": asset.returned_at.isoformat() if asset.returned_at else None,
        "validity_date": validity_date.isoformat() if validity_date else None,
        "is_expired": is_expired,
        "metadata_json": asset.metadata_json,
    }


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
    return [_asset_payload(a) for a in assets]


@router.post("", status_code=201, dependencies=[Depends(require_permissions("employees:view"))])
def create_asset(
    payload: AssetCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    employee = db.get(Employee, payload.employee_id)
    if not employee or employee.deleted_at:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Employee not found")
    # Build a readable code: TYPE-YYYY-empcode[:6]
    emp_code = (employee.employee_code or str(employee.id)[:6]).replace("-", "")
    type_code = payload.asset_type.upper().replace(" ", "-")[:8]
    year = date.today().year
    seq = db.scalar(
        select(EmployeeAsset).where(
            EmployeeAsset.employee_id == employee.id,
            EmployeeAsset.asset_type == payload.asset_type,
            EmployeeAsset.deleted_at.is_(None),
        ).order_by(EmployeeAsset.created_at.desc())
    )
    suffix = "001" if not seq else f"{(int(seq.asset_code.split('-')[-1]) + 1):03d}" if seq.asset_code.split('-')[-1].isdigit() else "002"
    asset_code = f"{type_code}-{year}-{emp_code[:6]}-{suffix}"
    asset = EmployeeAsset(
        employee_id=employee.id,
        asset_type=payload.asset_type,
        asset_name=payload.asset_name,
        asset_code=asset_code,
        asset_status="ASSIGNED",
        assigned_at=datetime.now(timezone.utc),
        validity_date=payload.validity_date,
        metadata_json={"source": "hr_manual"},
    )
    db.add(asset)
    db.flush()
    db.refresh(asset)
    asset.employee = employee
    db.commit()
    return _asset_payload(asset)


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
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Asset not found")
    asset.asset_status = payload.status.upper()
    if payload.status.upper() == "RETURNED":
        asset.returned_at = datetime.now(timezone.utc)
    asset.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(asset)
    return _asset_payload(asset)