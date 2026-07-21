"""employee name fields

Revision ID: 20260601_0010
Revises: 20260601_0009
Create Date: 2026-06-01
"""

from alembic import op
import sqlalchemy as sa


revision = "20260601_0010"
down_revision = "20260601_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("employees", sa.Column("first_name", sa.String(length=120), nullable=True))
    op.add_column("employees", sa.Column("last_name", sa.String(length=120), nullable=True))
    op.execute(
        """
        UPDATE employees
        SET
            first_name = NULLIF(split_part(split_part(official_email, '@', 1), '.', 1), ''),
            last_name = NULLIF(split_part(split_part(official_email, '@', 1), '.', 2), '')
        WHERE official_email IS NOT NULL
          AND first_name IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column("employees", "last_name")
    op.drop_column("employees", "first_name")
