from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_permissions
from app.db.session import get_db
from app.models.audit import AuditLog
from app.models.auth import User
from app.models.employee import Seat
from app.services.seat_service import (
    assign_seat,
    get_seats_summary,
    list_seats,
    update_seat_status,
    vacate_seat,
)

router = APIRouter()


def _seat_to_dict(seat: Seat) -> dict[str, Any]:
    employee = seat.employee
    employee_name = None
    if employee:
        employee_name = f"{employee.first_name or ''} {employee.last_name or ''}".strip() or None
    return {
        "label": seat.label,
        "zone": seat.zone,
        "row": seat.row,
        "col": seat.col,
        "seat_type": seat.seat_type,
        "status": seat.status,
        "employee_id": str(seat.employee_id) if seat.employee_id else None,
        "employee_name": employee_name,
        "employee_designation": employee.designation.title if employee and employee.designation else None,
        "employee_department": employee.department.name if employee and employee.department else None,
        "employee_email": employee.official_email if employee else None,
    }


class SeatAssignRequest(BaseModel):
    employee_id: UUID


class SeatStatusUpdateRequest(BaseModel):
    status: str


@router.get("", dependencies=[Depends(require_permissions("employees:view"))])
def seats(db: Session = Depends(get_db)):
    records = list_seats(db)
    return {
        "seats": [_seat_to_dict(seat) for seat in records],
        "summary": get_seats_summary(records),
    }


@router.post("/{seat_label}/assign", dependencies=[Depends(require_permissions("employees:manage"))])
def assign(
    seat_label: str,
    payload: SeatAssignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        seat, employee, old_seat_label = assign_seat(db, seat_label, payload.employee_id)
        db.add(
            AuditLog(
                entity_type="seat",
                entity_id=seat.id,
                action="seat.assigned",
                old_value={"seat_label": old_seat_label},
                new_value={"employee_id": str(employee.id), "seat_label": seat.label},
                performed_by=current_user.id,
            )
        )
        db.commit()
        db.refresh(seat)
        return _seat_to_dict(seat)
    except LookupError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{seat_label}/vacate", dependencies=[Depends(require_permissions("employees:manage"))])
def vacate(
    seat_label: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        seat, old_employee_id = vacate_seat(db, seat_label)
        db.add(
            AuditLog(
                entity_type="seat",
                entity_id=seat.id,
                action="seat.vacated",
                old_value={"employee_id": str(old_employee_id) if old_employee_id else None},
                new_value={"employee_id": None},
                performed_by=current_user.id,
            )
        )
        db.commit()
        db.refresh(seat)
        return _seat_to_dict(seat)
    except LookupError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.patch("/{seat_label}/status", dependencies=[Depends(require_permissions("employees:manage"))])
def status(
    seat_label: str,
    payload: SeatStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        seat, old_status = update_seat_status(db, seat_label, payload.status)
        db.add(
            AuditLog(
                entity_type="seat",
                entity_id=seat.id,
                action="seat.status_changed",
                old_value={"status": old_status},
                new_value={"status": seat.status},
                performed_by=current_user.id,
            )
        )
        db.commit()
        db.refresh(seat)
        return _seat_to_dict(seat)
    except LookupError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc