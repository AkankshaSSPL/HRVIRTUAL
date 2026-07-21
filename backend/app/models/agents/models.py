from datetime import datetime
from enum import StrEnum
import uuid

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class AgentRunStatus(StrEnum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    WAITING_FOR_APPROVAL = "WAITING_FOR_APPROVAL"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class AgentStepStatus(StrEnum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"


class AgentRun(BaseModel):
    __tablename__ = "agent_runs"
    __table_args__ = (
        Index("ix_agent_runs_agent_status", "agent_name", "status"),
        Index("ix_agent_runs_started_at", "started_at"),
    )

    agent_name: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[AgentRunStatus] = mapped_column(String(40), nullable=False, default=AgentRunStatus.PENDING)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    requested_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    correlation_id: Mapped[str | None] = mapped_column(String(120), index=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSONB)

    steps: Mapped[list["AgentStep"]] = relationship(back_populates="agent_run", cascade="all, delete-orphan")


class AgentStep(BaseModel):
    __tablename__ = "agent_steps"
    __table_args__ = (
        Index("ix_agent_steps_run_status", "agent_run_id", "step_status"),
        Index("ix_agent_steps_step_name", "step_name"),
    )

    agent_run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False)
    step_name: Mapped[str] = mapped_column(String(180), nullable=False)
    step_status: Mapped[AgentStepStatus] = mapped_column(String(40), nullable=False, default=AgentStepStatus.PENDING)
    input_json: Mapped[dict | None] = mapped_column(JSONB)
    output_json: Mapped[dict | None] = mapped_column(JSONB)

    agent_run: Mapped[AgentRun] = relationship(back_populates="steps")

