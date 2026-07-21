"""leave approvals basemodel indexes

Revision ID: 20260605_0015
Revises: 20260605_0014
Create Date: 2026-06-05 00:10:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "20260605_0015"
down_revision: Union[str, None] = "20260605_0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("leave_approvals", sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index("ix_leave_approvals_deleted_at", "leave_approvals", ["deleted_at"])
    op.create_index("ix_leave_approvals_tenant_id", "leave_approvals", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_leave_approvals_tenant_id", table_name="leave_approvals")
    op.drop_index("ix_leave_approvals_deleted_at", table_name="leave_approvals")
    op.drop_column("leave_approvals", "tenant_id")
