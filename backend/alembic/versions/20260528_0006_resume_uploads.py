"""resume upload metadata

Revision ID: 20260528_0006
Revises: 20260528_0005
Create Date: 2026-05-28
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260528_0006"
down_revision = "20260528_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "resume_uploads",
        sa.Column("candidate_id", sa.UUID(), nullable=True),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("stored_filename", sa.String(length=255), nullable=False),
        sa.Column("storage_path", sa.Text(), nullable=False),
        sa.Column("content_type", sa.String(length=120), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("uploaded_by", sa.UUID(), nullable=True),
        sa.Column("parsed_text_preview", sa.Text(), nullable=True),
        sa.Column("parsed_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("tenant_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["candidate_id"], ["candidates.id"]),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("stored_filename"),
    )
    op.create_index("ix_resume_uploads_candidate_id", "resume_uploads", ["candidate_id"], unique=False)
    op.create_index("ix_resume_uploads_deleted_at", "resume_uploads", ["deleted_at"], unique=False)
    op.create_index("ix_resume_uploads_tenant_id", "resume_uploads", ["tenant_id"], unique=False)
    op.create_index("ix_resume_uploads_uploaded_by", "resume_uploads", ["uploaded_by"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_resume_uploads_uploaded_by", table_name="resume_uploads")
    op.drop_index("ix_resume_uploads_tenant_id", table_name="resume_uploads")
    op.drop_index("ix_resume_uploads_deleted_at", table_name="resume_uploads")
    op.drop_index("ix_resume_uploads_candidate_id", table_name="resume_uploads")
    op.drop_table("resume_uploads")
