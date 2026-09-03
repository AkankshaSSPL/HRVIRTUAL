"""add knowledge base tables

Revision ID: XXXX_knowledge_base
Revises: <SET_TO_YOUR_CURRENT_HEAD_REVISION>
Create Date: 2026-08-27

IMPORTANT: rename this file to alembic's generated <hash>_add_knowledge_base_tables.py
naming convention and set `down_revision` to your actual current head before running
`alembic upgrade head`. Generate this properly with:

    alembic revision --autogenerate -m "add_knowledge_base_tables"

then diff the result against this file — autogenerate is known to miss the
`Computed()` generated column and the GIN index, both of which are made
explicit below via raw SQL so they are never silently dropped.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260827_0043"
down_revision = "20260827_0042"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- HRDocument: two new columns ---
    op.add_column(
        "hr_documents",
        sa.Column(
            "searchable",
            sa.Boolean(),
            nullable=False,
            server_default="true",
        ),
    )
    op.add_column(
        "hr_documents",
        sa.Column("indexed_at", sa.DateTime(timezone=True), nullable=True),
    )

    # --- knowledge_chunks ---
    op.create_table(
        "knowledge_chunks",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
        ),
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("hr_documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("chunk_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_knowledge_chunks_document_id", "knowledge_chunks", ["document_id"]
    )

    # Generated tsvector column + GIN index — done explicitly since
    # autogenerate frequently drops the Computed()/gin combination.
    op.execute(
        "ALTER TABLE knowledge_chunks ADD COLUMN content_tsv tsvector "
        "GENERATED ALWAYS AS (to_tsvector('english', content)) STORED"
    )
    op.execute(
        "CREATE INDEX ix_knowledge_chunks_tsv ON knowledge_chunks "
        "USING gin (content_tsv)"
    )

    # --- knowledge_chat_messages ---
    op.create_table(
        "knowledge_chat_messages",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("citations", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_knowledge_chat_user_created",
        "knowledge_chat_messages",
        ["user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_knowledge_chat_user_created", table_name="knowledge_chat_messages")
    op.drop_table("knowledge_chat_messages")

    op.drop_index("ix_knowledge_chunks_tsv", table_name="knowledge_chunks")
    op.drop_index("ix_knowledge_chunks_document_id", table_name="knowledge_chunks")
    op.drop_table("knowledge_chunks")

    op.drop_column("hr_documents", "indexed_at")
    op.drop_column("hr_documents", "searchable")