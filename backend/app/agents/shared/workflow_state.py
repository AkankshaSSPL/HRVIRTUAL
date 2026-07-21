from datetime import datetime, timezone
from enum import StrEnum
from typing import Any, TypedDict
from uuid import uuid4

from pydantic import BaseModel, Field

from app.agents.shared.message_types import AgentMessage


class ApprovalWorkflowState(TypedDict, total=False):
    workflow_id: str
    approval_request_id: str
    module_name: str
    action_name: str
    payload_json: dict[str, Any]
    approval_reason: str
    requested_by: str | None
    decision: str | None
    execution_status: str
    result: dict[str, Any]


class WorkflowStatus(StrEnum):
    CREATED = "CREATED"
    RUNNING = "RUNNING"
    WAITING_APPROVAL = "WAITING_APPROVAL"
    RESUMED = "RESUMED"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class ExecutionHistoryItem(BaseModel):
    step: str
    agent_name: str | None = None
    status: str
    detail: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class WorkflowState(BaseModel):
    workflow_id: str = Field(default_factory=lambda: str(uuid4()))
    current_agent: str | None = None
    current_step: str = "created"
    workflow_status: WorkflowStatus = WorkflowStatus.CREATED
    messages: list[AgentMessage] = Field(default_factory=list)
    execution_history: list[ExecutionHistoryItem] = Field(default_factory=list)
    approval_status: str | None = None
    approval_request_id: str | None = None
    result: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def add_history(self, item: ExecutionHistoryItem) -> None:
        self.execution_history.append(item)
        self.updated_at = datetime.now(timezone.utc)
