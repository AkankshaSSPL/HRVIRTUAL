from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.agents.coordinator_agent.router import serialize_workflow
from app.agents.coordinator_agent.service import CoordinatorRuntimeService
from app.api.deps import get_current_user, require_permissions
from app.db.session import get_db
from app.models.auth import User

router = APIRouter()


class AgentCommandSendRequest(BaseModel):
    user_message: str


class AgentCommandMessage(BaseModel):
    id: str
    type: str
    content: str
    agent_name: str | None = None
    created_at: datetime
    metadata: dict[str, Any] = {}


class AgentCommandStep(BaseModel):
    id: str
    step_name: str
    step_status: str
    input_json: dict[str, Any] | None
    output_json: dict[str, Any] | None
    created_at: datetime


class AgentCommandEvent(BaseModel):
    id: str
    event_type: str
    agent_name: str | None
    message: str
    payload: dict[str, Any]
    created_at: datetime


class AgentCommandWorkflowResponse(BaseModel):
    workflow_id: str
    status: str
    active_agent: str | None
    current_step: str
    messages: list[AgentCommandMessage]
    steps: list[AgentCommandStep]
    timeline_events: list[AgentCommandEvent]
    approval_status: str | None
    approval_request_id: str | None
    initial_response: str | None = None
    result: dict[str, Any] = {}
    started_at: datetime | None
    completed_at: datetime | None


def get_service(db: Session = Depends(get_db)) -> CoordinatorRuntimeService:
    return CoordinatorRuntimeService(db)


def adapt_workflow(workflow) -> AgentCommandWorkflowResponse:
    initial_response = None
    for message in reversed(workflow.messages):
        if message.get("type") in {"agent_message", "approval_message", "workflow_message"}:
            initial_response = message.get("content")
            break
    if not initial_response and workflow.approval_request_id:
        initial_response = "Workflow paused for human approval."
    if not initial_response:
        initial_response = workflow.result.get("message") if isinstance(workflow.result, dict) else None

    return AgentCommandWorkflowResponse(
        workflow_id=workflow.workflow_id,
        status=workflow.workflow_status,
        active_agent=workflow.current_agent,
        current_step=workflow.current_step,
        messages=[AgentCommandMessage(**message) for message in workflow.messages],
        steps=[
            AgentCommandStep(
                id=str(step.id),
                step_name=step.step_name,
                step_status=step.step_status,
                input_json=step.input_json,
                output_json=step.output_json,
                created_at=step.created_at,
            )
            for step in workflow.steps
        ],
        timeline_events=[
            AgentCommandEvent(
                id=event.id,
                event_type=event.event_type,
                agent_name=event.agent_name,
                message=event.message,
                payload=event.payload,
                created_at=event.created_at,
            )
            for event in workflow.events
        ],
        approval_status=workflow.approval_status,
        approval_request_id=workflow.approval_request_id,
        initial_response=initial_response,
        result=workflow.result,
        started_at=workflow.started_at,
        completed_at=workflow.completed_at,
    )


@router.post("/send", response_model=AgentCommandWorkflowResponse, dependencies=[Depends(require_permissions("agent_command:view"))])
def send_command(
    payload: AgentCommandSendRequest,
    current_user: User = Depends(get_current_user),
    service: CoordinatorRuntimeService = Depends(get_service),
) -> AgentCommandWorkflowResponse:
    run = service.submit_command(payload.user_message, current_user.id, {})
    return adapt_workflow(serialize_workflow(run))


@router.get("/workflows", response_model=list[AgentCommandWorkflowResponse], dependencies=[Depends(require_permissions("agent_command:view"))])
def recent_workflows(service: CoordinatorRuntimeService = Depends(get_service)) -> list[AgentCommandWorkflowResponse]:
    return [adapt_workflow(serialize_workflow(run)) for run in service.list_workflows()]


@router.get(
    "/workflows/{workflow_id}",
    response_model=AgentCommandWorkflowResponse,
    dependencies=[Depends(require_permissions("agent_command:view"))],
)
def get_workflow(workflow_id: str, service: CoordinatorRuntimeService = Depends(get_service)) -> AgentCommandWorkflowResponse:
    try:
        return adapt_workflow(serialize_workflow(service.get_workflow(workflow_id)))
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found") from exc


@router.get(
    "/workflows/{workflow_id}/events",
    response_model=list[AgentCommandEvent],
    dependencies=[Depends(require_permissions("agent_command:view"))],
)
def workflow_events(workflow_id: str, service: CoordinatorRuntimeService = Depends(get_service)) -> list[AgentCommandEvent]:
    workflow = adapt_workflow(serialize_workflow(service.get_workflow(workflow_id)))
    return workflow.timeline_events
