"""conversation sessions

Revision ID: 20260729_0033
Revises: 20260724_0032
Create Date: 2026-07-29
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260729_0033"
down_revision = "20260724_0032"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "conversation_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("active_agent", sa.String(120), nullable=True),
        sa.Column("active_entity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("active_entity_type", sa.String(120), nullable=True),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_conv_session_user_active",
        "conversation_sessions",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index("ix_conv_sessions_expires", "conversation_sessions", ["expires_at"])

    op.create_table(
        "conversation_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("agent_name", sa.String(120), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(), nullable=True),
        sa.ForeignKeyConstraint(["session_id"], ["conversation_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_conv_messages_session_created",
        "conversation_messages",
        ["session_id", "created_at"],
    )


def downgrade():
    op.drop_index("ix_conv_messages_session_created", table_name="conversation_messages")
    op.drop_table("conversation_messages")
    op.drop_index("ix_conv_sessions_expires", table_name="conversation_sessions")
    op.drop_index("uq_conv_session_user_active", table_name="conversation_sessions")
    op.drop_table("conversation_sessions")