from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.agents.shared.workflow_state import WorkflowState
from app.models.agents import AgentRun


class WorkflowStateStore:
    def __init__(self, db: Session) -> None:
        self.db = db

    def save(self, run: AgentRun, state: WorkflowState) -> AgentRun:
        run.metadata_json = {**(run.metadata_json or {}), "workflow_state": state.model_dump(mode="json")}
        self.db.add(run)
        self.db.commit()
        self.db.refresh(run)
        return run

    def load(self, workflow_id: str) -> WorkflowState | None:
        run = self.db.scalar(
            select(AgentRun)
            .where(AgentRun.correlation_id == workflow_id)
            .options(selectinload(AgentRun.steps))
            .order_by(AgentRun.created_at.desc())
        )
        if not run or not run.metadata_json or not run.metadata_json.get("workflow_state"):
            return None
        return WorkflowState.model_validate(run.metadata_json["workflow_state"])

