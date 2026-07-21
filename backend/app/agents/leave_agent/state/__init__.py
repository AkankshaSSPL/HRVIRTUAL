from typing import TypedDict


class LeaveWorkflowState(TypedDict, total=False):
    workflow_id: str
    action: str
    employee_id: str
    leave_type: str
    status: str
