"""add_employee_face_columns

Revision ID: 20260821_0039
Revises: a7ee3a56d3f3
Create Date: 2026-08-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20260821_0039'
down_revision: Union[str, None] = 'a7ee3a56d3f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'employees',
        sa.Column('face_embedding', sa.LargeBinary(), nullable=True),
    )
    op.add_column(
        'employees',
        sa.Column(
            'face_registered',
            sa.Boolean(),
            nullable=False,
            server_default=sa.text('false'),
        ),
    )
    op.add_column(
        'employees',
        sa.Column(
            'face_samples_count',
            sa.Integer(),
            nullable=False,
            server_default=sa.text('0'),
        ),
    )


def downgrade() -> None:
    op.drop_column('employees', 'face_samples_count')
    op.drop_column('employees', 'face_registered')
    op.drop_column('employees', 'face_embedding')