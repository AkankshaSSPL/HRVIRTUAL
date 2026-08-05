from datetime import date, datetime
from enum import StrEnum
import uuid

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class PayrollRunStatus(StrEnum):
    DRAFT = "DRAFT"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    APPROVED = "APPROVED"
    BANK_SHEET_GENERATED = "BANK_SHEET_GENERATED"
    COMPLETED = "COMPLETED"
    REJECTED = "REJECTED"


class SalaryAssignmentStatus(StrEnum):
    DRAFT = "DRAFT"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    ACTIVE = "ACTIVE"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"


class SalaryApprovalStatus(StrEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class SalaryRevisionType(StrEnum):
    ASSIGNMENT = "ASSIGNMENT"
    INCREASE = "INCREASE"
    DECREASE = "DECREASE"
    STRUCTURE_CHANGE = "STRUCTURE_CHANGE"


class PayrollRun(BaseModel):
    __tablename__ = "payroll_runs"
    __table_args__ = (
        UniqueConstraint("month", "year", name="uq_payroll_runs_month_year"),
        Index("ix_payroll_runs_status_year_month", "status", "year", "month"),
    )

    month: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[PayrollRunStatus] = mapped_column(String(40), nullable=False, default=PayrollRunStatus.DRAFT)
    generated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Snapshot of run-level totals computed at generation time — avoids N+1
    # item-count queries on the list endpoint. Shape:
    # {"skipped": [...], "total_net_payable": 450000.0, "employee_count": 5}
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    items: Mapped[list["PayrollRunItem"]] = relationship(back_populates="payroll_run", cascade="all, delete-orphan")


class PayrollRunItem(BaseModel):
    __tablename__ = "payroll_run_items"
    __table_args__ = (
        UniqueConstraint("payroll_run_id", "employee_id", name="uq_payroll_run_items_run_employee"),
        Index("ix_payroll_run_items_employee_id", "employee_id"),
        Index("ix_payroll_run_items_payroll_run_id", "payroll_run_id"),
    )

    payroll_run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("payroll_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("employees.id"), nullable=False)
    gross_salary: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    deductions: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    lop_days: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False, default=0)
    net_salary: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    bank_account_number: Mapped[str] = mapped_column(String(80), nullable=False)
    ifsc_code: Mapped[str] = mapped_column(String(40), nullable=False)
    # Full component-level breakdown for this employee's payroll line — see
    # payroll_computation.py for the FULL_TIME / CONSULTANT shape of this dict.
    breakdown_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    payroll_run: Mapped[PayrollRun] = relationship(back_populates="items")
    employee: Mapped["Employee"] = relationship(back_populates="payroll_items")

class SalaryComponent(BaseModel):
    __tablename__ = "salary_components"
    __table_args__ = (
        UniqueConstraint("code", name="uq_salary_components_code"),
        UniqueConstraint("name", name="uq_salary_components_name"),
        Index("ix_salary_components_deleted_at", "deleted_at"),
    )

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(40), nullable=False)
    calculation_type: Mapped[str] = mapped_column(String(40), nullable=False)
    calculation_value: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    formula: Mapped[str | None] = mapped_column(String(500), nullable=True)
    reference_component_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    taxable: Mapped[bool] = mapped_column(nullable=False, default=True)
    active: Mapped[bool] = mapped_column(nullable=False, default=True)


class SalaryStructure(BaseModel):
    __tablename__ = "salary_structures"
    __table_args__ = (
        UniqueConstraint("code", name="uq_salary_structures_code"),
        Index("ix_salary_structures_deleted_at", "deleted_at"),
    )

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    active: Mapped[bool] = mapped_column(nullable=False, default=True)

    items: Mapped[list["SalaryStructureItem"]] = relationship(back_populates="structure", cascade="all, delete-orphan")


class SalaryStructureItem(BaseModel):
    __tablename__ = "salary_structure_items"
    __table_args__ = (
        Index("ix_salary_structure_items_structure_id", "structure_id"),
    )

    structure_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("salary_structures.id", ondelete="CASCADE"), nullable=False
    )
    component_code: Mapped[str] = mapped_column(String(50), nullable=False)
    calculation_type: Mapped[str] = mapped_column(String(40), nullable=False)
    calculation_value: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    formula: Mapped[str | None] = mapped_column(String(500), nullable=True)
    reference_component_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    structure: Mapped[SalaryStructure] = relationship(back_populates="items")


class EmployeeSalaryAssignment(BaseModel):
    __tablename__ = "employee_salary_assignments"
    __table_args__ = (
        Index("ix_employee_salary_assignments_employee_status", "employee_id", "status"),
        Index("ix_employee_salary_assignments_structure_id", "salary_structure_id"),
        Index("ix_employee_salary_assignments_effective", "effective_from", "effective_to"),
    )

    employee_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    salary_structure_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("salary_structures.id"), nullable=False)
    gross_salary: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date)
    status: Mapped[SalaryAssignmentStatus] = mapped_column(String(40), nullable=False, default=SalaryAssignmentStatus.PENDING_APPROVAL)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))

    employee: Mapped["Employee"] = relationship()
    salary_structure: Mapped[SalaryStructure] = relationship()
    approvals: Mapped[list["SalaryAssignmentApproval"]] = relationship(back_populates="assignment", cascade="all, delete-orphan")


class SalaryRevisionHistory(BaseModel):
    __tablename__ = "salary_revision_history"
    __table_args__ = (
        Index("ix_salary_revision_history_employee_id", "employee_id"),
        Index("ix_salary_revision_history_effective_from", "effective_from"),
    )

    employee_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    old_salary: Mapped[float | None] = mapped_column(Numeric(14, 2))
    new_salary: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    revision_type: Mapped[SalaryRevisionType] = mapped_column(String(40), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))

    employee: Mapped["Employee"] = relationship()


class SalaryAssignmentApproval(BaseModel):
    __tablename__ = "salary_assignment_approvals"
    __table_args__ = (
        Index("ix_salary_assignment_approvals_assignment_status", "assignment_id", "status"),
    )

    assignment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("employee_salary_assignments.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[SalaryApprovalStatus] = mapped_column(String(40), nullable=False, default=SalaryApprovalStatus.PENDING)
    approver_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    comments: Mapped[str | None] = mapped_column(Text)

    assignment: Mapped[EmployeeSalaryAssignment] = relationship(back_populates="approvals")


# ── Payroll Masters (new) ─────────────────────────────────────────────────────

class PayrollConfig(BaseModel):
    """Statutory payroll rates — EPF, PT slabs, consultant TDS. Never hardcode
    these values anywhere else; always read through PayrollConfigService."""
    __tablename__ = "payroll_configs"
    __table_args__ = (
        Index("ix_payroll_configs_active", "active"),
        Index("ix_payroll_configs_deleted_at", "deleted_at"),
    )

    epf_wage_cap: Mapped[int] = mapped_column(Integer, nullable=False, default=15000)
    epf_employee_rate: Mapped[float] = mapped_column(Numeric(6, 4), nullable=False, default=0.1200)
    epf_employer_rate: Mapped[float] = mapped_column(Numeric(6, 4), nullable=False, default=0.1361)

    # Maharashtra PT slabs as JSON list:
    # [{"min": 0, "max": 7499, "amount": 0},
    #  {"min": 7500, "max": 9999, "amount": 175},
    #  {"min": 10000, "max": null, "amount": 200}]
    professional_tax_slabs: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    consultant_tds_rate: Mapped[float] = mapped_column(Numeric(6, 4), nullable=False, default=0.1000)
    consultant_base_working_days: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    employee_base_working_days: Mapped[int] = mapped_column(Integer, nullable=False, default=26)

    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class CompanySettings(BaseModel):
    """Company identity/banking details used to populate exported payroll sheets."""
    __tablename__ = "company_settings"
    __table_args__ = (
        Index("ix_company_settings_active", "active"),
        Index("ix_company_settings_deleted_at", "deleted_at"),
    )

    company_name: Mapped[str] = mapped_column(String(240), nullable=False)
    company_pan: Mapped[str | None] = mapped_column(String(20), nullable=True)
    company_tan: Mapped[str | None] = mapped_column(String(20), nullable=True)
    gstin: Mapped[str | None] = mapped_column(String(20), nullable=True)
    payroll_bank_account: Mapped[str | None] = mapped_column(String(80), nullable=True)
    payroll_bank_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    payroll_bank_ifsc: Mapped[str | None] = mapped_column(String(20), nullable=True)
    address_line1: Mapped[str | None] = mapped_column(String(240), nullable=True)
    city: Mapped[str | None] = mapped_column(String(80), nullable=True)
    state: Mapped[str | None] = mapped_column(String(80), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class EmployeeTDSConfig(BaseModel):
    """Per-employee monthly TDS as provided by the company CA for a given
    financial year. If no row exists for (employee, financial_year), payroll
    computation treats TDS as 0 — HR must add this manually when the CA
    provides workings; it is never auto-calculated."""
    __tablename__ = "employee_tds_configs"
    __table_args__ = (
        UniqueConstraint("employee_id", "financial_year", "effective_from", name="uq_employee_tds_config"),
        Index("ix_employee_tds_configs_employee_fy", "employee_id", "financial_year"),
    )

    employee_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    financial_year: Mapped[str] = mapped_column(String(10), nullable=False)  # e.g. "2026-27"
    monthly_tds: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    annual_tax_liability: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    tax_regime: Mapped[str | None] = mapped_column(String(10), nullable=True)  # "NEW" | "OLD"
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)

    employee: Mapped["Employee"] = relationship()


# ── Pay Type masters (dynamic pay-type rule builder) ──────────────────────────

class PayBasis(StrEnum):
    STRUCTURE = "STRUCTURE"
    FLAT_FEE = "FLAT_FEE"


class ProrationBasis(StrEnum):
    CALENDAR_WORKING_DAYS = "CALENDAR_WORKING_DAYS"
    FIXED_BASE_DAYS = "FIXED_BASE_DAYS"


class PayTypeRuleKind(StrEnum):
    EARNING = "EARNING"
    DEDUCTION = "DEDUCTION"
    EMPLOYER_CONTRIBUTION = "EMPLOYER_CONTRIBUTION"


class PayTypeRuleCalcType(StrEnum):
    FIXED = "FIXED"
    PERCENT_OF = "PERCENT_OF"
    FORMULA = "FORMULA"
    STATUTORY_EPF = "STATUTORY_EPF"
    STATUTORY_PT = "STATUTORY_PT"
    STATUTORY_TDS = "STATUTORY_TDS"
    FLAT_TDS = "FLAT_TDS"
    LEAVE_DEDUCTION = "LEAVE_DEDUCTION"


class PayType(BaseModel):
    """Master record for a worker's pay type (FULL_TIME, CONSULTANT, and any
    future type). `code` must match Employee.employment_type. Owns an ordered
    rule set (PayTypeRule) that the payroll engine evaluates in `sequence`
    order instead of branching in Python."""
    __tablename__ = "pay_types"
    __table_args__ = (
        UniqueConstraint("code", name="uq_pay_types_code"),
        Index("ix_pay_types_active", "active"),
        Index("ix_pay_types_deleted_at", "deleted_at"),
    )

    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    pay_basis: Mapped[str] = mapped_column(String(40), nullable=False)
    proration_basis: Mapped[str] = mapped_column(
        String(40), nullable=False, default=ProrationBasis.CALENDAR_WORKING_DAYS
    )
    base_working_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)

    rules: Mapped[list["PayTypeRule"]] = relationship(
        back_populates="pay_type",
        cascade="all, delete-orphan",
        order_by="PayTypeRule.sequence",
    )


class PayTypeRule(BaseModel):
    """A single earning/deduction/statutory line in a PayType's rule set.
    FIXED / PERCENT_OF / FORMULA are evaluated the same way as
    SalaryStructureItem via evaluate_component(). The STATUTORY_*, FLAT_TDS,
    and LEAVE_DEDUCTION calc types read their numbers from PayrollConfig /
    EmployeeTDSConfig / calculate_lop() at compute time — never store
    statutory rates directly on the rule."""
    __tablename__ = "pay_type_rules"
    __table_args__ = (
        UniqueConstraint("pay_type_id", "code", name="uq_pay_type_rules_pay_type_code"),
        Index("ix_pay_type_rules_pay_type_id", "pay_type_id"),
    )

    pay_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pay_types.id", ondelete="CASCADE"), nullable=False
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    calc_type: Mapped[str] = mapped_column(String(40), nullable=False)
    value: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    reference_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    formula: Mapped[str | None] = mapped_column(String(500), nullable=True)
    taxable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    prorate: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    pay_type: Mapped[PayType] = relationship(back_populates="rules")