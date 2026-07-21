from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class ApprovalCreateRequest(BaseModel):
    module_name: str
    action_name: str
    payload_json: dict[str, Any] = {}
    approval_reason: str
    workflow_id: str | None = None
    workflow_state_json: dict[str, Any] | None = None


class ApprovalDecisionRequest(BaseModel):
    comment: str | None = None


class ApprovalEventRead(BaseModel):
    id: UUID
    event_type: str
    message: str
    payload_json: dict[str, Any] | None
    performed_by: UUID | None
    created_at: datetime


class ApprovalAuditRead(BaseModel):
    id: UUID
    action: str
    old_value: dict[str, Any] | None
    new_value: dict[str, Any] | None
    performed_by: UUID | None
    created_at: datetime


class ApprovalRead(BaseModel):
    id: UUID
    module_name: str
    action_name: str
    payload_json: dict[str, Any] | None
    status: str
    execution_status: str
    workflow_id: str | None
    workflow_state_json: dict[str, Any] | None
    approval_reason: str | None
    requested_by: UUID | None
    approved_by: UUID | None
    rejected_by: UUID | None
    resumed_at: datetime | None
    executed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    events: list[ApprovalEventRead] = []
    audit_logs: list[ApprovalAuditRead] = []
