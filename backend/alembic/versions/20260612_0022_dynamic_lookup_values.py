"""add dynamic lookup values

Revision ID: 20260612_0022
Revises: 20260612_0021
Create Date: 2026-06-12 18:00:00.000000
"""

from typing import Sequence, Union
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "20260612_0022"
down_revision: Union[str, None] = "20260612_0021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


LOOKUPS = {
    "employment_type": [("FULL_TIME", "Full Time"), ("CONSULTANT", "Consultant")],
    "employment_status": [("ACTIVE", "Active"), ("PROBATION", "Probation"), ("NOTICE_PERIOD", "Notice Period"), ("SUSPENDED", "Suspended"), ("EXITED", "Exited")],
    "gender": [("FEMALE", "Female"), ("MALE", "Male"), ("OTHER", "Other"), ("UNDISCLOSED", "Undisclosed")],
    "document_type": [("PAN_CARD", "PAN Card"), ("AADHAAR_CARD", "Aadhaar Card"), ("BANK_PROOF", "Bank Proof"), ("OFFER_LETTER", "Offer Letter"), ("EDUCATION_CERTIFICATE", "Education Certificate"), ("EXPERIENCE_LETTER", "Experience Letter"), ("OTHER", "Other")],
    "document_status": [("PENDING", "Pending"), ("VERIFIED", "Verified"), ("REJECTED", "Rejected")],
    "attendance_status": [("PRESENT", "Present"), ("ABSENT", "Absent"), ("HALF_DAY", "Half Day"), ("PAID_LEAVE", "Paid Leave"), ("UNPAID_LEAVE", "Unpaid Leave"), ("WORK_FROM_HOME", "Work From Home"), ("HOLIDAY", "Holiday"), ("WEEKEND", "Weekend"), ("MISSING", "Missing")],
    "salary_component_type": [("earning", "Earning"), ("deduction", "Deduction")],
    "salary_calculation_type": [("fixed", "Fixed amount"), ("percentage", "Percentage"), ("formula", "Formula")],
}


def upgrade() -> None:
    table = op.create_table(
        "lookup_values",
        sa.Column("category", sa.String(length=120), nullable=False),
        sa.Column("code", sa.String(length=120), nullable=False),
        sa.Column("label", sa.String(length=180), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("category", "code", name="uq_lookup_values_category_code"),
    )
    op.create_index("ix_lookup_values_category_active_order", "lookup_values", ["category", "active", "sort_order"])
    op.create_index("ix_lookup_values_tenant_id", "lookup_values", ["tenant_id"])
    op.create_index("ix_lookup_values_deleted_at", "lookup_values", ["deleted_at"])
    rows = []
    for category, items in LOOKUPS.items():
        for index, (code, label) in enumerate(items, start=1):
            rows.append({"id": uuid.uuid4(), "category": category, "code": code, "label": label, "sort_order": index, "active": True})
    op.bulk_insert(table, rows)


def downgrade() -> None:
    op.drop_table("lookup_values")
