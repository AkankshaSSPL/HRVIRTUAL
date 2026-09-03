"""Offboarding endpoints, prefix /offboarding (see router.py):

    POST  /api/v1/offboarding/{employee_id}/initiate   (offboarding:manage)
    GET   /api/v1/offboarding                          (offboarding:view)
    GET   /api/v1/offboarding/{employee_id}             (offboarding:view)
    PATCH /api/v1/offboarding/{employee_id}             (offboarding:manage)
    POST  /api/v1/offboarding/{employee_id}/finalize    (offboarding:manage)

ASSUMPTIONS THAT NEED VERIFICATION against the real files (deps.py,
security.py, seat_service.py, models):
  - `require_permissions("offboarding:manage")` is a dependency factory in
    app.api.deps with this exact call signature (mirrors how the plan's
    existing employees:manage routes are presumably gated).
  - `get_current_user` returns an object with `.id`.
  - RefreshToken has `user_id` and `revoked_at` columns.
  - Employee has `first_name`, `last_name`, `employment_status`,
    `seat_label` fields, and a `.user` relationship.
  - EmployeeAsset has `employee_id`, `status`, `returned_at` fields and the
    "ASSIGNED" / "RETURN_PENDING" / "RETURNED" status values used below —
    confirm the real enum/string values match.
  - seat_service.py was NOT available in this session. Per the earlier
    decision (see notes below the import comment), seat release is done
    directly against Employee.seat_label as a stopgap rather than guessing
    vacate_seat()'s signature. Swap in seat_service.vacate_seat() once
    that file is shared, to keep its audit logging/side effects consistent.
"""
from datetime import date, datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_permissions
from app.models.auth.models import ActivationToken, RefreshToken, User
from app.models.employee.models import Employee, EmployeeAsset, OffboardingCase
from app.services import face_service
from app.services.offboarding_progress import compute_offboarding_progress

router = APIRouter()


class InitiateOffboardingRequest(BaseModel):
    exit_type: str
    exit_reason: Optional[str] = None
    exit_date: date


class UpdateOffboardingRequest(BaseModel):
    knowledge_transfer_done: Optional[bool] = None
    exit_interview_done: Optional[bool] = None
    final_settlement_done: Optional[bool] = None
    id_card_returned: Optional[bool] = None
    nda_signed: Optional[bool] = None
    client_credentials_cleared: Optional[bool] = None
    personal_logins_cleared: Optional[bool] = None
    recovery_details_updated: Optional[bool] = None
    notes: Optional[str] = None


def _get_case_or_404(db: Session, employee_id: UUID, active_only: bool = False) -> OffboardingCase:
    query = db.query(OffboardingCase).filter(OffboardingCase.employee_id == employee_id)
    if active_only:
        query = query.filter(OffboardingCase.status == "IN_PROGRESS")
    case = query.order_by(OffboardingCase.created_at.desc()).first()
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No offboarding case found")
    return case


def _build_offboarding_response(db: Session, case: OffboardingCase):
    employee = case.employee
    checklist = compute_offboarding_progress(db, employee, case)
    
    assets_data = []
    for a in employee.assets:
        if a.asset_status in ["ASSIGNED", "RETURN_PENDING"]:
            assets_data.append({
                "asset_type": a.asset_type,
                "asset_name": a.asset_name,
                "asset_code": a.asset_code
            })
            
    personal_info = {
        "phone": employee.phone,
        "official_email": employee.official_email,
        "personal_email": employee.personal_email,
        "address": employee.address,
        "pan_number": employee.pan_number,
        "aadhaar_number": employee.aadhaar_number
    }
    
    return {
        "case": case,
        "checklist": checklist,
        "assets": assets_data,
        "personal_info": personal_info
    }


@router.post(
    "/{employee_id}/initiate",
    dependencies=[Depends(require_permissions("offboarding:manage"))],
)
def initiate_offboarding(
    employee_id: UUID,
    payload: InitiateOffboardingRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    employee = db.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    existing = (
        db.query(OffboardingCase)
        .filter(OffboardingCase.employee_id == employee_id, OffboardingCase.status == "IN_PROGRESS")
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An offboarding case is already in progress for this employee.",
        )

    case = OffboardingCase(
        employee_id=employee_id,
        status="IN_PROGRESS",
        initiated_by=current_user.id,
    )
    db.add(case)

    employee.employment_status = "NOTICE_PERIOD"
    employee.exit_type = payload.exit_type
    employee.exit_reason = payload.exit_reason
    employee.exit_date = payload.exit_date
    employee.offboarding_initiated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(case)
    db.refresh(employee)

    return _build_offboarding_response(db, case)


@router.get("", dependencies=[Depends(require_permissions("offboarding:view"))])
def list_offboarding(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
):
    query = db.query(OffboardingCase)
    if status_filter:
        query = query.filter(OffboardingCase.status == status_filter)
    cases = query.order_by(OffboardingCase.created_at.desc()).all()

    results = []
    for case in cases:
        employee = case.employee
        checklist = compute_offboarding_progress(db, employee, case)
        results.append(
            {
                "employee_id": employee.id,
                "employee_name": f"{employee.first_name} {employee.last_name}",
                "exit_type": employee.exit_type,
                "exit_date": employee.exit_date,
                "status": case.status,
                "percent": checklist.percent,
            }
        )
    return results


@router.get("/{employee_id}", dependencies=[Depends(require_permissions("offboarding:view"))])
def get_offboarding(employee_id: UUID, db: Session = Depends(get_db)):
    case = _get_case_or_404(db, employee_id)
    return _build_offboarding_response(db, case)


@router.patch("/{employee_id}", dependencies=[Depends(require_permissions("offboarding:manage"))])
def update_offboarding(
    employee_id: UUID,
    payload: UpdateOffboardingRequest,
    db: Session = Depends(get_db),
):
    case = _get_case_or_404(db, employee_id, active_only=True)

    data = payload.model_dump(exclude_unset=True)
    for field_name, value in data.items():
        setattr(case, field_name, value)

    db.commit()
    db.refresh(case)

    return _build_offboarding_response(db, case)


@router.post(
    "/{employee_id}/finalize",
    dependencies=[Depends(require_permissions("offboarding:manage"))],
)
def finalize_offboarding(
    employee_id: UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    case = _get_case_or_404(db, employee_id, active_only=True)
    employee = case.employee

    checklist = compute_offboarding_progress(db, employee, case)
    if not checklist.can_finalize:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="All manual checklist items must be complete before finalizing.",
        )

    user = employee.user

    # --- Cascade (single transaction) ---
    employee.employment_status = "EXITED"
    employee.offboarding_completed_at = datetime.now(timezone.utc)
    case.status = "COMPLETED"
    case.completed_at = datetime.now(timezone.utc)

    if user is not None:
        user.is_active = False

        db.query(RefreshToken).filter(
            RefreshToken.user_id == user.id,
            RefreshToken.revoked_at.is_(None),
        ).update({RefreshToken.revoked_at: datetime.now(timezone.utc)})

        db.query(ActivationToken).filter(
            ActivationToken.user_id == user.id,
            ActivationToken.used_at.is_(None),
        ).update({ActivationToken.used_at: datetime.now(timezone.utc)})

    # Seat release — see module docstring re: seat_service.py not being
    # available yet. Direct field reset as a stopgap.
    if getattr(employee, "seat_label", None):
        employee.seat_label = None

    assets = (
        db.query(EmployeeAsset)
        .filter(
            EmployeeAsset.employee_id == employee.id,
            EmployeeAsset.asset_status.in_(["ASSIGNED", "RETURN_PENDING"]),
        )
        .all()
    )
    for asset in assets:
        asset.asset_status = "RETURNED"
        asset.returned_at = datetime.now(timezone.utc)

    if user is not None and getattr(user, "face_registered", False):
        face_service.remove_enrollment(str(user.id), db)
        background_tasks.add_task(face_service.retrain_classifier)

    db.commit()
    db.refresh(case)
    db.refresh(employee)

    return _build_offboarding_response(db, case)