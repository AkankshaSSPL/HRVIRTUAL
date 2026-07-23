from datetime import date, datetime
from enum import StrEnum
import uuid

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, Time, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class EmploymentStatus(StrEnum):
    ACTIVE = "ACTIVE"
    PROBATION = "PROBATION"
    NOTICE_PERIOD = "NOTICE_PERIOD"
    EXITED = "EXITED"
    SUSPENDED = "SUSPENDED"


class EmploymentType(StrEnum):
    FULL_TIME = "FULL_TIME"
    CONSULTANT = "CONSULTANT"


class Gender(StrEnum):
    MALE = "MALE"
    FEMALE = "FEMALE"
    OTHER = "OTHER"
    UNDISCLOSED = "UNDISCLOSED"


class CandidateStatus(StrEnum):
    NEW = "NEW"
    SCREENING = "SCREENING"
    INTERVIEW = "INTERVIEW"
    OFFERED = "OFFERED"
    HIRED = "HIRED"
    REJECTED = "REJECTED"
    ARCHIVED = "ARCHIVED"


class DocumentStatus(StrEnum):
    PENDING = "PENDING"
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"


class AssetStatus(StrEnum):
    ASSIGNED = "ASSIGNED"
    RETURN_PENDING = "RETURN_PENDING"
    RETURNED = "RETURNED"
    LOST = "LOST"


class SeatStatus(StrEnum):
    AVAILABLE = "AVAILABLE"
    OCCUPIED = "OCCUPIED"
    RESERVED = "RESERVED"
    MAINTENANCE = "MAINTENANCE"
    BLOCKED = "BLOCKED"


class Seat(BaseModel):
    __tablename__ = "seats"

    label: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    zone: Mapped[str | None] = mapped_column(String(40))
    row: Mapped[str | None] = mapped_column(String(10))
    col: Mapped[int | None] = mapped_column(Integer)
    seat_type: Mapped[str] = mapped_column(String(40), nullable=False, server_default="WORKSTATION")
    status: Mapped[str] = mapped_column(String(40), nullable=False, server_default="AVAILABLE")
    employee_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="SET NULL"))

    employee: Mapped["Employee | None"] = relationship(foreign_keys=[employee_id])


class AttendanceStatus(StrEnum):
    PRESENT = "PRESENT"
    ABSENT = "ABSENT"
    HALF_DAY = "HALF_DAY"
    WEEKLY_OFF = "WEEKLY_OFF"
    ON_DUTY = "ON_DUTY"
    WORK_FROM_HOME = "WORK_FROM_HOME"
    HOLIDAY = "HOLIDAY"


class LeaveRequestStatus(StrEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class LeaveCategory(StrEnum):
    PAID = "PAID"
    UNPAID = "UNPAID"
    WFH = "WFH"


class LeaveType(BaseModel):
    __tablename__ = "leave_types"
    __table_args__ = (UniqueConstraint("name", name="uq_leave_types_name"),)

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    category: Mapped[LeaveCategory] = mapped_column(String(40), nullable=False, default=LeaveCategory.PAID)
    annual_allocation: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False, default=0)
    carry_forward_allowed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    requires_approval: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    affects_payroll: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_paid: Mapped[bool] = mapped_column(default=True, nullable=False)
    annual_quota: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False, default=0)
    description: Mapped[str | None] = mapped_column(Text)


class NotificationStatus(StrEnum):
    UNREAD = "UNREAD"
    READ = "READ"
    ARCHIVED = "ARCHIVED"


class Department(BaseModel):
    __tablename__ = "departments"
    __table_args__ = (
        UniqueConstraint("name", name="uq_departments_name"),
        Index("ix_departments_parent_id", "parent_department_id"),
    )

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    code: Mapped[str | None] = mapped_column(String(60), index=True)
    description: Mapped[str | None] = mapped_column(Text)
    parent_department_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("departments.id"))
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)

    parent_department: Mapped["Department | None"] = relationship(remote_side="Department.id")
    employees: Mapped[list["Employee"]] = relationship(back_populates="department", foreign_keys="Employee.department_id")


class Designation(BaseModel):
    __tablename__ = "designations"
    __table_args__ = (UniqueConstraint("title", name="uq_designations_title"),)

    title: Mapped[str] = mapped_column(String(160), nullable=False)
    code: Mapped[str | None] = mapped_column(String(60), index=True)
    level: Mapped[str | None] = mapped_column(String(80), index=True)
    description: Mapped[str | None] = mapped_column(Text)

    employees: Mapped[list["Employee"]] = relationship(back_populates="designation")


class Employee(BaseModel):
    __tablename__ = "employees"
    __table_args__ = (
        UniqueConstraint("employee_code", name="uq_employees_employee_code"),
        UniqueConstraint("official_email", name="uq_employees_official_email"),
        Index("ix_employees_department_status", "department_id", "employment_status"),
        Index("ix_employees_reporting_manager_id", "reporting_manager_id"),
    )

    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True)
    first_name: Mapped[str | None] = mapped_column(String(120))
    last_name: Mapped[str | None] = mapped_column(String(120))
    employee_code: Mapped[str | None] = mapped_column(String(80))
    joining_date: Mapped[date] = mapped_column(Date, nullable=False)
    employment_status: Mapped[EmploymentStatus] = mapped_column(String(40), nullable=False, default=EmploymentStatus.ACTIVE)
    employment_type: Mapped[EmploymentType] = mapped_column(String(40), nullable=False, default=EmploymentType.FULL_TIME, index=True)
    department_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("departments.id"))
    designation_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("designations.id"))
    reporting_manager_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("employees.id"))
    official_email: Mapped[str | None] = mapped_column(String(320))
    personal_email: Mapped[str | None] = mapped_column(String(320), index=True)
    phone: Mapped[str | None] = mapped_column(String(40), index=True)
    dob: Mapped[date | None] = mapped_column(Date)
    gender: Mapped[Gender | None] = mapped_column(String(30))
    emergency_contact: Mapped[dict | None] = mapped_column(JSONB)
    bank_account_number: Mapped[str | None] = mapped_column(String(80))
    ifsc_code: Mapped[str | None] = mapped_column(String(40))
    current_salary: Mapped[float | None] = mapped_column(Numeric(14, 2))
    pan_number: Mapped[str | None] = mapped_column(String(40), index=True)
    aadhaar_number: Mapped[str | None] = mapped_column(String(40))
    uan_number: Mapped[str | None] = mapped_column(String(60))
    profile_photo: Mapped[str | None] = mapped_column(Text)
    welcome_kit_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    seat_label: Mapped[str | None] = mapped_column(String(120))

    user: Mapped["User | None"] = relationship(back_populates="employee_profile")
    department: Mapped[Department | None] = relationship(back_populates="employees", foreign_keys=[department_id])
    designation: Mapped[Designation | None] = relationship(back_populates="employees")
    reporting_manager: Mapped["Employee | None"] = relationship(remote_side="Employee.id")
    documents: Mapped[list["EmployeeDocument"]] = relationship(back_populates="employee", cascade="all, delete-orphan")
    assets: Mapped[list["EmployeeAsset"]] = relationship(back_populates="employee", cascade="all, delete-orphan")
    attendance_records: Mapped[list["AttendanceRecord"]] = relationship(back_populates="employee")
    leave_requests: Mapped[list["LeaveRequest"]] = relationship(back_populates="employee")
    leave_balances: Mapped[list["LeaveBalance"]] = relationship(back_populates="employee")
    payroll_items: Mapped[list["PayrollRunItem"]] = relationship(back_populates="employee")


class Candidate(BaseModel):
    __tablename__ = "candidates"
    __table_args__ = (Index("ix_candidates_status_source", "candidate_status", "source"),)

    first_name: Mapped[str | None] = mapped_column(String(120))
    last_name: Mapped[str | None] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(String(320), index=True)
    phone: Mapped[str | None] = mapped_column(String(40), index=True)
    source: Mapped[str | None] = mapped_column(String(120), index=True)
    resume_url: Mapped[str | None] = mapped_column(Text)
    parsed_resume_json: Mapped[dict | None] = mapped_column(JSONB)
    current_company: Mapped[str | None] = mapped_column(String(180))
    expected_ctc: Mapped[float | None] = mapped_column(Numeric(14, 2))
    notice_period: Mapped[str | None] = mapped_column(String(80))
    candidate_status: Mapped[CandidateStatus] = mapped_column(String(40), nullable=False, default=CandidateStatus.NEW)


class ResumeUpload(BaseModel):
    __tablename__ = "resume_uploads"
    __table_args__ = (
        Index("ix_resume_uploads_candidate_id", "candidate_id"),
        Index("ix_resume_uploads_uploaded_by", "uploaded_by"),
    )

    candidate_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("candidates.id"))
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_filename: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    parsed_text_preview: Mapped[str | None] = mapped_column(Text)
    parsed_json: Mapped[dict | None] = mapped_column(JSONB)


class EmployeeDocument(BaseModel):
    __tablename__ = "employee_documents"
    __table_args__ = (Index("ix_employee_documents_employee_type", "employee_id", "document_type"),)

    employee_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    document_type: Mapped[str] = mapped_column(String(120), nullable=False)
    document_url: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[DocumentStatus] = mapped_column(String(40), nullable=False, default=DocumentStatus.PENDING)
    verified_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    employee: Mapped[Employee] = relationship(back_populates="documents")


class EmployeeAsset(BaseModel):
    __tablename__ = "employee_assets"
    __table_args__ = (Index("ix_employee_assets_employee_status", "employee_id", "asset_status"),)

    employee_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    asset_type: Mapped[str] = mapped_column(String(120), nullable=False)
    asset_code: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    returned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    asset_status: Mapped[AssetStatus] = mapped_column(String(40), nullable=False, default=AssetStatus.ASSIGNED)
    metadata_json: Mapped[dict | None] = mapped_column(JSONB)

    employee: Mapped[Employee] = relationship(back_populates="assets")


class AttendanceRecord(BaseModel):
    __tablename__ = "attendance_records"
    __table_args__ = (
        UniqueConstraint("employee_id", "attendance_date", name="uq_attendance_employee_date"),
        Index("ix_attendance_records_date_status", "attendance_date", "status"),
    )

    employee_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    attendance_date: Mapped[date] = mapped_column(Date, nullable=False)
    check_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    check_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    check_in_time: Mapped[datetime | None] = mapped_column(Time)
    check_out_time: Mapped[datetime | None] = mapped_column(Time)
    status: Mapped[AttendanceStatus] = mapped_column(String(40), nullable=False)
    total_hours: Mapped[float | None] = mapped_column(Numeric(6, 2))
    remarks: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str | None] = mapped_column(String(80))
    metadata_json: Mapped[dict | None] = mapped_column(JSONB)

    employee: Mapped[Employee] = relationship(back_populates="attendance_records")


class LeaveRequest(BaseModel):
    __tablename__ = "leave_requests"
    __table_args__ = (
        Index("ix_leave_requests_employee_status", "employee_id", "status"),
        Index("ix_leave_requests_type_status", "leave_type_id", "status"),
    )

    employee_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    leave_type_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("leave_types.id"))
    leave_type: Mapped[str] = mapped_column(String(80), nullable=False)
    from_date: Mapped[date | None] = mapped_column(Date)
    to_date: Mapped[date | None] = mapped_column(Date)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    total_days: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    status: Mapped[LeaveRequestStatus] = mapped_column(String(40), nullable=False, default=LeaveRequestStatus.PENDING)
    requested_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    employee: Mapped[Employee] = relationship(back_populates="leave_requests")
    leave_type_ref: Mapped[LeaveType | None] = relationship()
    approvals: Mapped[list["LeaveApproval"]] = relationship(back_populates="leave_request", cascade="all, delete-orphan")


class LeaveBalance(BaseModel):
    __tablename__ = "leave_balances"
    __table_args__ = (
        UniqueConstraint("employee_id", "leave_type", "year", name="uq_leave_balances_employee_type_year"),
        UniqueConstraint("employee_id", "leave_type_id", "year", name="uq_leave_balances_employee_type_id_year"),
        Index("ix_leave_balances_employee_year", "employee_id", "year"),
    )

    employee_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    leave_type_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("leave_types.id"))
    leave_type: Mapped[str] = mapped_column(String(80), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    allocated: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False, default=0)
    opening_balance: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False, default=0)
    accrued: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False, default=0)
    used: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False, default=0)
    remaining: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False, default=0)

    employee: Mapped[Employee] = relationship(back_populates="leave_balances")
    leave_type_ref: Mapped[LeaveType | None] = relationship()


class LeaveApproval(BaseModel):
    __tablename__ = "leave_approvals"
    __table_args__ = (
        Index("ix_leave_approvals_request_status", "leave_request_id", "status"),
        Index("ix_leave_approvals_approver", "approver_id"),
    )

    leave_request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("leave_requests.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[LeaveRequestStatus] = mapped_column(String(40), nullable=False, default=LeaveRequestStatus.PENDING)
    approver_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    comments: Mapped[str | None] = mapped_column(Text)
    action_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    leave_request: Mapped[LeaveRequest] = relationship(back_populates="approvals")


class Notification(BaseModel):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_user_status", "user_id", "status"),)

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    channel: Mapped[str | None] = mapped_column(String(60))
    status: Mapped[NotificationStatus] = mapped_column(String(40), nullable=False, default=NotificationStatus.UNREAD)
    payload_json: Mapped[dict | None] = mapped_column(JSONB)