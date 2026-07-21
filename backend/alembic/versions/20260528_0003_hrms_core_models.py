"""hrms core models

Revision ID: 20260528_0003
Revises: 20260528_0002
Create Date: 2026-05-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260528_0003"
down_revision: str | None = "20260528_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def uuid_col(name: str = "id", nullable: bool = False) -> sa.Column:
    return sa.Column(name, postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=nullable)


def base_columns() -> list[sa.Column]:
    return [
        uuid_col("id"),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    ]


def add_base_columns(table_name: str) -> None:
    op.add_column(table_name, sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column(table_name, sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(op.f(f"ix_{table_name}_tenant_id"), table_name, ["tenant_id"], unique=False)
    op.create_index(op.f(f"ix_{table_name}_deleted_at"), table_name, ["deleted_at"], unique=False)


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    for table_name in ("users", "roles", "permissions", "refresh_tokens"):
        add_base_columns(table_name)

    op.alter_column("users", "hashed_password", new_column_name="password_hash")
    op.add_column("users", sa.Column("first_name", sa.String(length=120), nullable=True))
    op.add_column("users", sa.Column("last_name", sa.String(length=120), nullable=True))
    op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))
    op.execute(
        "UPDATE users SET first_name = COALESCE(NULLIF(split_part(full_name, ' ', 1), ''), 'User'), "
        "last_name = COALESCE(NULLIF(trim(substr(full_name, length(split_part(full_name, ' ', 1)) + 1)), ''), 'Account')"
    )
    op.alter_column("users", "first_name", nullable=False)
    op.alter_column("users", "last_name", nullable=False)
    op.drop_column("users", "full_name")
    op.create_index("ix_users_active_deleted", "users", ["is_active", "deleted_at"], unique=False)

    for table_name, pk_name, unique_name, cols in (
        ("user_roles", "user_roles_pkey", "uq_user_roles_user_role", ["user_id", "role_id"]),
        ("role_permissions", "role_permissions_pkey", "uq_role_permissions_role_permission", ["role_id", "permission_id"]),
    ):
        op.drop_constraint(pk_name, table_name, type_="primary")
        op.add_column(table_name, uuid_col("id"))
        op.add_column(table_name, sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True))
        op.add_column(table_name, sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False))
        op.add_column(table_name, sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False))
        op.add_column(table_name, sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
        op.create_primary_key(f"{table_name}_pkey", table_name, ["id"])
        op.create_unique_constraint(unique_name, table_name, cols)
        op.create_index(op.f(f"ix_{table_name}_tenant_id"), table_name, ["tenant_id"], unique=False)
        op.create_index(op.f(f"ix_{table_name}_deleted_at"), table_name, ["deleted_at"], unique=False)
        for col in cols:
            op.create_index(op.f(f"ix_{table_name}_{col}"), table_name, [col], unique=False)

    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"], unique=False)
    op.create_index("ix_refresh_tokens_expires_at", "refresh_tokens", ["expires_at"], unique=False)

    op.create_table(
        "departments",
        *base_columns(),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("code", sa.String(length=60), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("parent_department_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["parent_department_id"], ["departments.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_departments_name"),
    )
    op.create_index("ix_departments_code", "departments", ["code"], unique=False)
    op.create_index("ix_departments_parent_id", "departments", ["parent_department_id"], unique=False)
    op.create_index("ix_departments_tenant_id", "departments", ["tenant_id"], unique=False)
    op.create_index("ix_departments_deleted_at", "departments", ["deleted_at"], unique=False)

    op.create_table(
        "designations",
        *base_columns(),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("code", sa.String(length=60), nullable=True),
        sa.Column("level", sa.String(length=80), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("title", name="uq_designations_title"),
    )
    op.create_index("ix_designations_code", "designations", ["code"], unique=False)
    op.create_index("ix_designations_level", "designations", ["level"], unique=False)
    op.create_index("ix_designations_tenant_id", "designations", ["tenant_id"], unique=False)
    op.create_index("ix_designations_deleted_at", "designations", ["deleted_at"], unique=False)

    op.create_table(
        "employees",
        *base_columns(),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("employee_code", sa.String(length=80), nullable=False),
        sa.Column("joining_date", sa.Date(), nullable=False),
        sa.Column("employment_status", sa.String(length=40), nullable=False),
        sa.Column("department_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("designation_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("reporting_manager_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("official_email", sa.String(length=320), nullable=False),
        sa.Column("personal_email", sa.String(length=320), nullable=True),
        sa.Column("phone", sa.String(length=40), nullable=True),
        sa.Column("dob", sa.Date(), nullable=True),
        sa.Column("gender", sa.String(length=30), nullable=True),
        sa.Column("emergency_contact", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("bank_account_number", sa.String(length=80), nullable=True),
        sa.Column("ifsc_code", sa.String(length=40), nullable=True),
        sa.Column("pan_number", sa.String(length=40), nullable=True),
        sa.Column("aadhaar_number", sa.String(length=40), nullable=True),
        sa.Column("uan_number", sa.String(length=60), nullable=True),
        sa.Column("profile_photo", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"]),
        sa.ForeignKeyConstraint(["designation_id"], ["designations.id"]),
        sa.ForeignKeyConstraint(["reporting_manager_id"], ["employees.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("employee_code", name="uq_employees_employee_code"),
        sa.UniqueConstraint("official_email", name="uq_employees_official_email"),
        sa.UniqueConstraint("user_id", name="uq_employees_user_id"),
    )
    for name, cols in {
        "ix_employees_department_status": ["department_id", "employment_status"],
        "ix_employees_reporting_manager_id": ["reporting_manager_id"],
        "ix_employees_personal_email": ["personal_email"],
        "ix_employees_phone": ["phone"],
        "ix_employees_pan_number": ["pan_number"],
        "ix_employees_tenant_id": ["tenant_id"],
        "ix_employees_deleted_at": ["deleted_at"],
    }.items():
        op.create_index(name, "employees", cols, unique=False)

    op.create_table(
        "candidates",
        *base_columns(),
        sa.Column("first_name", sa.String(length=120), nullable=True),
        sa.Column("last_name", sa.String(length=120), nullable=True),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("phone", sa.String(length=40), nullable=True),
        sa.Column("source", sa.String(length=120), nullable=True),
        sa.Column("resume_url", sa.Text(), nullable=True),
        sa.Column("parsed_resume_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("current_company", sa.String(length=180), nullable=True),
        sa.Column("expected_ctc", sa.Numeric(14, 2), nullable=True),
        sa.Column("notice_period", sa.String(length=80), nullable=True),
        sa.Column("candidate_status", sa.String(length=40), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    for name, cols in {
        "ix_candidates_email": ["email"],
        "ix_candidates_phone": ["phone"],
        "ix_candidates_source": ["source"],
        "ix_candidates_status_source": ["candidate_status", "source"],
        "ix_candidates_tenant_id": ["tenant_id"],
        "ix_candidates_deleted_at": ["deleted_at"],
    }.items():
        op.create_index(name, "candidates", cols, unique=False)

    op.create_table(
        "employee_documents",
        *base_columns(),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("document_type", sa.String(length=120), nullable=False),
        sa.Column("document_url", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("verified_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["verified_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_employee_documents_employee_type", "employee_documents", ["employee_id", "document_type"], unique=False)
    op.create_index("ix_employee_documents_tenant_id", "employee_documents", ["tenant_id"], unique=False)
    op.create_index("ix_employee_documents_deleted_at", "employee_documents", ["deleted_at"], unique=False)

    op.create_table(
        "employee_assets",
        *base_columns(),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("asset_type", sa.String(length=120), nullable=False),
        sa.Column("asset_code", sa.String(length=120), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("returned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("asset_status", sa.String(length=40), nullable=False),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_employee_assets_asset_code", "employee_assets", ["asset_code"], unique=False)
    op.create_index("ix_employee_assets_employee_status", "employee_assets", ["employee_id", "asset_status"], unique=False)
    op.create_index("ix_employee_assets_tenant_id", "employee_assets", ["tenant_id"], unique=False)
    op.create_index("ix_employee_assets_deleted_at", "employee_assets", ["deleted_at"], unique=False)

    op.create_table(
        "attendance_records",
        *base_columns(),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("attendance_date", sa.Date(), nullable=False),
        sa.Column("check_in_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("check_out_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("source", sa.String(length=80), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("employee_id", "attendance_date", name="uq_attendance_employee_date"),
    )
    op.create_index("ix_attendance_records_date_status", "attendance_records", ["attendance_date", "status"], unique=False)
    op.create_index("ix_attendance_records_tenant_id", "attendance_records", ["tenant_id"], unique=False)
    op.create_index("ix_attendance_records_deleted_at", "attendance_records", ["deleted_at"], unique=False)

    op.create_table(
        "leave_requests",
        *base_columns(),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("leave_type", sa.String(length=80), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("total_days", sa.Numeric(6, 2), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("requested_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["approved_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requested_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_leave_requests_employee_status", "leave_requests", ["employee_id", "status"], unique=False)
    op.create_index("ix_leave_requests_tenant_id", "leave_requests", ["tenant_id"], unique=False)
    op.create_index("ix_leave_requests_deleted_at", "leave_requests", ["deleted_at"], unique=False)

    op.create_table(
        "leave_balances",
        *base_columns(),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("leave_type", sa.String(length=80), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("opening_balance", sa.Numeric(8, 2), nullable=False),
        sa.Column("accrued", sa.Numeric(8, 2), nullable=False),
        sa.Column("used", sa.Numeric(8, 2), nullable=False),
        sa.Column("remaining", sa.Numeric(8, 2), nullable=False),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("employee_id", "leave_type", "year", name="uq_leave_balances_employee_type_year"),
    )
    op.create_index("ix_leave_balances_employee_year", "leave_balances", ["employee_id", "year"], unique=False)
    op.create_index("ix_leave_balances_tenant_id", "leave_balances", ["tenant_id"], unique=False)
    op.create_index("ix_leave_balances_deleted_at", "leave_balances", ["deleted_at"], unique=False)

    op.create_table(
        "payroll_runs",
        *base_columns(),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("generated_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["approved_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["generated_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("month", "year", name="uq_payroll_runs_month_year"),
    )
    op.create_index("ix_payroll_runs_status_year_month", "payroll_runs", ["status", "year", "month"], unique=False)
    op.create_index("ix_payroll_runs_tenant_id", "payroll_runs", ["tenant_id"], unique=False)
    op.create_index("ix_payroll_runs_deleted_at", "payroll_runs", ["deleted_at"], unique=False)

    op.create_table(
        "payroll_run_items",
        *base_columns(),
        sa.Column("payroll_run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("gross_salary", sa.Numeric(14, 2), nullable=False),
        sa.Column("deductions", sa.Numeric(14, 2), nullable=False),
        sa.Column("lop_days", sa.Numeric(6, 2), nullable=False),
        sa.Column("net_salary", sa.Numeric(14, 2), nullable=False),
        sa.Column("bank_account_number", sa.String(length=80), nullable=False),
        sa.Column("ifsc_code", sa.String(length=40), nullable=False),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
        sa.ForeignKeyConstraint(["payroll_run_id"], ["payroll_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("payroll_run_id", "employee_id", name="uq_payroll_run_items_run_employee"),
    )
    op.create_index("ix_payroll_run_items_employee_id", "payroll_run_items", ["employee_id"], unique=False)
    op.create_index("ix_payroll_run_items_payroll_run_id", "payroll_run_items", ["payroll_run_id"], unique=False)
    op.create_index("ix_payroll_run_items_tenant_id", "payroll_run_items", ["tenant_id"], unique=False)
    op.create_index("ix_payroll_run_items_deleted_at", "payroll_run_items", ["deleted_at"], unique=False)

    op.create_table(
        "approval_requests",
        *base_columns(),
        sa.Column("module_name", sa.String(length=120), nullable=False),
        sa.Column("action_name", sa.String(length=160), nullable=False),
        sa.Column("payload_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("requested_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("rejected_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["approved_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["rejected_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["requested_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_approval_requests_module_status", "approval_requests", ["module_name", "status"], unique=False)
    op.create_index("ix_approval_requests_requested_by", "approval_requests", ["requested_by"], unique=False)
    op.create_index("ix_approval_requests_tenant_id", "approval_requests", ["tenant_id"], unique=False)
    op.create_index("ix_approval_requests_deleted_at", "approval_requests", ["deleted_at"], unique=False)

    op.create_table(
        "audit_logs",
        *base_columns(),
        sa.Column("entity_type", sa.String(length=120), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.String(length=120), nullable=False),
        sa.Column("old_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("new_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("performed_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["performed_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_logs_entity", "audit_logs", ["entity_type", "entity_id"], unique=False)
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"], unique=False)
    op.create_index("ix_audit_logs_performed_by", "audit_logs", ["performed_by"], unique=False)
    op.create_index("ix_audit_logs_tenant_id", "audit_logs", ["tenant_id"], unique=False)
    op.create_index("ix_audit_logs_deleted_at", "audit_logs", ["deleted_at"], unique=False)

    op.create_table(
        "agent_runs",
        *base_columns(),
        sa.Column("agent_name", sa.String(length=160), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("requested_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("correlation_id", sa.String(length=120), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(["requested_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_runs_agent_status", "agent_runs", ["agent_name", "status"], unique=False)
    op.create_index("ix_agent_runs_started_at", "agent_runs", ["started_at"], unique=False)
    op.create_index("ix_agent_runs_correlation_id", "agent_runs", ["correlation_id"], unique=False)
    op.create_index("ix_agent_runs_tenant_id", "agent_runs", ["tenant_id"], unique=False)
    op.create_index("ix_agent_runs_deleted_at", "agent_runs", ["deleted_at"], unique=False)

    op.create_table(
        "agent_steps",
        *base_columns(),
        sa.Column("agent_run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("step_name", sa.String(length=180), nullable=False),
        sa.Column("step_status", sa.String(length=40), nullable=False),
        sa.Column("input_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("output_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(["agent_run_id"], ["agent_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_steps_run_status", "agent_steps", ["agent_run_id", "step_status"], unique=False)
    op.create_index("ix_agent_steps_step_name", "agent_steps", ["step_name"], unique=False)
    op.create_index("ix_agent_steps_tenant_id", "agent_steps", ["tenant_id"], unique=False)
    op.create_index("ix_agent_steps_deleted_at", "agent_steps", ["deleted_at"], unique=False)

    op.create_table(
        "notifications",
        *base_columns(),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("channel", sa.String(length=60), nullable=True),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("payload_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notifications_user_status", "notifications", ["user_id", "status"], unique=False)
    op.create_index("ix_notifications_tenant_id", "notifications", ["tenant_id"], unique=False)
    op.create_index("ix_notifications_deleted_at", "notifications", ["deleted_at"], unique=False)


def downgrade() -> None:
    for table_name in (
        "notifications",
        "agent_steps",
        "agent_runs",
        "audit_logs",
        "approval_requests",
        "payroll_run_items",
        "payroll_runs",
        "leave_balances",
        "leave_requests",
        "attendance_records",
        "employee_assets",
        "employee_documents",
        "candidates",
        "employees",
        "designations",
        "departments",
    ):
        op.drop_table(table_name)

    op.drop_index("ix_refresh_tokens_expires_at", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
    op.drop_index("ix_users_active_deleted", table_name="users")

    for table_name, unique_name, cols in (
        ("role_permissions", "uq_role_permissions_role_permission", ["role_id", "permission_id"]),
        ("user_roles", "uq_user_roles_user_role", ["user_id", "role_id"]),
    ):
        for col in cols:
            op.drop_index(op.f(f"ix_{table_name}_{col}"), table_name=table_name)
        op.drop_index(op.f(f"ix_{table_name}_deleted_at"), table_name=table_name)
        op.drop_index(op.f(f"ix_{table_name}_tenant_id"), table_name=table_name)
        op.drop_constraint(unique_name, table_name, type_="unique")
        op.drop_constraint(f"{table_name}_pkey", table_name, type_="primary")
        op.drop_column(table_name, "deleted_at")
        op.drop_column(table_name, "updated_at")
        op.drop_column(table_name, "created_at")
        op.drop_column(table_name, "tenant_id")
        op.drop_column(table_name, "id")
        op.create_primary_key(f"{table_name}_pkey", table_name, cols)

    op.add_column("users", sa.Column("full_name", sa.String(length=255), nullable=True))
    op.execute("UPDATE users SET full_name = trim(first_name || ' ' || last_name)")
    op.alter_column("users", "full_name", nullable=False)
    op.drop_column("users", "last_login_at")
    op.drop_column("users", "last_name")
    op.drop_column("users", "first_name")
    op.alter_column("users", "password_hash", new_column_name="hashed_password")

    for table_name in ("refresh_tokens", "permissions", "roles", "users"):
        op.drop_index(op.f(f"ix_{table_name}_deleted_at"), table_name=table_name)
        op.drop_index(op.f(f"ix_{table_name}_tenant_id"), table_name=table_name)
        op.drop_column(table_name, "deleted_at")
        op.drop_column(table_name, "tenant_id")

