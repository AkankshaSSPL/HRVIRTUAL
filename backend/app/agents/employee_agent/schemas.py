from datetime import date
from enum import StrEnum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class EmployeeAgentAction(StrEnum):
    SEARCH = "search"
    LIST = "list"
    SHOW_PROFILE = "show_profile"
    SHOW_DEPARTMENT = "show_department"
    SHOW_MANAGER = "show_manager"
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    UPDATE_SALARY = "update_salary"
    CHANGE_MANAGER = "change_manager"
    CHANGE_DEPARTMENT = "change_department"
    DEACTIVATE = "deactivate"


class EmployeeSummary(BaseModel):
    id: UUID | None = None
    employee_code: str | None = None
    name: str
    designation: str | None = None
    department: str | None = None
    manager: str | None = None
    status: str | None = None
    joining_date: date | None = None
    official_email: str | None = None
    salary: str | None = None


class EmployeeStructuredResponse(BaseModel):
    type: str
    title: str
    summary: str
    employees: list[EmployeeSummary] = Field(default_factory=list)
    employee: EmployeeSummary | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    actions: list[str] = Field(default_factory=list)
