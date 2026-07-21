"""create salary_structures and salary_structure_items

Revision ID: 20260601_0011
Revises: 20260601_0010_employee_name_fields
Create Date: 2026-06-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20260601_0012'
down_revision = '20260601_0011'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'salary_structures',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('code', sa.String(length=50), nullable=False),
        sa.Column('description', sa.String(length=500), nullable=True),
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_salary_structures_deleted_at', 'salary_structures', ['deleted_at'])
    op.create_unique_constraint('uq_salary_structures_code', 'salary_structures', ['code'])

    op.create_table(
        'salary_structure_items',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('structure_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('component_code', sa.String(length=50), nullable=False),
        sa.Column('calculation_type', sa.String(length=40), nullable=False),
        sa.Column('calculation_value', sa.Numeric(14, 2), nullable=True),
        sa.Column('formula', sa.String(length=500), nullable=True),
        sa.Column('reference_component_code', sa.String(length=50), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_salary_structure_items_structure_id', 'salary_structure_items', ['structure_id'])
    # add foreign key constraint
    op.create_foreign_key('fk_salary_structure_items_structure_id', 'salary_structure_items', 'salary_structures', ['structure_id'], ['id'], ondelete='CASCADE')


def downgrade() -> None:
    op.drop_constraint('fk_salary_structure_items_structure_id', 'salary_structure_items', type_='foreignkey')
    op.drop_index('ix_salary_structure_items_structure_id', table_name='salary_structure_items')
    op.drop_table('salary_structure_items')

    op.drop_constraint('uq_salary_structures_code', 'salary_structures', type_='unique')
    op.drop_index('ix_salary_structures_deleted_at', table_name='salary_structures')
    op.drop_table('salary_structures')
