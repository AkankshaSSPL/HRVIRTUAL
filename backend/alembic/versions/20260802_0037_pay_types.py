"""add pay_types and pay_type_rules (dynamic pay-type rule builder)

Revision ID: 20260802_0037
Revises: 20260801_0036
Create Date: 2026-08-02 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260802_0037"
down_revision: Union[str, None] = "20260801_0036"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _base_columns() -> list[sa.Column]:
    """Mirrors app.models.base.BaseModel exactly: id, tenant_id,
    created_at, updated_at, deleted_at."""
    return [
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    ]


def upgrade() -> None:
    # ── pay_types ───────────────────────────────────────────────────────
    op.create_table(
        "pay_types",
        *_base_columns(),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("pay_basis", sa.String(40), nullable=False),
        sa.Column("proration_basis", sa.String(40), nullable=False, server_default="CALENDAR_WORKING_DAYS"),
        sa.Column("base_working_days", sa.Integer(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("description", sa.String(500), nullable=True),
        sa.UniqueConstraint("code", name="uq_pay_types_code"),
    )
    op.create_index("ix_pay_types_tenant_id", "pay_types", ["tenant_id"])
    op.create_index("ix_pay_types_deleted_at", "pay_types", ["deleted_at"])
    op.create_index("ix_pay_types_active", "pay_types", ["active"])
    op.create_index("ix_pay_types_code", "pay_types", ["code"])

    # ── pay_type_rules ──────────────────────────────────────────────────
    op.create_table(
        "pay_type_rules",
        *_base_columns(),
        sa.Column("pay_type_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("calc_type", sa.String(40), nullable=False),
        sa.Column("value", sa.Numeric(14, 2), nullable=True),
        sa.Column("reference_code", sa.String(50), nullable=True),
        sa.Column("formula", sa.String(500), nullable=True),
        sa.Column("taxable", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("prorate", sa.Boolean(), nullable=False, server_default="false"),
        sa.ForeignKeyConstraint(["pay_type_id"], ["pay_types.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("pay_type_id", "code", name="uq_pay_type_rules_pay_type_code"),
    )
    op.create_index("ix_pay_type_rules_tenant_id", "pay_type_rules", ["tenant_id"])
    op.create_index("ix_pay_type_rules_deleted_at", "pay_type_rules", ["deleted_at"])
    op.create_index("ix_pay_type_rules_pay_type_id", "pay_type_rules", ["pay_type_id"])

    # NOTE: seed rows for FULL_TIME / CONSULTANT (the regression-safety net
    # described in the design doc §3.2) are intentionally NOT inserted here.
    # They will be added in a follow-up migration once payroll_computation.py
    # has been reviewed, so the seeded rules reproduce the *actual* current
    # _compute_fulltime()/_compute_consultant() output rather than an assumed
    # one. Until that follow-up migration lands, these tables exist but are
    # empty, and payroll_computation.py should keep using its existing
    # hardcoded branch — do not switch the engine over yet.


def downgrade() -> None:
    op.drop_index("ix_pay_type_rules_pay_type_id", table_name="pay_type_rules")
    op.drop_index("ix_pay_type_rules_deleted_at", table_name="pay_type_rules")
    op.drop_index("ix_pay_type_rules_tenant_id", table_name="pay_type_rules")
    op.drop_table("pay_type_rules")
    op.drop_index("ix_pay_types_code", table_name="pay_types")
    op.drop_index("ix_pay_types_active", table_name="pay_types")
    op.drop_index("ix_pay_types_deleted_at", table_name="pay_types")
    op.drop_index("ix_pay_types_tenant_id", table_name="pay_types")
    op.drop_table("pay_types")