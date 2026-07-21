from dataclasses import dataclass, field
from typing import Any


@dataclass
class SalaryAssignmentState:
    command: str
    employee_name: str | None = None
    structure_name: str | None = None
    gross_salary: float | None = None
    effective_from: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
