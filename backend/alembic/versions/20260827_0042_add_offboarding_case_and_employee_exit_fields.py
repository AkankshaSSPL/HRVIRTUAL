"""add offboarding_cases table and employee exit fields

Revision ID: 20260827_0042
Revises: 20260827_0041
Create Date: 2026-08-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260827_0042"
down_revision = "20260827_0041"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("employees", sa.Column("exit_date", sa.Date(), nullable=True))
    op.add_column(
        "employees", sa.Column("exit_type", sa.String(length=40), nullable=True)
    )
    op.add_column("employees", sa.Column("exit_reason", sa.Text(), nullable=True))
    op.add_column(
        "employees",
        sa.Column(
            "offboarding_initiated_at", sa.DateTime(timezone=True), nullable=True
        ),
    )
    op.add_column(
        "employees",
        sa.Column(
            "offboarding_completed_at", sa.DateTime(timezone=True), nullable=True
        ),
    )

    op.create_table(
        "offboarding_cases",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "employee_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("employees.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "status", sa.String(length=30), nullable=False, server_default="IN_PROGRESS"
        ),
        sa.Column(
            "initiated_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "knowledge_transfer_done",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column(
            "exit_interview_done",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column(
            "final_settlement_done",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column(
            "id_card_returned",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_offboarding_cases_employee_id", "offboarding_cases", ["employee_id"]
    )


def downgrade() -> None:
    op.drop_index(
        "ix_offboarding_cases_employee_id", table_name="offboarding_cases"
    )
    op.drop_table("offboarding_cases")
    op.drop_column("employees", "offboarding_completed_at")
    op.drop_column("employees", "offboarding_initiated_at")
    op.drop_column("employees", "exit_reason")
    op.drop_column("employees", "exit_type")
    op.drop_column("employees", "exit_date")