from __future__ import annotations

import calendar
import re
import uuid
from pathlib import Path

from openpyxl import Workbook
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.payroll import CompanySettings, PayrollRun, PayrollRunItem

# Files land here; served back via GET /payroll/export/{filename}.
# NOTE: confirm this path is writable in your deployment (Docker volume,
# Windows dev path, etc.) — adjust if your other file-output services use a
# different convention.
STORAGE_DIR = Path(__file__).resolve().parents[2] / "storage" / "payroll"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

_SAFE_FILENAME_RE = re.compile(r"^[A-Za-z0-9_\-]+\.xlsx$")


def is_safe_filename(filename: str) -> bool:
    """Rejects path traversal / unexpected extensions before any filesystem
    access. Generated filenames all match this pattern."""
    return bool(_SAFE_FILENAME_RE.match(filename)) and ".." not in filename


def _month_label(month: int, year: int) -> str:
    return f"{calendar.month_name[month]} {year}"


def _new_filename(export_type: str, month: int, year: int) -> str:
    return f"payroll_{export_type}_{year}{month:02d}_{uuid.uuid4().hex[:8]}.xlsx"


def _load_items_with_employees(db: Session, payroll_run: PayrollRun) -> list[PayrollRunItem]:
    return list(
        db.scalars(
            select(PayrollRunItem)
            .where(PayrollRunItem.payroll_run_id == payroll_run.id, PayrollRunItem.deleted_at.is_(None))
            .options(selectinload(PayrollRunItem.employee))
        )
    )


def _employee_name(item: PayrollRunItem) -> str:
    emp = item.employee
    if not emp:
        return str(item.employee_id)
    name = f"{emp.first_name or ''} {emp.last_name or ''}".strip()
    return name or emp.employee_code or str(emp.id)


def generate_employee_sheet(db: Session, payroll_run: PayrollRun, company: CompanySettings) -> str:
    """FULL_TIME employees — component-level breakdown from breakdown_json."""
    items = [i for i in _load_items_with_employees(db, payroll_run) if (i.breakdown_json or {}).get("employment_type") == "FULL_TIME"]

    wb = Workbook()
    ws = wb.active
    ws.title = "Employee Salary Sheet"
    ws.append([company.company_name])
    ws.append([f"Employee Salary Sheet — {_month_label(payroll_run.month, payroll_run.year)}"])
    ws.append([])
    headers = [
        "Employee", "Employee Code", "Structure", "Days Worked", "Working Days",
        "Gross Salary", "BASIC", "HRA", "CONVEYANCE", "EDUCATION", "MEDICAL",
        "EMPLOYER_PF", "EPF", "PROFESSIONAL_TAX", "TDS",
        "Gross Earnings", "Total Deductions", "Net Salary",
        "Bank Account", "IFSC",
    ]
    ws.append(headers)

    for item in items:
        bd = item.breakdown_json or {}
        earnings = bd.get("earnings", {})
        deductions = bd.get("statutory_deductions", {})
        employer = bd.get("employer_contributions", {})
        ws.append([
            _employee_name(item),
            item.employee.employee_code if item.employee else "",
            bd.get("salary_structure_code", ""),
            bd.get("days_worked", ""),
            bd.get("working_days", ""),
            bd.get("gross_salary", ""),
            earnings.get("BASIC", 0),
            earnings.get("HRA", 0),
            earnings.get("CONVEYANCE", 0),
            earnings.get("EDUCATION", 0),
            earnings.get("MEDICAL", 0),
            employer.get("EMPLOYER_PF", 0),
            deductions.get("EPF", 0),
            deductions.get("PROFESSIONAL_TAX", 0),
            deductions.get("TDS", 0),
            bd.get("gross_earnings", ""),
            bd.get("total_deductions", ""),
            bd.get("net_salary", ""),
            item.bank_account_number,
            item.ifsc_code,
        ])

    filename = _new_filename("employee", payroll_run.month, payroll_run.year)
    wb.save(STORAGE_DIR / filename)
    return filename


def generate_consultant_sheet(db: Session, payroll_run: PayrollRun, company: CompanySettings) -> str:
    """CONSULTANT employees — fee/leave/TDS breakdown from breakdown_json."""
    items = [i for i in _load_items_with_employees(db, payroll_run) if (i.breakdown_json or {}).get("employment_type") == "CONSULTANT"]

    wb = Workbook()
    ws = wb.active
    ws.title = "Consultant Sheet"
    ws.append([company.company_name])
    ws.append([f"Consultant Sheet — {_month_label(payroll_run.month, payroll_run.year)}"])
    ws.append([])
    ws.append([
        "Consultant", "PAN", "Monthly Fee", "Days Worked", "Base Days",
        "Leave Deduction", "Extra Working Pay", "Actual Pay",
        "TDS Rate", "TDS", "Net Salary", "Bank Account", "IFSC",
    ])

    for item in items:
        bd = item.breakdown_json or {}
        ws.append([
            _employee_name(item),
            item.employee.pan_number if item.employee else "",
            bd.get("monthly_fee", ""),
            bd.get("days_worked", ""),
            bd.get("base_working_days", ""),
            bd.get("leave_deduction", ""),
            bd.get("extra_working_pay", ""),
            bd.get("actual_pay", ""),
            bd.get("tds_rate", ""),
            bd.get("tds", ""),
            bd.get("net_salary", ""),
            item.bank_account_number,
            item.ifsc_code,
        ])

    filename = _new_filename("consultant", payroll_run.month, payroll_run.year)
    wb.save(STORAGE_DIR / filename)
    return filename


def generate_bank_sheet(db: Session, payroll_run: PayrollRun, company: CompanySettings) -> str:
    """Bank upload sheet — all employees, debit account from CompanySettings."""
    items = _load_items_with_employees(db, payroll_run)

    wb = Workbook()
    ws = wb.active
    ws.title = "Bank Sheet"
    ws.append([f"Debit Account: {company.payroll_bank_account or ''} ({company.payroll_bank_name or ''})"])
    ws.append([f"Bank Sheet — {_month_label(payroll_run.month, payroll_run.year)}"])
    ws.append([])
    ws.append(["Employee", "Employee Code", "Bank Account", "IFSC", "Net Salary"])

    for item in items:
        ws.append([
            _employee_name(item),
            item.employee.employee_code if item.employee else "",
            item.bank_account_number,
            item.ifsc_code,
            item.net_salary,
        ])

    filename = _new_filename("bank", payroll_run.month, payroll_run.year)
    wb.save(STORAGE_DIR / filename)
    return filename


def generate_tds_sheet(db: Session, payroll_run: PayrollRun, company: CompanySettings) -> str:
    """Two tabs — Employee TDS and Consultant TDS — with PAN for consultants."""
    items = _load_items_with_employees(db, payroll_run)
    employee_items = [i for i in items if (i.breakdown_json or {}).get("employment_type") == "FULL_TIME"]
    consultant_items = [i for i in items if (i.breakdown_json or {}).get("employment_type") == "CONSULTANT"]

    wb = Workbook()
    ws1 = wb.active
    ws1.title = "Employee TDS"
    ws1.append([company.company_name])
    ws1.append([f"Employee TDS — {_month_label(payroll_run.month, payroll_run.year)}"])
    ws1.append([])
    ws1.append(["Employee", "PAN", "TDS"])
    for item in employee_items:
        bd = item.breakdown_json or {}
        ws1.append([
            _employee_name(item),
            item.employee.pan_number if item.employee else "",
            (bd.get("statutory_deductions", {}) or {}).get("TDS", 0),
        ])

    ws2 = wb.create_sheet("Consultant TDS")
    ws2.append([company.company_name])
    ws2.append([f"Consultant TDS — {_month_label(payroll_run.month, payroll_run.year)}"])
    ws2.append([])
    ws2.append(["Consultant", "PAN", "TDS"])
    for item in consultant_items:
        bd = item.breakdown_json or {}
        ws2.append([
            _employee_name(item),
            item.employee.pan_number if item.employee else "",
            bd.get("tds", 0),
        ])

    filename = _new_filename("tds", payroll_run.month, payroll_run.year)
    wb.save(STORAGE_DIR / filename)
    return filename