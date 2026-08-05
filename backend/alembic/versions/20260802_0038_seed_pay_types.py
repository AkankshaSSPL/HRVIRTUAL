"""seed FULL_TIME and CONSULTANT pay types and rules

Revision ID: 20260802_0038
Revises: 20260802_0037
Create Date: 2026-08-02 01:00:00.000000
"""
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260802_0038"
down_revision: Union[str, None] = "20260802_0037"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    full_time_id = uuid.uuid4()
    consultant_id = uuid.uuid4()

    # 1. Insert FULL_TIME and CONSULTANT PayTypes
    op.bulk_insert(
        sa.table(
            "pay_types",
            sa.column("id", sa.UUID),
            sa.column("code", sa.String),
            sa.column("name", sa.String),
            sa.column("pay_basis", sa.String),
            sa.column("proration_basis", sa.String),
            sa.column("base_working_days", sa.Integer),
            sa.column("active", sa.Boolean),
            sa.column("description", sa.String),
        ),
        [
            {
                "id": full_time_id,
                "code": "FULL_TIME",
                "name": "Full Time Employee",
                "pay_basis": "STRUCTURE",
                "proration_basis": "CALENDAR_WORKING_DAYS",
                "base_working_days": None,
                "active": True,
                "description": "Standard full-time salary structure with EPF, PT, and TDS",
            },
            {
                "id": consultant_id,
                "code": "CONSULTANT",
                "name": "Consultant / Retainer",
                "pay_basis": "FLAT_FEE",
                "proration_basis": "FIXED_BASE_DAYS",
                "base_working_days": 22,
                "active": True,
                "description": "Retainer fee with leave proration and flat TDS",
            },
        ],
    )

    # 2. Insert PayTypeRules
    op.bulk_insert(
        sa.table(
            "pay_type_rules",
            sa.column("id", sa.UUID),
            sa.column("pay_type_id", sa.UUID),
            sa.column("sequence", sa.Integer),
            sa.column("code", sa.String),
            sa.column("label", sa.String),
            sa.column("kind", sa.String),
            sa.column("calc_type", sa.String),
            sa.column("value", sa.Numeric),
            sa.column("reference_code", sa.String),
            sa.column("formula", sa.String),
            sa.column("taxable", sa.Boolean),
            sa.column("prorate", sa.Boolean),
        ),
        [
            # --- FULL_TIME RULES ---
            {
                "id": uuid.uuid4(),
                "pay_type_id": full_time_id,
                "sequence": 1,
                "code": "EPF",
                "label": "Employee Provident Fund (EPF)",
                "kind": "DEDUCTION",
                "calc_type": "STATUTORY_EPF",
                "value": None,
                "reference_code": None,
                "formula": None,
                "taxable": False,
                "prorate": False,
            },
            {
                "id": uuid.uuid4(),
                "pay_type_id": full_time_id,
                "sequence": 2,
                "code": "PROFESSIONAL_TAX",
                "label": "Professional Tax (PT)",
                "kind": "DEDUCTION",
                "calc_type": "STATUTORY_PT",
                "value": None,
                "reference_code": "BASIC",
                "formula": None,
                "taxable": False,
                "prorate": False,
            },
            {
                "id": uuid.uuid4(),
                "pay_type_id": full_time_id,
                "sequence": 3,
                "code": "TDS",
                "label": "Tax Deducted at Source (TDS)",
                "kind": "DEDUCTION",
                "calc_type": "STATUTORY_TDS",
                "value": None,
                "reference_code": None,
                "formula": None,
                "taxable": False,
                "prorate": False,
            },
            # --- CONSULTANT RULES ---
            {
                "id": uuid.uuid4(),
                "pay_type_id": consultant_id,
                "sequence": 1,
                "code": "MONTHLY_FEE",
                "label": "Monthly Retainer Fee",
                "kind": "EARNING",
                "calc_type": "FIXED",
                "value": None,
                "reference_code": None,
                "formula": None,
                "taxable": True,
                "prorate": False,
            },
            {
                "id": uuid.uuid4(),
                "pay_type_id": consultant_id,
                "sequence": 2,
                "code": "LEAVE_DEDUCTION",
                "label": "Leave / Unworked Deduction",
                "kind": "DEDUCTION",
                "calc_type": "LEAVE_DEDUCTION",
                "value": None,
                "reference_code": None,
                "formula": None,
                "taxable": False,
                "prorate": False,
            },
            {
                "id": uuid.uuid4(),
                "pay_type_id": consultant_id,
                "sequence": 3,
                "code": "FLAT_TDS",
                "label": "Consultant Flat TDS",
                "kind": "DEDUCTION",
                "calc_type": "FLAT_TDS",
                "value": None,
                "reference_code": None,
                "formula": None,
                "taxable": False,
                "prorate": False,
            },
        ],
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM pay_type_rules WHERE pay_type_id IN (SELECT id FROM pay_types WHERE code IN ('FULL_TIME', 'CONSULTANT'))"
    )
    op.execute(
        "DELETE FROM pay_types WHERE code IN ('FULL_TIME', 'CONSULTANT')"
    )