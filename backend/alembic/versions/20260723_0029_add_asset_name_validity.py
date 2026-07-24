"""add asset_name and validity_date columns to employee_assets

Revision ID: 20260723_0029
Revises: 20260723_0028
Create Date: 2026-07-24 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260723_0029"
down_revision: Union[str, None] = "20260723_0028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("employee_assets", sa.Column("asset_name", sa.String(120), nullable=True))
    op.add_column("employee_assets", sa.Column("validity_date", sa.Date(), nullable=True))
    # Backfill asset_name for existing rows from the metadata_json fallback
    # the endpoint has been using until now, so history isn't lost.
    op.execute("""
        UPDATE employee_assets
        SET asset_name = metadata_json ->> 'asset_name'
        WHERE asset_name IS NULL
          AND metadata_json ->> 'asset_name' IS NOT NULL;
    """)


def downgrade() -> None:
    op.drop_column("employee_assets", "validity_date")
    op.drop_column("employee_assets", "asset_name")