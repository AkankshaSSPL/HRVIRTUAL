"""salary schema alignment

Revision ID: 20260605_0016
Revises: 20260605_0015
Create Date: 2026-06-05 00:20:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "20260605_0016"
down_revision: Union[str, None] = "20260605_0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE INDEX IF NOT EXISTS ix_employee_salary_assignments_deleted_at ON employee_salary_assignments (deleted_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_salary_assignment_approvals_deleted_at ON salary_assignment_approvals (deleted_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_salary_revision_history_deleted_at ON salary_revision_history (deleted_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_salary_structure_items_deleted_at ON salary_structure_items (deleted_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_salary_structure_items_tenant_id ON salary_structure_items (tenant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_salary_structures_code ON salary_structures (code)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_salary_structures_tenant_id ON salary_structures (tenant_id)")
    op.alter_column("salary_components", "formula", type_=sa.String(length=500), existing_nullable=True)
    op.alter_column("salary_structure_items", "created_at", nullable=False, existing_type=sa.DateTime(timezone=True))
    op.alter_column("salary_structure_items", "updated_at", nullable=False, existing_type=sa.DateTime(timezone=True))
    op.alter_column("salary_structures", "created_at", nullable=False, existing_type=sa.DateTime(timezone=True))
    op.alter_column("salary_structures", "updated_at", nullable=False, existing_type=sa.DateTime(timezone=True))


def downgrade() -> None:
    op.alter_column("salary_structures", "updated_at", nullable=True, existing_type=sa.DateTime(timezone=True))
    op.alter_column("salary_structures", "created_at", nullable=True, existing_type=sa.DateTime(timezone=True))
    op.alter_column("salary_structure_items", "updated_at", nullable=True, existing_type=sa.DateTime(timezone=True))
    op.alter_column("salary_structure_items", "created_at", nullable=True, existing_type=sa.DateTime(timezone=True))
    op.alter_column("salary_components", "formula", type_=sa.Text(), existing_nullable=True)
    op.execute("DROP INDEX IF EXISTS ix_salary_structures_tenant_id")
    op.execute("DROP INDEX IF EXISTS ix_salary_structures_code")
    op.execute("DROP INDEX IF EXISTS ix_salary_structure_items_tenant_id")
    op.execute("DROP INDEX IF EXISTS ix_salary_structure_items_deleted_at")
    op.execute("DROP INDEX IF EXISTS ix_salary_revision_history_deleted_at")
    op.execute("DROP INDEX IF EXISTS ix_salary_assignment_approvals_deleted_at")
    op.execute("DROP INDEX IF EXISTS ix_employee_salary_assignments_deleted_at")
