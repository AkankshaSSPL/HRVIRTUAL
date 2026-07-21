"""salary assignment foundation

Revision ID: 20260602_0013
Revises: 20260601_0012
Create Date: 2026-06-02
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260602_0013"
down_revision = "20260601_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "employee_salary_assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("salary_structure_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("gross_salary", sa.Numeric(14, 2), nullable=False),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=40), nullable=False, server_default="PENDING_APPROVAL"),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["salary_structure_id"], ["salary_structures.id"]),
        sa.ForeignKeyConstraint(["approved_by"], ["users.id"]),
    )
    op.create_index("ix_employee_salary_assignments_employee_status", "employee_salary_assignments", ["employee_id", "status"])
    op.create_index("ix_employee_salary_assignments_structure_id", "employee_salary_assignments", ["salary_structure_id"])
    op.create_index("ix_employee_salary_assignments_effective", "employee_salary_assignments", ["effective_from", "effective_to"])
    op.create_index(op.f("ix_employee_salary_assignments_tenant_id"), "employee_salary_assignments", ["tenant_id"])

    op.create_table(
        "salary_revision_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("old_salary", sa.Numeric(14, 2), nullable=True),
        sa.Column("new_salary", sa.Numeric(14, 2), nullable=False),
        sa.Column("revision_type", sa.String(length=40), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["approved_by"], ["users.id"]),
    )
    op.create_index("ix_salary_revision_history_employee_id", "salary_revision_history", ["employee_id"])
    op.create_index("ix_salary_revision_history_effective_from", "salary_revision_history", ["effective_from"])
    op.create_index(op.f("ix_salary_revision_history_tenant_id"), "salary_revision_history", ["tenant_id"])

    op.create_table(
        "salary_assignment_approvals",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("assignment_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False, server_default="PENDING"),
        sa.Column("approver_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("comments", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["assignment_id"], ["employee_salary_assignments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["approver_id"], ["users.id"]),
    )
    op.create_index("ix_salary_assignment_approvals_assignment_status", "salary_assignment_approvals", ["assignment_id", "status"])
    op.create_index(op.f("ix_salary_assignment_approvals_tenant_id"), "salary_assignment_approvals", ["tenant_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_salary_assignment_approvals_tenant_id"), table_name="salary_assignment_approvals")
    op.drop_index("ix_salary_assignment_approvals_assignment_status", table_name="salary_assignment_approvals")
    op.drop_table("salary_assignment_approvals")

    op.drop_index(op.f("ix_salary_revision_history_tenant_id"), table_name="salary_revision_history")
    op.drop_index("ix_salary_revision_history_effective_from", table_name="salary_revision_history")
    op.drop_index("ix_salary_revision_history_employee_id", table_name="salary_revision_history")
    op.drop_table("salary_revision_history")

    op.drop_index(op.f("ix_employee_salary_assignments_tenant_id"), table_name="employee_salary_assignments")
    op.drop_index("ix_employee_salary_assignments_effective", table_name="employee_salary_assignments")
    op.drop_index("ix_employee_salary_assignments_structure_id", table_name="employee_salary_assignments")
    op.drop_index("ix_employee_salary_assignments_employee_status", table_name="employee_salary_assignments")
    op.drop_table("employee_salary_assignments")
