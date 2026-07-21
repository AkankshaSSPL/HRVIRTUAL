"""add department active status

Revision ID: 20260612_0024
Revises: 20260612_0023
Create Date: 2026-06-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260612_0024"
down_revision: str | None = "20260612_0023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("departments", sa.Column("active", sa.Boolean(), server_default=sa.true(), nullable=False))
    op.create_index(op.f("ix_departments_active"), "departments", ["active"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_departments_active"), table_name="departments")
    op.drop_column("departments", "active")
