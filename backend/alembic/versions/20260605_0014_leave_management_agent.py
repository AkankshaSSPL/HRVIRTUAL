"""leave management agent

Revision ID: 20260605_0014
Revises: 20260602_0013
Create Date: 2026-06-05 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "20260605_0014"
down_revision: Union[str, None] = "20260602_0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("leave_types", sa.Column("category", sa.String(length=40), nullable=False, server_default="PAID"))
    op.add_column("leave_types", sa.Column("annual_allocation", sa.Numeric(8, 2), nullable=False, server_default="0"))
    op.add_column("leave_types", sa.Column("carry_forward_allowed", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("leave_types", sa.Column("requires_approval", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("leave_types", sa.Column("affects_payroll", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("leave_types", sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.execute("UPDATE leave_types SET annual_allocation = annual_quota, category = CASE WHEN is_paid THEN 'PAID' ELSE 'UNPAID' END")

    op.add_column("leave_requests", sa.Column("leave_type_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("leave_requests", sa.Column("from_date", sa.Date(), nullable=True))
    op.add_column("leave_requests", sa.Column("to_date", sa.Date(), nullable=True))
    op.create_foreign_key("fk_leave_requests_leave_type_id", "leave_requests", "leave_types", ["leave_type_id"], ["id"])
    op.create_index("ix_leave_requests_type_status", "leave_requests", ["leave_type_id", "status"])
    op.execute("UPDATE leave_requests SET from_date = start_date, to_date = end_date")

    op.add_column("leave_balances", sa.Column("leave_type_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("leave_balances", sa.Column("allocated", sa.Numeric(8, 2), nullable=False, server_default="0"))
    op.create_foreign_key("fk_leave_balances_leave_type_id", "leave_balances", "leave_types", ["leave_type_id"], ["id"])
    op.create_unique_constraint("uq_leave_balances_employee_type_id_year", "leave_balances", ["employee_id", "leave_type_id", "year"])
    op.execute("UPDATE leave_balances SET allocated = opening_balance")

    op.create_table(
        "leave_approvals",
        sa.Column("leave_request_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("approver_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("comments", sa.Text(), nullable=True),
        sa.Column("action_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["approver_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["leave_request_id"], ["leave_requests.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_leave_approvals_approver", "leave_approvals", ["approver_id"])
    op.create_index("ix_leave_approvals_deleted_at", "leave_approvals", ["deleted_at"])
    op.create_index("ix_leave_approvals_request_status", "leave_approvals", ["leave_request_id", "status"])
    op.create_index("ix_leave_approvals_tenant_id", "leave_approvals", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_leave_approvals_request_status", table_name="leave_approvals")
    op.drop_index("ix_leave_approvals_deleted_at", table_name="leave_approvals")
    op.drop_index("ix_leave_approvals_tenant_id", table_name="leave_approvals")
    op.drop_index("ix_leave_approvals_approver", table_name="leave_approvals")
    op.drop_table("leave_approvals")

    op.drop_constraint("uq_leave_balances_employee_type_id_year", "leave_balances", type_="unique")
    op.drop_constraint("fk_leave_balances_leave_type_id", "leave_balances", type_="foreignkey")
    op.drop_column("leave_balances", "allocated")
    op.drop_column("leave_balances", "leave_type_id")

    op.drop_index("ix_leave_requests_type_status", table_name="leave_requests")
    op.drop_constraint("fk_leave_requests_leave_type_id", "leave_requests", type_="foreignkey")
    op.drop_column("leave_requests", "to_date")
    op.drop_column("leave_requests", "from_date")
    op.drop_column("leave_requests", "leave_type_id")

    op.drop_column("leave_types", "active")
    op.drop_column("leave_types", "affects_payroll")
    op.drop_column("leave_types", "requires_approval")
    op.drop_column("leave_types", "carry_forward_allowed")
    op.drop_column("leave_types", "annual_allocation")
    op.drop_column("leave_types", "category")
