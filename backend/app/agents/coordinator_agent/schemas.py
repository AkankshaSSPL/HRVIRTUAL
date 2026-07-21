from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class CoordinatorCommandRequest(BaseModel):
    command: str
    metadata: dict[str, Any] = {}


class AgentMetadataRead(BaseModel):
    name: str
    description: str
    supported_actions: list[str]
    approval_required_actions: list[str]


class AgentStepRead(BaseModel):
    id: UUID
    step_name: str
    step_status: str
    input_json: dict[str, Any] | None
    output_json: dict[str, Any] | None
    created_at: datetime


class AgentEventRead(BaseModel):
    id: str
    workflow_id: str
    event_type: str
    agent_name: str | None
    message: str
    payload: dict[str, Any]
    created_at: datetime


class WorkflowRead(BaseModel):
    workflow_id: str
    run_id: UUID
    agent_name: str
    status: str
    current_agent: str | None
    current_step: str
    workflow_status: str
    approval_status: str | None
    approval_request_id: str | None
    messages: list[dict[str, Any]]
    execution_history: list[dict[str, Any]]
    result: dict[str, Any]
    events: list[AgentEventRead]
    steps: list[AgentStepRead]
    started_at: datetime | None
    completed_at: datetime | None

