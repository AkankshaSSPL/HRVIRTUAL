"""add activation_tokens table and users.activated_at

Revision ID: 20260827_0041
Revises: 20260827_0040
Create Date: 2026-08-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260827_0041"
down_revision = "20260827_0040"
branch_labels = None
depends_on = None

# NOTE: id/created_at/updated_at column definitions below assume the same
# BaseModel pattern used by refresh_tokens (uuid PK default gen_random_uuid(),
# timezone-aware timestamps default now()). Diff this against how
# refresh_tokens (or any other BaseModel table) is actually created in an
# earlier migration and adjust server_defaults/types if they differ. Ideally
# this migration is regenerated with `alembic revision --autogenerate` against
# the real models.py so it can't drift from the ORM definition.


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "activation_tokens",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "purpose",
            sa.String(length=30),
            nullable=False,
            server_default="activation",
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_activation_tokens_user_id", "activation_tokens", ["user_id"]
    )
    op.create_index(
        "ix_activation_tokens_token_hash", "activation_tokens", ["token_hash"]
    )


def downgrade() -> None:
    op.drop_index("ix_activation_tokens_token_hash", table_name="activation_tokens")
    op.drop_index("ix_activation_tokens_user_id", table_name="activation_tokens")
    op.drop_table("activation_tokens")
    op.drop_column("users", "activated_at")