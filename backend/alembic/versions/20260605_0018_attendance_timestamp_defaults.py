"""attendance timestamp defaults

Revision ID: 20260605_0018
Revises: 20260605_0017
Create Date: 2026-06-05 13:35:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "20260605_0018"
down_revision: Union[str, None] = "20260605_0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE attendance_records SET created_at = now() WHERE created_at IS NULL")
    op.execute("UPDATE attendance_records SET updated_at = now() WHERE updated_at IS NULL")
    op.alter_column("attendance_records", "created_at", server_default=sa.text("now()"), existing_type=sa.DateTime(timezone=True), nullable=False)
    op.alter_column("attendance_records", "updated_at", server_default=sa.text("now()"), existing_type=sa.DateTime(timezone=True), nullable=False)


def downgrade() -> None:
    op.alter_column("attendance_records", "updated_at", server_default=None, existing_type=sa.DateTime(timezone=True), nullable=False)
    op.alter_column("attendance_records", "created_at", server_default=None, existing_type=sa.DateTime(timezone=True), nullable=False)
