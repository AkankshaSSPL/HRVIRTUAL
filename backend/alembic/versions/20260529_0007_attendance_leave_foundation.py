"""attendance leave foundation

Revision ID: 20260529_0007
Revises: 20260528_0006
Create Date: 2026-05-29
"""

from alembic import op
import sqlalchemy as sa
from datetime import datetime, timezone
from uuid import UUID


revision = "20260529_0007"
down_revision = "20260528_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    now = datetime.now(timezone.utc)
    op.add_column("attendance_records", sa.Column("check_in_time", sa.Time(), nullable=True))
    op.add_column("attendance_records", sa.Column("check_out_time", sa.Time(), nullable=True))
    op.add_column("attendance_records", sa.Column("total_hours", sa.Numeric(6, 2), nullable=True))
    op.add_column("attendance_records", sa.Column("remarks", sa.Text(), nullable=True))

    op.create_table(
        "leave_types",
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("is_paid", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("annual_quota", sa.Numeric(8, 2), nullable=False, server_default="0"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("tenant_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_leave_types_name"),
    )
    op.create_index(op.f("ix_leave_types_code"), "leave_types", ["code"], unique=False)
    op.create_index(op.f("ix_leave_types_tenant_id"), "leave_types", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_leave_types_deleted_at"), "leave_types", ["deleted_at"], unique=False)
    op.bulk_insert(
        sa.table(
            "leave_types",
            sa.column("id", sa.UUID()),
            sa.column("name", sa.String()),
            sa.column("code", sa.String()),
            sa.column("is_paid", sa.Boolean()),
            sa.column("annual_quota", sa.Numeric()),
            sa.column("created_at", sa.DateTime(timezone=True)),
            sa.column("updated_at", sa.DateTime(timezone=True)),
        ),
        [
            {"id": UUID("00000000-0000-0000-0000-000000000101"), "name": "Casual Leave", "code": "CL", "is_paid": True, "annual_quota": 12, "created_at": now, "updated_at": now},
            {"id": UUID("00000000-0000-0000-0000-000000000102"), "name": "Sick Leave", "code": "SL", "is_paid": True, "annual_quota": 12, "created_at": now, "updated_at": now},
            {"id": UUID("00000000-0000-0000-0000-000000000103"), "name": "Earned Leave", "code": "EL", "is_paid": True, "annual_quota": 18, "created_at": now, "updated_at": now},
            {"id": UUID("00000000-0000-0000-0000-000000000104"), "name": "Unpaid Leave", "code": "UL", "is_paid": False, "annual_quota": 0, "created_at": now, "updated_at": now},
        ],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_leave_types_code"), table_name="leave_types")
    op.drop_table("leave_types")
    op.drop_column("attendance_records", "remarks")
    op.drop_column("attendance_records", "total_hours")
    op.drop_column("attendance_records", "check_out_time")
    op.drop_column("attendance_records", "check_in_time")
