"""hard-delete stray legacy onboarding asset rows (old REQ- code pattern)

Revision ID: 20260724_0032
Revises: 20260724_0031
Create Date: 2026-07-24 14:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260724_0032"
down_revision: Union[str, None] = "20260724_0031"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # These rows predate the current asset_code generator
    # (_next_asset_code produces "TYPE-YEAR-EMPCODE-SUFFIX"), so any row
    # coded "REQ-*" was created by an older/different path before the
    # hardcoded standard-kit fix -- not a real HR-driven assignment.
    # Hard delete, not soft delete: this data is mock/wrong and shouldn't
    # be kept around in any form.
    op.execute(sa.text("""
        DELETE FROM employee_assets
        WHERE asset_code LIKE 'REQ-%'
    """))


def downgrade() -> None:
    # Irreversible -- the rows are actually gone, not soft-deleted, so
    # there is nothing to restore here.
    pass