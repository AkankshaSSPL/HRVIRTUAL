"""approval engine

Revision ID: 20260528_0004
Revises: 20260528_0003
Create Date: 2026-05-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260528_0004"
down_revision: str | None = "20260528_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def base_columns() -> list[sa.Column]:
    return [
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    ]


def upgrade() -> None:
    op.add_column("approval_requests", sa.Column("workflow_id", sa.String(length=160), nullable=True))
    op.add_column("approval_requests", sa.Column("workflow_state_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("approval_requests", sa.Column("approval_reason", sa.Text(), nullable=True))
    op.add_column(
        "approval_requests",
        sa.Column(
            "execution_status",
            sa.String(length=40),
            server_default="WAITING_FOR_APPROVAL",
            nullable=False,
        ),
    )
    op.add_column("approval_requests", sa.Column("resumed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("approval_requests", sa.Column("executed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_approval_requests_workflow_id", "approval_requests", ["workflow_id"], unique=False)
    op.create_index("ix_approval_requests_execution_status", "approval_requests", ["execution_status"], unique=False)

    op.create_table(
        "approval_events",
        *base_columns(),
        sa.Column("approval_request_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(length=40), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("payload_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("performed_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["approval_request_id"], ["approval_requests.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["performed_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_approval_events_approval_request_id", "approval_events", ["approval_request_id"], unique=False)
    op.create_index("ix_approval_events_event_type", "approval_events", ["event_type"], unique=False)
    op.create_index("ix_approval_events_tenant_id", "approval_events", ["tenant_id"], unique=False)
    op.create_index("ix_approval_events_deleted_at", "approval_events", ["deleted_at"], unique=False)


def downgrade() -> None:
    op.drop_table("approval_events")
    op.drop_index("ix_approval_requests_execution_status", table_name="approval_requests")
    op.drop_index("ix_approval_requests_workflow_id", table_name="approval_requests")
    op.drop_column("approval_requests", "executed_at")
    op.drop_column("approval_requests", "resumed_at")
    op.drop_column("approval_requests", "execution_status")
    op.drop_column("approval_requests", "approval_reason")
    op.drop_column("approval_requests", "workflow_state_json")
    op.drop_column("approval_requests", "workflow_id")

