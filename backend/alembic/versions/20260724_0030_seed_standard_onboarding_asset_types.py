"""seed standard onboarding asset types (accessories, id card, email/software access)

Revision ID: 20260724_0030
Revises: 20260723_0029
Create Date: 2026-07-24 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = "20260724_0030"
down_revision: Union[str, None] = "20260723_0029"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO lookup_values (id, category, code, label, sort_order, active, created_at, updated_at)
        VALUES
          (gen_random_uuid(), 'asset_type', 'ACCESSORIES',     'Accessories',     9,  true, now(), now()),
          (gen_random_uuid(), 'asset_type', 'ID_CARD',         'ID Card',         10, true, now(), now()),
          (gen_random_uuid(), 'asset_type', 'EMAIL_ACCESS',    'Email Access',    11, true, now(), now()),
          (gen_random_uuid(), 'asset_type', 'SOFTWARE_ACCESS', 'Software Access', 12, true, now(), now())
        ON CONFLICT DO NOTHING;
    """)


def downgrade() -> None:
    op.execute("""
        DELETE FROM lookup_values
        WHERE category = 'asset_type'
          AND code IN ('ACCESSORIES', 'ID_CARD', 'EMAIL_ACCESS', 'SOFTWARE_ACCESS');
    """)