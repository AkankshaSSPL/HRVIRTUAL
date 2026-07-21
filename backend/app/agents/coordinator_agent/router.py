from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.agents.coordinator_agent.schemas import (
    AgentEventRead,
    AgentMetadataRead,
    AgentStepRead,
    CoordinatorCommandRequest,
    WorkflowRead,
)
from app.agents.coordinator_agent.service import CoordinatorRuntimeService
from app.agents.shared.agent_events import AgentEvent
from app.agents.shared.agent_registry import agent_registry
from app.api.deps import get_current_user, require_permissions
from app.db.session import get_db
from app.models.agents import AgentRun
from app.models.auth import User

router = APIRouter()


def get_service(db: Session = Depends(get_db)) -> CoordinatorRuntimeService:
    return CoordinatorRuntimeService(db)


def serialize_event(event: AgentEvent) -> AgentEventRead:
    return AgentEventRead(
        id=event.id,
        workflow_id=event.workflow_id,
        event_type=str(event.event_type),
        agent_name=event.agent_name,
        message=event.message,
        payload=event.payload,
        created_at=event.created_at,
    )


def serialize_stored_event(event: dict) -> AgentEventRead:
    """Keep workflow reads resilient when persisted events evolve between releases."""
    try:
        return serialize_event(AgentEvent.model_validate(event))
    except Exception:
        created_at = event.get("created_at") or datetime.now(timezone.utc)
        if isinstance(created_at, str):
            try:
                created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            except ValueError:
                created_at = datetime.now(timezone.utc)

        return AgentEventRead(
            id=str(event.get("id") or uuid4()),
            workflow_id=str(event.get("workflow_id") or event.get("workflowId") or ""),
            event_type=str(event.get("event_type") or event.get("eventType") or "WORKFLOW_EVENT"),
            agent_name=event.get("agent_name") or event.get("agentName"),
            message=str(event.get("message") or "Workflow event recorded"),
            payload=event.get("payload") or {},
            created_at=created_at,
        )


def serialize_workflow(run: AgentRun) -> WorkflowRead:
    metadata = run.metadata_json or {}
    state = metadata.get("workflow_state", {})
    events = [serialize_stored_event(event) for event in metadata.get("events", []) if isinstance(event, dict)]
    return WorkflowRead(
        workflow_id=run.correlation_id or str(run.id),
        run_id=run.id,
        agent_name=run.agent_name,
        status=str(run.status),
        current_agent=state.get("current_agent"),
        current_step=state.get("current_step", "unknown"),
        workflow_status=state.get("workflow_status", str(run.status)),
        approval_status=state.get("approval_status"),
        approval_request_id=state.get("approval_request_id"),
        messages=state.get("messages", []),
        execution_history=state.get("execution_history", []),
        result=metadata.get("result", state.get("result", {})),
        events=events,
        steps=[
            AgentStepRead(
                id=step.id,
                step_name=step.step_name,
                step_status=str(step.step_status),
                input_json=step.input_json,
                output_json=step.output_json,
                created_at=step.created_at,
            )
            for step in sorted(run.steps, key=lambda item: item.created_at)
        ],
        started_at=run.started_at,
        completed_at=run.completed_at,
    )


@router.post("/command", response_model=WorkflowRead, dependencies=[Depends(require_permissions("agent_command:view"))])
def submit_command(
    payload: CoordinatorCommandRequest,
    current_user: User = Depends(get_current_user),
    service: CoordinatorRuntimeService = Depends(get_service),
) -> WorkflowRead:
    run = service.submit_command(payload.command, current_user.id, payload.metadata)
    return serialize_workflow(run)


@router.get("/workflows", response_model=list[WorkflowRead], dependencies=[Depends(require_permissions("agent_command:view"))])
def list_workflows(service: CoordinatorRuntimeService = Depends(get_service)) -> list[WorkflowRead]:
    return [serialize_workflow(run) for run in service.list_workflows()]


@router.get("/workflows/{workflow_id}", response_model=WorkflowRead, dependencies=[Depends(require_permissions("agent_command:view"))])
def get_workflow(workflow_id: str, service: CoordinatorRuntimeService = Depends(get_service)) -> WorkflowRead:
    try:
        return serialize_workflow(service.get_workflow(workflow_id))
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found") from exc


@router.get("/workflows/{workflow_id}/events", response_model=list[AgentEventRead], dependencies=[Depends(require_permissions("agent_command:view"))])
def get_workflow_events(workflow_id: str, service: CoordinatorRuntimeService = Depends(get_service)) -> list[AgentEventRead]:
    return [serialize_event(event) for event in service.list_events(workflow_id)]


@router.get("/registry", response_model=list[AgentMetadataRead], dependencies=[Depends(require_permissions("agent_command:view"))])
def registry() -> list[AgentMetadataRead]:
    return [AgentMetadataRead(**metadata) for metadata in agent_registry.metadata()]
