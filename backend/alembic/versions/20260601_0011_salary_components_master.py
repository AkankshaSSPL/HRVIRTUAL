"""salary components master

Revision ID: 20260601_0011
Revises: 20260601_0010
Create Date: 2026-06-01
"""

from alembic import op
import sqlalchemy as sa

revision = "20260601_0011"
down_revision = "20260601_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "salary_components",
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("type", sa.String(length=40), nullable=False),
        sa.Column("calculation_type", sa.String(length=40), nullable=False),
        sa.Column("calculation_value", sa.Numeric(14, 2), nullable=True),
        sa.Column("formula", sa.Text(), nullable=True),
        sa.Column("reference_component_code", sa.String(length=50), nullable=True),
        sa.Column("taxable", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("tenant_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_salary_components_code"),
        sa.UniqueConstraint("name", name="uq_salary_components_name"),
    )
    op.create_index(op.f("ix_salary_components_code"), "salary_components", ["code"], unique=False)
    op.create_index(op.f("ix_salary_components_tenant_id"), "salary_components", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_salary_components_deleted_at"), "salary_components", ["deleted_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_salary_components_deleted_at"), table_name="salary_components")
    op.drop_index(op.f("ix_salary_components_tenant_id"), table_name="salary_components")
    op.drop_index(op.f("ix_salary_components_code"), table_name="salary_components")
    op.drop_table("salary_components")
