"""add employee employment type

Revision ID: 20260612_0021
Revises: 20260611_0020
Create Date: 2026-06-12 12:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "20260612_0021"
down_revision: Union[str, None] = "20260611_0020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "employees",
        sa.Column("employment_type", sa.String(length=40), nullable=False, server_default="FULL_TIME"),
    )
    op.create_index("ix_employees_employment_type", "employees", ["employment_type"])


def downgrade() -> None:
    op.drop_index("ix_employees_employment_type", table_name="employees")
    op.drop_column("employees", "employment_type")
