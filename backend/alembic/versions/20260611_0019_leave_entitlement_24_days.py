"""align annual paid leave entitlement to 24 days

Revision ID: 20260611_0019
Revises: 20260605_0018
Create Date: 2026-06-11 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op


revision: str = "20260611_0019"
down_revision: Union[str, None] = "20260605_0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE leave_types
        SET annual_allocation = 12, annual_quota = 12, active = true, updated_at = now()
        WHERE code IN ('CL', 'PL') AND deleted_at IS NULL
        """
    )
    op.execute(
        """
        UPDATE leave_types
        SET annual_allocation = 0, annual_quota = 0, active = false, updated_at = now()
        WHERE code = 'SL' AND deleted_at IS NULL
        """
    )
    op.execute(
        """
        UPDATE leave_balances
        SET allocated = 12,
            opening_balance = 12,
            remaining = GREATEST(0, 12 - COALESCE(used, 0)),
            updated_at = now()
        WHERE leave_type IN ('Casual Leave', 'Paid Leave') AND deleted_at IS NULL
        """
    )
    op.execute(
        """
        UPDATE leave_balances
        SET allocated = 0, opening_balance = 0, remaining = 0, updated_at = now()
        WHERE leave_type = 'Sick Leave' AND deleted_at IS NULL
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE leave_types
        SET annual_allocation = 6, annual_quota = 6, active = true, updated_at = now()
        WHERE code = 'SL' AND deleted_at IS NULL
        """
    )
    op.execute(
        """
        UPDATE leave_balances
        SET allocated = 6,
            opening_balance = 6,
            remaining = GREATEST(0, 6 - COALESCE(used, 0)),
            updated_at = now()
        WHERE leave_type = 'Sick Leave' AND deleted_at IS NULL
        """
    )
