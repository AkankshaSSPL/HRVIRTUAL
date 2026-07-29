"""add payroll_configs, company_settings, employee_tds_configs, and
breakdown_json on payroll_run_items

Revision ID: 20260729_0033
Revises: 20260724_0032
Create Date: 2026-07-29 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260729_0033"
down_revision: Union[str, None] = "20260724_0032"
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
    # ── payroll_configs ────────────────────────────────────────────────
    op.create_table(
        "payroll_configs",
        *_base_columns(),
        sa.Column("epf_wage_cap", sa.Integer(), nullable=False, server_default="15000"),
        sa.Column("epf_employee_rate", sa.Numeric(6, 4), nullable=False, server_default="0.1200"),
        sa.Column("epf_employer_rate", sa.Numeric(6, 4), nullable=False, server_default="0.1361"),
        sa.Column("professional_tax_slabs", postgresql.JSONB(), nullable=True),
        sa.Column("consultant_tds_rate", sa.Numeric(6, 4), nullable=False, server_default="0.1000"),
        sa.Column("consultant_base_working_days", sa.Integer(), nullable=False, server_default="20"),
        sa.Column("employee_base_working_days", sa.Integer(), nullable=False, server_default="26"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.create_index("ix_payroll_configs_tenant_id", "payroll_configs", ["tenant_id"])
    op.create_index("ix_payroll_configs_deleted_at", "payroll_configs", ["deleted_at"])
    op.create_index("ix_payroll_configs_active", "payroll_configs", ["active"])

    # ── company_settings ───────────────────────────────────────────────
    op.create_table(
        "company_settings",
        *_base_columns(),
        sa.Column("company_name", sa.String(240), nullable=False),
        sa.Column("company_pan", sa.String(20), nullable=True),
        sa.Column("company_tan", sa.String(20), nullable=True),
        sa.Column("gstin", sa.String(20), nullable=True),
        sa.Column("payroll_bank_account", sa.String(80), nullable=True),
        sa.Column("payroll_bank_name", sa.String(120), nullable=True),
        sa.Column("payroll_bank_ifsc", sa.String(20), nullable=True),
        sa.Column("address_line1", sa.String(240), nullable=True),
        sa.Column("city", sa.String(80), nullable=True),
        sa.Column("state", sa.String(80), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.create_index("ix_company_settings_tenant_id", "company_settings", ["tenant_id"])
    op.create_index("ix_company_settings_deleted_at", "company_settings", ["deleted_at"])
    op.create_index("ix_company_settings_active", "company_settings", ["active"])

    # ── employee_tds_configs ───────────────────────────────────────────
    op.create_table(
        "employee_tds_configs",
        *_base_columns(),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("financial_year", sa.String(10), nullable=False),
        sa.Column("monthly_tds", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("annual_tax_liability", sa.Numeric(14, 2), nullable=True),
        sa.Column("tax_regime", sa.String(10), nullable=True),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("remarks", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "employee_id", "financial_year", "effective_from",
            name="uq_employee_tds_config",
        ),
    )
    op.create_index("ix_employee_tds_configs_tenant_id", "employee_tds_configs", ["tenant_id"])
    op.create_index("ix_employee_tds_configs_deleted_at", "employee_tds_configs", ["deleted_at"])
    op.create_index(
        "ix_employee_tds_configs_employee_fy",
        "employee_tds_configs",
        ["employee_id", "financial_year"],
    )

    # ── breakdown_json on existing payroll_run_items ──────────────────
    op.add_column(
        "payroll_run_items",
        sa.Column("breakdown_json", postgresql.JSONB(), nullable=True),
    )

    # ── seed default PayrollConfig (Maharashtra PT slabs) ─────────────
    op.execute("""
        INSERT INTO payroll_configs (
            id, epf_wage_cap, epf_employee_rate, epf_employer_rate,
            professional_tax_slabs, consultant_tds_rate,
            consultant_base_working_days, employee_base_working_days, active
        ) VALUES (
            gen_random_uuid(), 15000, 0.1200, 0.1361,
            '[
                {"min": 0,     "max": 7499,  "amount": 0},
                {"min": 7500,  "max": 9999,  "amount": 175},
                {"min": 10000, "max": null,  "amount": 200}
            ]'::jsonb,
            0.1000, 20, 26, true
        )
    """)


def downgrade() -> None:
    op.drop_column("payroll_run_items", "breakdown_json")
    op.drop_index("ix_employee_tds_configs_employee_fy", table_name="employee_tds_configs")
    op.drop_index("ix_employee_tds_configs_deleted_at", table_name="employee_tds_configs")
    op.drop_index("ix_employee_tds_configs_tenant_id", table_name="employee_tds_configs")
    op.drop_table("employee_tds_configs")
    op.drop_index("ix_company_settings_active", table_name="company_settings")
    op.drop_index("ix_company_settings_deleted_at", table_name="company_settings")
    op.drop_index("ix_company_settings_tenant_id", table_name="company_settings")
    op.drop_table("company_settings")
    op.drop_index("ix_payroll_configs_active", table_name="payroll_configs")
    op.drop_index("ix_payroll_configs_deleted_at", table_name="payroll_configs")
    op.drop_index("ix_payroll_configs_tenant_id", table_name="payroll_configs")
    op.drop_table("payroll_configs")