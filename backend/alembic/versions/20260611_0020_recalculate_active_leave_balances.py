"""recalculate active leave balances from approved requests

Revision ID: 20260611_0020
Revises: 20260611_0019
Create Date: 2026-06-11 19:00:00.000000
"""

from typing import Sequence, Union

from alembic import op


revision: str = "20260611_0020"
down_revision: Union[str, None] = "20260611_0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE leave_balances
        SET used = 0, remaining = allocated, updated_at = now()
        WHERE leave_type IN ('Paid Leave', 'Casual Leave') AND deleted_at IS NULL
        """
    )
    op.execute(
        """
        UPDATE leave_balances AS balance
        SET used = approved.used_days,
            remaining = GREATEST(0, balance.allocated - approved.used_days),
            updated_at = now()
        FROM (
            SELECT employee_id,
                   EXTRACT(YEAR FROM start_date)::integer AS leave_year,
                   SUM(total_days) AS used_days
            FROM leave_requests
            WHERE status = 'APPROVED'
              AND deleted_at IS NULL
              AND leave_type IN ('Paid Leave', 'Sick Leave', 'Earned Leave')
            GROUP BY employee_id, EXTRACT(YEAR FROM start_date)::integer
        ) AS approved
        WHERE balance.employee_id = approved.employee_id
          AND balance.year = approved.leave_year
          AND balance.leave_type = 'Paid Leave'
          AND balance.deleted_at IS NULL
        """
    )
    op.execute(
        """
        UPDATE leave_balances AS balance
        SET used = approved.used_days,
            remaining = GREATEST(0, balance.allocated - approved.used_days),
            updated_at = now()
        FROM (
            SELECT employee_id,
                   EXTRACT(YEAR FROM start_date)::integer AS leave_year,
                   SUM(total_days) AS used_days
            FROM leave_requests
            WHERE status = 'APPROVED'
              AND deleted_at IS NULL
              AND leave_type = 'Casual Leave'
            GROUP BY employee_id, EXTRACT(YEAR FROM start_date)::integer
        ) AS approved
        WHERE balance.employee_id = approved.employee_id
          AND balance.year = approved.leave_year
          AND balance.leave_type = 'Casual Leave'
          AND balance.deleted_at IS NULL
        """
    )
    op.execute(
        """
        UPDATE leave_balances
        SET used = 0, remaining = 0, updated_at = now()
        WHERE leave_type = 'Sick Leave' AND deleted_at IS NULL
        """
    )


def downgrade() -> None:
    pass
