from datetime import datetime, timezone
from enum import StrEnum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field


class AgentEventType(StrEnum):
    WORKFLOW_CREATED = "WORKFLOW_CREATED"
    AGENT_STARTED = "AGENT_STARTED"
    AGENT_COMPLETED = "AGENT_COMPLETED"
    APPROVAL_REQUIRED = "APPROVAL_REQUIRED"
    WORKFLOW_PAUSED = "WORKFLOW_PAUSED"
    WORKFLOW_RESUMED = "WORKFLOW_RESUMED"
    TOOL_EXECUTED = "TOOL_EXECUTED"
    ERROR_OCCURRED = "ERROR_OCCURRED"
    EMPLOYEE_SEARCHED = "EMPLOYEE_SEARCHED"
    EMPLOYEE_UPDATED = "EMPLOYEE_UPDATED"
    EMPLOYEE_CREATED = "EMPLOYEE_CREATED"
    EMPLOYEE_DEACTIVATED = "EMPLOYEE_DEACTIVATED"
    ONBOARDING_STARTED = "ONBOARDING_STARTED"
    RESUME_PARSED = "RESUME_PARSED"
    DOCUMENT_PENDING = "DOCUMENT_PENDING"
    ASSET_REQUESTED = "ASSET_REQUESTED"
    ONBOARDING_COMPLETED = "ONBOARDING_COMPLETED"
    ATTENDANCE_RECORDED = "ATTENDANCE_RECORDED"
    ATTENDANCE_SUMMARY_GENERATED = "ATTENDANCE_SUMMARY_GENERATED"
    LEAVE_APPLIED = "LEAVE_APPLIED"
    LEAVE_APPROVED = "LEAVE_APPROVED"
    LEAVE_REJECTED = "LEAVE_REJECTED"
    LOP_CALCULATED = "LOP_CALCULATED"


class AgentEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    workflow_id: str
    event_type: AgentEventType
    agent_name: str | None = None
    message: str
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
