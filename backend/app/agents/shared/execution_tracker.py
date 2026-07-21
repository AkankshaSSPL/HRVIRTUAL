from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.agents.shared.agent_events import AgentEvent, AgentEventType
from app.models.agents import AgentRun, AgentRunStatus, AgentStep, AgentStepStatus


class ExecutionTracker:
    def __init__(self, db: Session) -> None:
        self.db = db

    def start_run(self, *, workflow_id: str, agent_name: str, requested_by: UUID | None, metadata: dict[str, Any]) -> AgentRun:
        run = AgentRun(
            agent_name=agent_name,
            status=AgentRunStatus.RUNNING,
            started_at=datetime.now(timezone.utc),
            requested_by=requested_by,
            correlation_id=workflow_id,
            metadata_json={**metadata, "events": []},
        )
        self.db.add(run)
        self.db.commit()
        self.db.refresh(run)
        self.event(run, AgentEventType.WORKFLOW_CREATED, "Workflow created", agent_name)
        self.event(run, AgentEventType.AGENT_STARTED, "Coordinator workflow started", agent_name)
        return run

    def step(
        self,
        run: AgentRun,
        *,
        step_name: str,
        status: AgentStepStatus,
        input_json: dict[str, Any] | None = None,
        output_json: dict[str, Any] | None = None,
    ) -> AgentStep:
        step = AgentStep(agent_run_id=run.id, step_name=step_name, step_status=status, input_json=input_json, output_json=output_json)
        self.db.add(step)
        self.db.commit()
        self.db.refresh(step)
        return step

    def event(
        self,
        run: AgentRun,
        event_type: AgentEventType,
        message: str,
        agent_name: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> AgentEvent:
        event = AgentEvent(
            workflow_id=run.correlation_id or str(run.id),
            event_type=event_type,
            agent_name=agent_name,
            message=message,
            payload=payload or {},
        )
        metadata = dict(run.metadata_json or {})
        metadata["events"] = [*metadata.get("events", []), event.model_dump(mode="json")]
        run.metadata_json = metadata
        flag_modified(run, "metadata_json")
        self.db.add(run)
        self.db.commit()
        self.db.refresh(run)
        return event

    def finish(self, run: AgentRun, status: AgentRunStatus, result: dict[str, Any]) -> AgentRun:
        run.status = status
        run.completed_at = datetime.now(timezone.utc) if status in {AgentRunStatus.COMPLETED, AgentRunStatus.FAILED} else None
        run.metadata_json = {**(run.metadata_json or {}), "result": result}
        flag_modified(run, "metadata_json")
        self.db.add(run)
        self.db.commit()
        self.db.refresh(run)
        return run
