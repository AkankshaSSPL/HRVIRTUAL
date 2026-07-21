from enum import StrEnum
from pydantic import BaseModel


class LeaveAgentAction(StrEnum):
    APPLY = "apply"
    BALANCE = "balance"
    APPROVE = "approve"
    SUMMARY = "summary"


class LeaveRequestPayload(BaseModel):
    employee_id: str
    leave_type: str
    start_date: str
    end_date: str
    total_days: float
    status: str
