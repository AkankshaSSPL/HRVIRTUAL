from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.employee.models import Employee, EmployeeAsset

# The fixed onboarding kit — assigned automatically whenever a seat is
# assigned, no HR selection required.
STANDARD_ONBOARDING_ASSETS = [
    "Laptop", "Accessories", "ID Card", "Email Access", "Software Access",
]

# HR opts in to these per employee from the seating modal.
OPTIONAL_ONBOARDING_ASSETS = [
    "Hard Disk", "Mobile Device", "Pendrive", "Headphones", "Monitor",
]

# Asset types where the specific make/model is worth capturing.
BRANDED_ASSET_TYPES = {"Laptop", "Monitor"}


def asset_to_dict(asset: EmployeeAsset) -> dict:
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


def _next_asset_code(db: Session, employee: Employee, asset_type: str) -> str:
    emp_code = (employee.employee_code or str(employee.id)[:6]).replace("-", "")
    type_code = asset_type.upper().replace(" ", "-")[:8]
    year = date.today().year
    last = db.scalar(
        select(EmployeeAsset).where(
            EmployeeAsset.employee_id == employee.id,
            EmployeeAsset.asset_type == asset_type,
            EmployeeAsset.deleted_at.is_(None),
        ).order_by(EmployeeAsset.created_at.desc())
    )
    suffix = "001"
    if last:
        tail = last.asset_code.split("-")[-1]
        suffix = f"{(int(tail) + 1):03d}" if tail.isdigit() else "002"
    return f"{type_code}-{year}-{emp_code[:6]}-{suffix}"


def create_employee_asset(
    db: Session,
    employee: Employee,
    asset_type: str,
    asset_name: str | None = None,
    validity_date=None,
    source: str = "hr_manual",
    serial_number: str | None = None,
    asset_code: str | None = None,
    purchase_date: date | None = None,
    purchase_cost: float | None = None,
    status: str | None = None,
    condition: str | None = None,
    location: str | None = None,
    supplier: str | None = None,
    warranty_info: str | None = None,
) -> EmployeeAsset:
    """Create and flush a single asset assignment. Caller commits."""
    meta = {"source": source}
    if serial_number: meta["serial_number"] = serial_number
    if purchase_date: meta["purchase_date"] = purchase_date.isoformat() if isinstance(purchase_date, date) else purchase_date
    if purchase_cost is not None: meta["purchase_cost"] = purchase_cost
    if condition: meta["asset_condition"] = condition
    if location: meta["location"] = location
    if supplier: meta["supplier"] = supplier
    if warranty_info: meta["warranty_info"] = warranty_info
    
    asset = EmployeeAsset(
        employee_id=employee.id,
        asset_type=asset_type,
        asset_name=asset_name,
        asset_code=asset_code or _next_asset_code(db, employee, asset_type),
        asset_status=status or "ASSIGNED",
        assigned_at=datetime.now(timezone.utc),
        validity_date=validity_date,
        metadata_json=meta,
    )
    db.add(asset)
    db.flush()
    db.refresh(asset)
    asset.employee = employee
    return asset


def assign_onboarding_assets(
    db: Session,
    employee: Employee,
    optional_asset_types: list[str] | None = None,
    asset_names: dict[str, str] | None = None,
) -> list[EmployeeAsset]:
    """
    Create the standard onboarding asset kit for `employee`, plus any
    optional asset types HR selected in the seating modal. Idempotent per
    asset type: an asset type the employee already holds in ASSIGNED status
    is not duplicated — but if `asset_names` supplies a brand/model for a
    type that's already assigned (e.g. HR sets the Laptop brand after the
    laptop was auto-assigned with no name), that existing asset's
    `asset_name` is updated in place instead of being skipped.
    Caller is responsible for db.commit().
    """
    asset_names = asset_names or {}

    existing_by_type: dict[str, EmployeeAsset] = {
        a.asset_type: a
        for a in db.scalars(
            select(EmployeeAsset).where(
                EmployeeAsset.employee_id == employee.id,
                EmployeeAsset.deleted_at.is_(None),
                EmployeeAsset.asset_status == "ASSIGNED",
            )
        ).all()
    }

    wanted = list(STANDARD_ONBOARDING_ASSETS)
    for asset_type in optional_asset_types or []:
        if asset_type in OPTIONAL_ONBOARDING_ASSETS and asset_type not in wanted:
            wanted.append(asset_type)

    created: list[EmployeeAsset] = []
    for asset_type in wanted:
        name = asset_names.get(asset_type) or None
        existing = existing_by_type.get(asset_type)
        if existing:
            if asset_type in BRANDED_ASSET_TYPES and name and existing.asset_name != name:
                existing.asset_name = name
            continue
        created.append(
            create_employee_asset(db, employee, asset_type, asset_name=name, source="onboarding_auto")
        )

    return created