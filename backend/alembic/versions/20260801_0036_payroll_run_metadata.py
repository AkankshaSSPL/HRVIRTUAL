"""payroll run metadata column

Revision ID: 20260801_0036
Revises: 20260731_0035
Create Date: 2026-08-01 00:36:00.000000
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260801_0036"
down_revision = "20260731_0035"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "payroll_runs",
        sa.Column("metadata_json", postgresql.JSONB(), nullable=True),
    )


def downgrade():
    op.drop_column("payroll_runs", "metadata_json")