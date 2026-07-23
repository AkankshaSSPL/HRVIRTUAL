from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.employee import Employee, Seat, SeatStatus

ASSIGNABLE_STATUSES = {SeatStatus.AVAILABLE.value, SeatStatus.RESERVED.value}
VALID_STATUSES = {status.value for status in SeatStatus}


def list_seats(db: Session) -> list[Seat]:
    stmt = (
        select(Seat)
        .options(
            selectinload(Seat.employee).selectinload(Employee.designation),
            selectinload(Seat.employee).selectinload(Employee.department),
        )
        .order_by(Seat.zone, Seat.row, Seat.col, Seat.label)
    )
    return list(db.scalars(stmt).all())


def get_seats_summary(seats: list[Seat]) -> dict[str, int]:
    summary = {status.value.lower(): 0 for status in SeatStatus}
    for seat in seats:
        key = seat.status.lower()
        summary[key] = summary.get(key, 0) + 1
    return summary


def _get_seat_or_raise(db: Session, seat_label: str) -> Seat:
    seat = db.scalar(select(Seat).where(Seat.label == seat_label))
    if not seat:
        raise LookupError(f"Seat '{seat_label}' not found")
    return seat


def assign_seat(db: Session, seat_label: str, employee_id: UUID) -> tuple[Seat, Employee, str | None]:
    """
    Assign `seat_label` to `employee_id`. If the employee already occupies a
    different seat, that seat is freed automatically so an employee never
    holds two seats at once. Raises LookupError if the seat/employee doesn't
    exist, ValueError if the seat isn't in an assignable status.
    Caller is responsible for db.commit().
    """
    seat = _get_seat_or_raise(db, seat_label)
    if seat.status not in ASSIGNABLE_STATUSES:
        raise ValueError(f"Seat '{seat_label}' is not available for assignment (status: {seat.status})")

    employee = db.get(Employee, employee_id)
    if not employee or employee.deleted_at is not None:
        raise LookupError(f"Employee '{employee_id}' not found")

    old_seat_label = employee.seat_label

    if old_seat_label and old_seat_label != seat_label:
        previous_seat = db.scalar(select(Seat).where(Seat.label == old_seat_label))
        if previous_seat and previous_seat.employee_id == employee.id:
            previous_seat.status = SeatStatus.AVAILABLE.value
            previous_seat.employee_id = None

    seat.status = SeatStatus.OCCUPIED.value
    seat.employee_id = employee.id
    employee.seat_label = seat.label

    return seat, employee, old_seat_label


def vacate_seat(db: Session, seat_label: str) -> tuple[Seat, UUID | None]:
    """
    Free `seat_label` and clear the occupant's employee.seat_label.
    Caller is responsible for db.commit().
    """
    seat = _get_seat_or_raise(db, seat_label)
    old_employee_id = seat.employee_id

    if seat.employee_id:
        employee = db.get(Employee, seat.employee_id)
        if employee and employee.seat_label == seat.label:
            employee.seat_label = None

    seat.status = SeatStatus.AVAILABLE.value
    seat.employee_id = None

    return seat, old_employee_id


def update_seat_status(db: Session, seat_label: str, new_status: str) -> tuple[Seat, str]:
    """
    Change a seat's status directly (RESERVED/MAINTENANCE/BLOCKED/AVAILABLE).
    Refuses to silently override an OCCUPIED seat — vacate it first.
    Caller is responsible for db.commit().
    """
    seat = _get_seat_or_raise(db, seat_label)
    if new_status not in VALID_STATUSES:
        raise ValueError(f"Invalid seat status '{new_status}'")
    if seat.employee_id and new_status != SeatStatus.OCCUPIED.value:
        raise ValueError("Cannot change status of an occupied seat without vacating it first")

    old_status = seat.status
    seat.status = new_status
    return seat, old_status