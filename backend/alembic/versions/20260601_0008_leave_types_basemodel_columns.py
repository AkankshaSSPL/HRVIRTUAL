"""leave types basemodel columns

Revision ID: 20260601_0008
Revises: 20260529_0007
Create Date: 2026-06-01
"""

from alembic import op


revision = "20260601_0008"
down_revision = "20260529_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS tenant_id UUID")
    op.execute("CREATE INDEX IF NOT EXISTS ix_leave_types_tenant_id ON leave_types (tenant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_leave_types_deleted_at ON leave_types (deleted_at)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_leave_types_tenant_id")
    op.execute("DROP INDEX IF EXISTS ix_leave_types_deleted_at")
    op.execute("ALTER TABLE leave_types DROP COLUMN IF EXISTS tenant_id")
