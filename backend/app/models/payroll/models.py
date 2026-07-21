from datetime import date, datetime
from enum import StrEnum
import uuid

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class PayrollRunStatus(StrEnum):
    DRAFT = "DRAFT"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    APPROVED = "APPROVED"
    BANK_SHEET_GENERATED = "BANK_SHEET_GENERATED"
    COMPLETED = "COMPLETED"


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
