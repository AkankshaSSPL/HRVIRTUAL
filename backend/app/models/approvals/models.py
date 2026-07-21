from datetime import datetime
from enum import StrEnum
import uuid

from sqlalchemy import DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class ApprovalStatus(StrEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    NEEDS_CHANGES = "NEEDS_CHANGES"
    EXECUTED = "EXECUTED"
    FAILED = "FAILED"


class ApprovalExecutionStatus(StrEnum):
    WAITING_FOR_APPROVAL = "WAITING_FOR_APPROVAL"
    READY_TO_RESUME = "READY_TO_RESUME"
    RESUMING = "RESUMING"
    EXECUTED = "EXECUTED"
    BLOCKED = "BLOCKED"
    FAILED = "FAILED"


class ApprovalEventType(StrEnum):
    CREATED = "CREATED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    NEEDS_CHANGES = "NEEDS_CHANGES"
    WORKFLOW_RESUMED = "WORKFLOW_RESUMED"
    EXECUTED = "EXECUTED"
    FAILED = "FAILED"


class ApprovalRequest(BaseModel):
    __tablename__ = "approval_requests"
    __table_args__ = (
        Index("ix_approval_requests_module_status", "module_name", "status"),
        Index("ix_approval_requests_requested_by", "requested_by"),
        Index("ix_approval_requests_workflow_id", "workflow_id"),
        Index("ix_approval_requests_execution_status", "execution_status"),
    )

    module_name: Mapped[str] = mapped_column(String(120), nullable=False)
    action_name: Mapped[str] = mapped_column(String(160), nullable=False)
    payload_json: Mapped[dict | None] = mapped_column(JSONB)
    status: Mapped[ApprovalStatus] = mapped_column(String(40), nullable=False, default=ApprovalStatus.PENDING)
    workflow_id: Mapped[str | None] = mapped_column(String(160))
    workflow_state_json: Mapped[dict | None] = mapped_column(JSONB)
    approval_reason: Mapped[str | None] = mapped_column(Text)
    execution_status: Mapped[ApprovalExecutionStatus] = mapped_column(
        String(40),
        nullable=False,
        default=ApprovalExecutionStatus.WAITING_FOR_APPROVAL,
    )
    requested_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    rejected_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    resumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    events: Mapped[list["ApprovalEvent"]] = relationship(back_populates="approval_request", cascade="all, delete-orphan")


class ApprovalEvent(BaseModel):
    __tablename__ = "approval_events"
    __table_args__ = (
        Index("ix_approval_events_approval_request_id", "approval_request_id"),
        Index("ix_approval_events_event_type", "event_type"),
    )

    approval_request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("approval_requests.id", ondelete="CASCADE"),
        nullable=False,
    )
    event_type: Mapped[ApprovalEventType] = mapped_column(String(40), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    payload_json: Mapped[dict | None] = mapped_column(JSONB)
    performed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))

    approval_request: Mapped[ApprovalRequest] = relationship(back_populates="events")
