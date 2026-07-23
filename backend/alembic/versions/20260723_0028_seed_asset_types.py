"""seed asset type lookup values

Revision ID: 20260723_0028
Revises: 20260722_0027
Create Date: 2026-07-23 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op

revision: str = "20260723_0028"
down_revision: Union[str, None] = "20260722_0027"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO lookup_values (id, category, code, label, sort_order, active, created_at, updated_at)
        VALUES
          (gen_random_uuid(), 'asset_type', 'LAPTOP',        'Laptop',        1, true, now(), now()),
          (gen_random_uuid(), 'asset_type', 'MONITOR',       'Monitor',       2, true, now(), now()),
          (gen_random_uuid(), 'asset_type', 'MOUSE',         'Mouse',         3, true, now(), now()),
          (gen_random_uuid(), 'asset_type', 'KEYBOARD',      'Keyboard',      4, true, now(), now()),
          (gen_random_uuid(), 'asset_type', 'HEADPHONES',    'Headphones',    5, true, now(), now()),
          (gen_random_uuid(), 'asset_type', 'PENDRIVE',      'Pendrive',      6, true, now(), now()),
          (gen_random_uuid(), 'asset_type', 'HARD_DISK',     'Hard Disk',     7, true, now(), now()),
          (gen_random_uuid(), 'asset_type', 'MOBILE_DEVICE', 'Mobile Device', 8, true, now(), now())
        ON CONFLICT DO NOTHING;
    """)


def downgrade() -> None:
    op.execute("DELETE FROM lookup_values WHERE category = 'asset_type';")
