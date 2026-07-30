"""add emergency_code, bank_branch, address, zip_code, and city to employees

Revision ID: 20260730_0034
Revises: 20260729_0033
Create Date: 2026-07-30 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260730_0034"
down_revision: Union[str, None] = "20260729_0033"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("employees", sa.Column("emergency_code", sa.String(60), nullable=True))
    op.add_column("employees", sa.Column("bank_branch", sa.String(160), nullable=True))
    op.add_column("employees", sa.Column("address", sa.Text(), nullable=True))
    op.add_column("employees", sa.Column("zip_code", sa.String(20), nullable=True))
    op.add_column("employees", sa.Column("city", sa.String(120), nullable=True))


def downgrade() -> None:
    op.drop_column("employees", "city")
    op.drop_column("employees", "zip_code")
    op.drop_column("employees", "address")
    op.drop_column("employees", "bank_branch")
    op.drop_column("employees", "emergency_code")
