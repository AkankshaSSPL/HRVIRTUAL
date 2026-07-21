"""employee nullable identifiers

Revision ID: 20260601_0009
Revises: 20260601_0008
Create Date: 2026-06-01
"""

from alembic import op
import sqlalchemy as sa


revision = "20260601_0009"
down_revision = "20260601_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("employees", "employee_code", existing_type=sa.String(length=80), nullable=True)
    op.alter_column("employees", "official_email", existing_type=sa.String(length=320), nullable=True)


def downgrade() -> None:
    op.alter_column("employees", "official_email", existing_type=sa.String(length=320), nullable=False)
    op.alter_column("employees", "employee_code", existing_type=sa.String(length=80), nullable=False)
