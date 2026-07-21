"""expand master lookup catalog

Revision ID: 20260612_0023
Revises: 20260612_0022
Create Date: 2026-06-12 19:00:00.000000
"""

from typing import Sequence, Union
import uuid

from alembic import op


revision: str = "20260612_0023"
down_revision: Union[str, None] = "20260612_0022"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


LOOKUPS = {
    "leave_category": [("PAID", "Paid"), ("UNPAID", "Unpaid"), ("WFH", "Work From Home")],
    "leave_request_status": [("PENDING", "Pending"), ("APPROVED", "Approved"), ("REJECTED", "Rejected"), ("CANCELLED", "Cancelled")],
    "candidate_status": [("NEW", "New"), ("SCREENING", "Screening"), ("INTERVIEW", "Interview"), ("OFFERED", "Offered"), ("HIRED", "Hired"), ("REJECTED", "Rejected"), ("ARCHIVED", "Archived")],
    "asset_status": [("ASSIGNED", "Assigned"), ("RETURN_PENDING", "Return Pending"), ("RETURNED", "Returned"), ("LOST", "Lost")],
    "approval_status": [("PENDING", "Pending"), ("APPROVED", "Approved"), ("REJECTED", "Rejected"), ("NEEDS_CHANGES", "Needs Changes"), ("EXECUTED", "Executed"), ("FAILED", "Failed")],
    "payroll_run_status": [("DRAFT", "Draft"), ("PENDING_APPROVAL", "Pending Approval"), ("APPROVED", "Approved"), ("BANK_SHEET_GENERATED", "Bank Sheet Generated"), ("COMPLETED", "Completed")],
    "salary_assignment_status": [("DRAFT", "Draft"), ("PENDING_APPROVAL", "Pending Approval"), ("ACTIVE", "Active"), ("SUPERSEDED", "Superseded"), ("REJECTED", "Rejected")],
}


def upgrade() -> None:
    table = __import__("sqlalchemy").table(
        "lookup_values",
        __import__("sqlalchemy").column("id"),
        __import__("sqlalchemy").column("category"),
        __import__("sqlalchemy").column("code"),
        __import__("sqlalchemy").column("label"),
        __import__("sqlalchemy").column("sort_order"),
        __import__("sqlalchemy").column("active"),
    )
    rows = []
    for category, items in LOOKUPS.items():
        for index, (code, label) in enumerate(items, start=1):
            rows.append({"id": uuid.uuid4(), "category": category, "code": code, "label": label, "sort_order": index, "active": True})
    op.bulk_insert(table, rows)


def downgrade() -> None:
    categories = "', '".join(LOOKUPS)
    op.execute(f"DELETE FROM lookup_values WHERE category IN ('{categories}')")
