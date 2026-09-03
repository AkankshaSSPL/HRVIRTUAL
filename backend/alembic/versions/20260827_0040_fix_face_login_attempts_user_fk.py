"""fix face_login_attempts FK: employee_id -> user_id

Prerequisite bug fix. The original migration
(a7ee3a56d3f3_add_face_auth_columns_and_table.py) created
face_login_attempts.employee_id -> employees.id, but the
FaceLoginAttempt model declares user_id -> users.id. This
corrective migration drops the wrong column/FK and adds the
correct one. Table is new/empty, so this is a safe destructive
change (no data migration needed).

Revision ID: 20260827_0040
Revises: 7a1573a1b595
Create Date: 2026-08-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260827_0040"
down_revision = "7a1573a1b595"
branch_labels = None
depends_on = None

# NOTE: constraint/index names below assume Postgres' default naming
# convention (<table>_<column>_fkey, ix_<table>_<column>). Before running
# this, confirm the real names with:
#   \d face_login_attempts
# and adjust the two `op.drop_constraint` / `op.drop_index` calls if they
# differ (e.g. if the project uses a custom naming_convention on the
# SQLAlchemy MetaData).


def upgrade() -> None:
    conn = op.get_bind()
    from sqlalchemy import inspect
    insp = inspect(conn)

    # Drop the incorrect employee_id column + its FK/index.
    fks = insp.get_foreign_keys('face_login_attempts')
    fk_names = [fk['name'] for fk in fks if fk['name']]
    if 'face_login_attempts_employee_id_fkey' in fk_names:
        op.drop_constraint(
            "face_login_attempts_employee_id_fkey",
            "face_login_attempts",
            type_="foreignkey",
        )
        
    cols = [col['name'] for col in insp.get_columns('face_login_attempts')]
    if 'employee_id' in cols:
        op.drop_index(
            "ix_face_login_attempts_employee_id",
            table_name="face_login_attempts",
            if_exists=True,
        )
        op.drop_column("face_login_attempts", "employee_id")

    # Add the correct user_id column + FK + indexes matching the model's
    if 'user_id' not in cols:
        op.add_column(
            "face_login_attempts",
            sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        )
        op.create_foreign_key(
            "face_login_attempts_user_id_fkey",
            "face_login_attempts",
            "users",
            ["user_id"],
            ["id"],
            ondelete="SET NULL",
        )
        op.create_index(
            "ix_face_login_attempts_user_id", "face_login_attempts", ["user_id"]
        )
        
    indexes = [idx['name'] for idx in insp.get_indexes('face_login_attempts')]
    if 'ix_face_login_attempts_success' not in indexes:
        op.create_index(
            "ix_face_login_attempts_success", "face_login_attempts", ["success"]
        )


def downgrade() -> None:
    op.drop_index("ix_face_login_attempts_success", table_name="face_login_attempts")
    op.drop_index("ix_face_login_attempts_user_id", table_name="face_login_attempts")
    op.drop_constraint(
        "face_login_attempts_user_id_fkey",
        "face_login_attempts",
        type_="foreignkey",
    )
    op.drop_column("face_login_attempts", "user_id")

    op.add_column(
        "face_login_attempts",
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        "ix_face_login_attempts_employee_id", "face_login_attempts", ["employee_id"]
    )
    op.create_foreign_key(
        "face_login_attempts_employee_id_fkey",
        "face_login_attempts",
        "employees",
        ["employee_id"],
        ["id"],
    )