from __future__ import annotations

from datetime import date


def validate_assignment_request(*, employee_name: str, structure_name: str, gross_salary: float | None, effective_from: date | None) -> list[str]:
    missing: list[str] = []
    if not employee_name:
        missing.append("employee")
    if not structure_name:
        missing.append("salary structure")
    if gross_salary is None:
        missing.append("gross salary")
    if effective_from is None:
        missing.append("effective date")
    return missing
