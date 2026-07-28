"""tag asset_type lookup rows for onboarding kit / branded UI

Revision ID: 20260724_0031
Revises: 20260724_0030
Create Date: 2026-07-24 13:00:00.000000
"""
from typing import Sequence, Union
from alembic import op

revision: str = "20260724_0031"
down_revision: Union[str, None] = "20260724_0030"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Standard onboarding kit: auto-assigned on seat assignment, no HR
    # selection required. All 5 items from the old hardcoded list now exist
    # as real asset_type rows (Laptop from 0028, the other 4 from 0030).
    op.execute("""
        UPDATE lookup_values
        SET metadata_json = COALESCE(metadata_json, '{}'::jsonb)
            || '{"onboarding_kit": "standard"}'::jsonb
        WHERE category = 'asset_type'
          AND code IN ('LAPTOP', 'ACCESSORIES', 'ID_CARD', 'EMAIL_ACCESS', 'SOFTWARE_ACCESS');
    """)

    # Optional onboarding kit: HR opts in per employee from the seating modal.
    op.execute("""
        UPDATE lookup_values
        SET metadata_json = COALESCE(metadata_json, '{}'::jsonb)
            || '{"onboarding_kit": "optional"}'::jsonb
        WHERE category = 'asset_type'
          AND code IN ('MONITOR', 'HEADPHONES', 'PENDRIVE', 'HARD_DISK', 'MOBILE_DEVICE');
    """)

    # Branded: UI should collect a brand/model name for these types.
    op.execute("""
        UPDATE lookup_values
        SET metadata_json = COALESCE(metadata_json, '{}'::jsonb)
            || '{"branded": true}'::jsonb
        WHERE category = 'asset_type' AND code IN ('LAPTOP', 'MONITOR');
    """)

    # Mouse / Keyboard stay untagged: general catalog only, not part of
    # onboarding today.


def downgrade() -> None:
    op.execute("""
        UPDATE lookup_values
        SET metadata_json = (metadata_json - 'onboarding_kit') - 'branded'
        WHERE category = 'asset_type';
    """)