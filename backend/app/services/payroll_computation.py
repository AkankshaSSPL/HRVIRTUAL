from __future__ import annotations

import math
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.employee import Employee
from app.models.employee.models import EmploymentStatus, EmploymentType
from app.models.payroll import (
    EmployeeSalaryAssignment,
    EmployeeTDSConfig,
    PayrollConfig,
    SalaryAssignmentStatus,
    SalaryComponent,
    SalaryStructure,
)
from app.services.payroll_config_service import PayrollConfigService
from app.services.payroll_preparation_service import prepare_employee_payroll_input

# Employment statuses that still get paid. EXITED and SUSPENDED are skipped.
# This is a judgment call, not something confirmed against your data — flag
# if PROBATION/NOTICE_PERIOD employees should be handled differently.
PAYROLL_ELIGIBLE_STATUSES = {
    EmploymentStatus.ACTIVE,
    EmploymentStatus.PROBATION,
    EmploymentStatus.NOTICE_PERIOD,
}


def _rupee(value) -> int:
    """ROUND_HALF_UP to nearest rupee."""
    return int(Decimal(str(value)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _floor_rupee(value) -> int:
    """FLOOR to rupee — used for consultant TDS per statutory requirement."""
    return int(math.floor(float(value)))


def _employee_display_name(employee: Employee) -> str:
    name = f"{employee.first_name or ''} {employee.last_name or ''}".strip()
    return name or employee.employee_code or str(employee.id)


def get_active_assignment(db: Session, employee_id, target_date: date) -> EmployeeSalaryAssignment | None:
    return db.scalar(
        select(EmployeeSalaryAssignment)
        .where(
            EmployeeSalaryAssignment.employee_id == employee_id,
            EmployeeSalaryAssignment.status == SalaryAssignmentStatus.ACTIVE,
            EmployeeSalaryAssignment.deleted_at.is_(None),
            EmployeeSalaryAssignment.effective_from <= target_date,
        )
        .where(
            (EmployeeSalaryAssignment.effective_to.is_(None))
            | (EmployeeSalaryAssignment.effective_to >= target_date)
        )
        .order_by(EmployeeSalaryAssignment.effective_from.desc())
    )


def get_component(db: Session, component_code: str) -> SalaryComponent | None:
    return db.scalar(
        select(SalaryComponent).where(
            SalaryComponent.code == component_code,
            SalaryComponent.deleted_at.is_(None),
        )
    )


def get_monthly_tds(db: Session, employee_id, month: int, year: int) -> Decimal:
    """Reads EmployeeTDSConfig for the financial year. Returns 0 if no config
    exists — HR must add this manually when the CA provides workings; it is
    never auto-calculated."""
    fy_start = year if month >= 4 else year - 1
    financial_year = f"{fy_start}-{str(fy_start + 1)[-2:]}"
    config = db.scalar(
        select(EmployeeTDSConfig)
        .where(
            EmployeeTDSConfig.employee_id == employee_id,
            EmployeeTDSConfig.financial_year == financial_year,
            EmployeeTDSConfig.effective_from <= date(year, month, 1),
            EmployeeTDSConfig.deleted_at.is_(None),
        )
        .order_by(EmployeeTDSConfig.effective_from.desc())
    )
    return config.monthly_tds if config else Decimal("0")


def evaluate_component(item, component: SalaryComponent, resolved: dict, gross: float) -> float:
    """Evaluate a SalaryStructureItem to a rupee amount.
    FIXED      -> calculation_value
    PERCENTAGE -> (reference_component or gross) * calculation_value / 100
    FORMULA    -> eval() against `resolved`, no builtins, GROSS/CTC aliases
    """
    calc_type = (item.calculation_type or component.calculation_type or "").upper()
    val = float(item.calculation_value if item.calculation_value is not None else (component.calculation_value or 0))
    ref = item.reference_component_code or component.reference_component_code

    if calc_type == "FIXED":
        return val
    if calc_type == "PERCENTAGE":
        base = resolved.get(ref, gross) if ref else gross
        return base * (val / 100.0)
    if calc_type == "FORMULA":
        formula = item.formula or component.formula or ""
        safe_env = {**resolved, "GROSS": gross, "CTC": gross}
        try:
            return float(eval(formula, {"__builtins__": {}}, safe_env))  # noqa: S307
        except Exception:
            return 0.0
    return 0.0


def _compute_fulltime(db: Session, employee: Employee, config: PayrollConfig, month: int, year: int) -> dict | None:
    if not employee.bank_account_number or not employee.ifsc_code:
        return None

    target_date = date(year, month, 1)
    assignment = get_active_assignment(db, employee.id, target_date)
    if not assignment:
        return None

    structure = db.get(SalaryStructure, assignment.salary_structure_id)
    if not structure:
        return None
    items = sorted(structure.items, key=lambda x: x.sort_order)
    gross = float(assignment.gross_salary)

    resolved: dict = {"CTC": gross, "GROSS": gross}
    earnings: dict[str, float] = {}
    employer_contribs: dict[str, float] = {}
    for item in items:
        component = get_component(db, item.component_code)
        if not component:
            continue
        raw = evaluate_component(item, component, resolved, gross)
        resolved[item.component_code] = raw
        comp_type = (component.type or "").upper()
        if comp_type == "EARNING":
            earnings[item.component_code] = raw
        elif comp_type == "EMPLOYER_CONTRIBUTION":
            employer_contribs[item.component_code] = _rupee(raw)

    # Pro-rating via the real LOP/attendance service, not an invented query.
    lop_input = prepare_employee_payroll_input(db, employee_id=employee.id, month=month, year=year)
    working_days = lop_input["working_days"] or config.employee_base_working_days
    lop_days = lop_input["lop_days"]
    days_worked = max(0.0, working_days - lop_days)
    ratio = (days_worked / working_days) if working_days else 1.0

    earnings = {code: _rupee(value * ratio) for code, value in earnings.items()}

    basic = float(earnings.get("BASIC", 0))
    epf_wages = min(basic, float(config.epf_wage_cap))
    epf = _rupee(epf_wages * float(config.epf_employee_rate))
    employer_pf = _rupee(epf_wages * float(config.epf_employer_rate))
    professional_tax = PayrollConfigService(db).get_professional_tax(basic)
    tds = int(get_monthly_tds(db, employee.id, month, year))

    gross_earnings = sum(earnings.values())
    total_deductions = epf + professional_tax + tds
    net_salary = gross_earnings - total_deductions

    return {
        "employment_type": "FULL_TIME",
        "salary_structure_code": structure.code,
        "days_worked": days_worked,
        "working_days": working_days,
        "lop_days": lop_days,
        "pro_rate_ratio": round(ratio, 4),
        "gross_salary": gross,
        "earnings": earnings,
        "employer_contributions": {"EMPLOYER_PF": employer_pf, **employer_contribs},
        "statutory_deductions": {"EPF": epf, "PROFESSIONAL_TAX": professional_tax, "TDS": tds},
        "other_deductions": {},
        "gross_earnings": gross_earnings,
        "total_deductions": total_deductions,
        "net_salary": net_salary,
        # for the PayrollRunItem row
        "_row_gross_salary": gross,
        "_row_deductions": total_deductions,
        "_row_lop_days": lop_days,
        "_row_net_salary": net_salary,
    }


def _compute_consultant(db: Session, employee: Employee, config: PayrollConfig, month: int, year: int) -> dict | None:
    if not employee.bank_account_number or not employee.ifsc_code or not employee.current_salary:
        return None

    fee = float(employee.current_salary)
    base_days = config.consultant_base_working_days
    tds_rate = float(config.consultant_tds_rate)

    lop_input = prepare_employee_payroll_input(db, employee_id=employee.id, month=month, year=year)
    working_days = lop_input["working_days"] or base_days
    lop_days = lop_input["lop_days"]
    days_worked = max(0.0, working_days - lop_days)

    leave_deduction = _rupee(fee * (base_days - days_worked) / base_days) if days_worked < base_days else 0
    extra_working_pay = _rupee(fee * (days_worked - base_days) / base_days) if days_worked > base_days else 0
    actual_pay = _rupee(fee) - leave_deduction + extra_working_pay
    tds = _floor_rupee(actual_pay * tds_rate)  # FLOOR, not ROUND — statutory
    net_salary = actual_pay - tds

    return {
        "employment_type": "CONSULTANT",
        "monthly_fee": fee,
        "days_worked": days_worked,
        "base_working_days": base_days,
        "leave_deduction": leave_deduction,
        "extra_working_pay": extra_working_pay,
        "arrears": 0,
        "insurance_premium": 0,
        "advance_deduction": 0,
        "actual_pay": actual_pay,
        "tds_rate": tds_rate,
        "tds": tds,
        "net_salary": net_salary,
        # for the PayrollRunItem row
        "_row_gross_salary": fee,
        "_row_deductions": tds,
        "_row_lop_days": lop_days,
        "_row_net_salary": net_salary,
    }


def compute_payroll_run(db: Session, month: int, year: int) -> tuple[list[dict], list[str]]:
    """Returns (line_items, skipped_names). line_items are dicts matching
    PayrollRunItem's constructor kwargs (minus payroll_run_id, which the
    caller supplies)."""
    config = PayrollConfigService(db).get()

    employees = db.scalars(
        select(Employee).where(
            Employee.deleted_at.is_(None),
            Employee.employment_status.in_(PAYROLL_ELIGIBLE_STATUSES),
        )
    ).all()

    line_items: list[dict] = []
    skipped: list[str] = []

    for employee in employees:
        if employee.employment_type == EmploymentType.CONSULTANT:
            breakdown = _compute_consultant(db, employee, config, month, year)
        else:
            breakdown = _compute_fulltime(db, employee, config, month, year)

        if breakdown is None:
            skipped.append(_employee_display_name(employee))
            continue

        row = {k[len("_row_"):]: v for k, v in breakdown.items() if k.startswith("_row_")}
        public_breakdown = {k: v for k, v in breakdown.items() if not k.startswith("_row_")}

        line_items.append({
            "employee_id": employee.id,
            "gross_salary": row["gross_salary"],
            "deductions": row["deductions"],
            "lop_days": row["lop_days"],
            "net_salary": row["net_salary"],
            "bank_account_number": employee.bank_account_number,
            "ifsc_code": employee.ifsc_code,
            "breakdown_json": public_breakdown,
        })

    return line_items, skipped