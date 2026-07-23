"""add seats table

Revision ID: 20260722_0027
Revises: 20260722_0026
Create Date: 2026-07-22 00:00:00.000000
"""
from typing import Sequence, Union
import uuid

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "20260722_0027"
down_revision: Union[str, None] = "20260722_0026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "seats",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("label", sa.String(length=20), nullable=False),
        sa.Column("zone", sa.String(length=40), nullable=True),
        sa.Column("row", sa.String(length=10), nullable=True),
        sa.Column("col", sa.Integer(), nullable=True),
        sa.Column("seat_type", sa.String(length=40), nullable=False, server_default="WORKSTATION"),
        sa.Column("status", sa.String(length=40), nullable=False, server_default="AVAILABLE"),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_seats_label", "seats", ["label"])
    op.create_index("ix_seats_tenant_id", "seats", ["tenant_id"])
    op.create_index("ix_seats_deleted_at", "seats", ["deleted_at"])

    seats_table = sa.table(
        "seats",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("label", sa.String),
        sa.column("zone", sa.String),
        sa.column("row", sa.String),
        sa.column("col", sa.Integer),
        sa.column("seat_type", sa.String),
    )

    rows: list[dict] = []
    for row_letter in ("A", "B"):
        for col in range(1, 9):
            rows.append(
                {
                    "id": uuid.uuid4(),
                    "label": f"{row_letter}-{col}",
                    "zone": "A-Zone",
                    "row": row_letter,
                    "col": col,
                    "seat_type": "WORKSTATION",
                }
            )
    for row_letter in ("C", "D", "E"):
        for col in range(1, 9):
            rows.append(
                {
                    "id": uuid.uuid4(),
                    "label": f"{row_letter}-{col}",
                    "zone": "B-Zone",
                    "row": row_letter,
                    "col": col,
                    "seat_type": "WORKSTATION",
                }
            )
    rows.append({"id": uuid.uuid4(), "label": "PANTRY", "zone": None, "row": None, "col": None, "seat_type": "SPECIAL"})
    rows.append({"id": uuid.uuid4(), "label": "MEETING-A", "zone": None, "row": None, "col": None, "seat_type": "MEETING_ROOM"})
    rows.append({"id": uuid.uuid4(), "label": "MEETING-B", "zone": None, "row": None, "col": None, "seat_type": "MEETING_ROOM"})

    op.bulk_insert(seats_table, rows)

    op.execute(
        """
        UPDATE seats
        SET status = 'OCCUPIED', employee_id = e.id
        FROM employees e
        WHERE seats.label = e.seat_label
          AND e.deleted_at IS NULL
          AND e.seat_label IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_index("ix_seats_deleted_at", table_name="seats")
    op.drop_index("ix_seats_tenant_id", table_name="seats")
    op.drop_index("ix_seats_label", table_name="seats")
    op.drop_table("seats")