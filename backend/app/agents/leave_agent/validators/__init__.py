from datetime import date


def validate_leave_dates(from_date: date, to_date: date) -> None:
    if to_date < from_date:
        raise ValueError("Leave end date cannot be before start date")
