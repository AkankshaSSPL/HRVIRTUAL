from __future__ import annotations

import calendar
import math
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.employee import Employee
from app.models.employee.models import EmploymentStatus
from app.models.payroll import (
    EmployeeSalaryAssignment,
    EmployeeTDSConfig,
    PayType,
    PayTypeRule,
    PayrollConfig,
    SalaryAssignmentStatus,
    SalaryComponent,
    SalaryStructure,
)
from app.services.payroll_config_service import PayrollConfigService
from app.services.payroll_preparation_service import prepare_employee_payroll_input

# Employment statuses that still get paid.
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
    """Reads EmployeeTDSConfig for the financial year. Returns 0 if no config exists."""
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
    """Evaluate a SalaryStructureItem to a rupee amount."""
    calc_type = (item.calculation_type or component.calculation_type or "").upper()
    val = float(item.calculation_value if item.calculation_value is not None else (component.calculation_value or 0))
    ref = item.reference_component_code or component.reference_component_code

    if calc_type == "FIXED":
        return val
    if calc_type in ("PERCENTAGE", "PERCENT_OF"):
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


def evaluate_pay_type_rule(
    rule: PayTypeRule,
    resolved: dict,
    gross: float,
    config: PayrollConfig,
    employee: Employee,
    db: Session,
    month: int,
    year: int,
    days_worked: float,
    base_days: float,
) -> float:
    """Evaluates dynamic pay type rules including fixed, percent, formula, statutory, and leave handlers."""
    calc_type = (rule.calc_type or "").upper()
    val = float(rule.value) if rule.value is not None else 0.0

    if calc_type == "FIXED":
        return val if val != 0.0 else gross
    if calc_type == "PERCENT_OF":
        base = resolved.get(rule.reference_code, gross) if rule.reference_code else gross
        return base * (val / 100.0)
    if calc_type == "FORMULA":
        formula = rule.formula or ""
        safe_env = {**resolved, "GROSS": gross, "CTC": gross}
        try:
            return float(eval(formula, {"__builtins__": {}}, safe_env))  # noqa: S307
        except Exception:
            return 0.0

    # Dynamic statutory handlers
    if calc_type == "STATUTORY_EPF":
        basic = float(resolved.get("BASIC", 0))
        epf_wages = min(basic, float(config.epf_wage_cap))
        return float(_rupee(epf_wages * float(config.epf_employee_rate)))

    if calc_type == "STATUTORY_PT":
        basic = float(resolved.get("BASIC", 0))
        return float(PayrollConfigService(db).get_professional_tax(month))

    if calc_type == "STATUTORY_TDS":
        return float(get_monthly_tds(db, employee.id, month, year))

    if calc_type == "LEAVE_DEDUCTION":
        if days_worked < base_days:
            return float(_rupee(gross * (base_days - days_worked) / base_days))
        return 0.0

    if calc_type == "FLAT_TDS":
        tds_rate = val / 100.0 if val > 0 else float(config.consultant_tds_rate)
        leave_deduction = resolved.get("LEAVE_DEDUCTION", 0.0)
        actual_pay = gross - leave_deduction
        return float(_floor_rupee(actual_pay * tds_rate))

    return 0.0


def compute_employee_payroll(db: Session, employee: Employee, config: PayrollConfig, month: int, year: int) -> dict | None:
    if not employee.bank_account_number or not employee.ifsc_code:
        return None

    # Retrieve matching PayType master
    emp_type_code = employee.employment_type or "FULL_TIME"
    pay_type = db.scalar(
        select(PayType).where(PayType.code == emp_type_code, PayType.active == True, PayType.deleted_at.is_(None))
    )

    _, last_day = calendar.monthrange(year, month)
    target_date = date(year, month, last_day)

    # Determine base working days & LOP input
    lop_input = prepare_employee_payroll_input(db, employee_id=employee.id, month=month, year=year)
    if pay_type and str(pay_type.proration_basis).strip().upper() == "FIXED_BASE_DAYS":
        base_days = float(pay_type.base_working_days or config.consultant_base_working_days)
    else:
        base_days = float(lop_input["working_days"] or config.employee_base_working_days)

    lop_days = float(lop_input["lop_days"])
    days_worked = max(0.0, base_days - lop_days)
    ratio = (days_worked / base_days) if base_days else 1.0

    # Branch structure resolution based on pay_basis
    pay_basis = pay_type.pay_basis if pay_type else ("FLAT_FEE" if emp_type_code == "CONSULTANT" else "STRUCTURE")

    resolved: dict = {}
    earnings: dict[str, float] = {}
    deductions: dict[str, float] = {}
    employer_contribs: dict[str, float] = {}
    structure_code = None

    if pay_basis == "STRUCTURE":
        assignment = get_active_assignment(db, employee.id, target_date)
        if not assignment:
            return None
        structure = db.get(SalaryStructure, assignment.salary_structure_id)
        if not structure:
            return None

        structure_code = structure.code
        gross = float(assignment.gross_salary)
        resolved["CTC"] = gross
        resolved["GROSS"] = gross

        # Process standard salary structure items
        items = sorted(structure.items, key=lambda x: x.sort_order)
        for item in items:
            component = get_component(db, item.component_code)
            if not component:
                continue
            raw = evaluate_component(item, component, resolved, gross)
            prorated_val = _rupee(raw * ratio)
            resolved[item.component_code] = prorated_val
            
            comp_type = (component.type or "").upper()
            if comp_type == "EARNING":
                earnings[item.component_code] = prorated_val
            elif comp_type == "EMPLOYER_CONTRIBUTION":
                employer_contribs[item.component_code] = prorated_val

        # Employer PF contribution
        basic = float(earnings.get("BASIC", 0))
        epf_wages = min(basic, float(config.epf_wage_cap))
        employer_pf = _rupee(epf_wages * float(config.epf_employer_rate))
        employer_contribs["EMPLOYER_PF"] = employer_pf

    else:  # FLAT_FEE basis
        if not employee.current_salary:
            return None
        gross = float(employee.current_salary)
        resolved["CTC"] = gross
        resolved["GROSS"] = gross
        resolved["MONTHLY_FEE"] = gross

    # Apply configured PayType rules in order
    rules = sorted(pay_type.rules, key=lambda r: r.sequence) if pay_type else []
    
    # Process dynamic rules
    for rule in rules:
        val = evaluate_pay_type_rule(rule, resolved, gross, config, employee, db, month, year, days_worked, base_days)
        if rule.prorate:
            val = _rupee(val * ratio)
        resolved[rule.code] = val

        kind = (rule.kind or "").upper()
        if kind == "EARNING":
            earnings[rule.code] = val
        elif kind == "DEDUCTION":
            deductions[rule.code] = val
        elif kind == "EMPLOYER_CONTRIBUTION":
            employer_contribs[rule.code] = val

    # Standard fallback if pay type rules are unseeded/empty
    if not rules:
        if pay_basis == "STRUCTURE":
            basic = float(earnings.get("BASIC", 0))
            epf_wages = min(basic, float(config.epf_wage_cap))
            deductions["EPF"] = _rupee(epf_wages * float(config.epf_employee_rate))
            deductions["PROFESSIONAL_TAX"] = float(PayrollConfigService(db).get_professional_tax(month))
            deductions["TDS"] = int(get_monthly_tds(db, employee.id, month, year))
        else:
            leave_deduction = _rupee(gross * (base_days - days_worked) / base_days) if days_worked < base_days else 0
            actual_pay = gross - leave_deduction
            tds = _floor_rupee(actual_pay * float(config.consultant_tds_rate))
            
            return {
                "employment_type": emp_type_code,
                "monthly_fee": gross,
                "days_worked": days_worked,
                "base_working_days": base_days,
                "leave_deduction": leave_deduction,
                "extra_working_pay": 0,
                "actual_pay": actual_pay,
                "tds_rate": float(config.consultant_tds_rate),
                "tds": tds,
                "net_salary": actual_pay - tds,
                "_row_gross_salary": gross,
                "_row_deductions": tds,
                "_row_lop_days": lop_days,
                "_row_net_salary": actual_pay - tds,
            }

    gross_earnings = sum(earnings.values()) if pay_basis == "STRUCTURE" else (gross - deductions.get("LEAVE_DEDUCTION", 0.0))
    total_deductions = sum(deductions.values()) - deductions.get("LEAVE_DEDUCTION", 0.0) if pay_basis == "FLAT_FEE" else sum(deductions.values())
    net_salary = gross_earnings - total_deductions

    breakdown = {
        "employment_type": emp_type_code,
        "salary_structure_code": structure_code,
        "days_worked": days_worked,
        "working_days": base_days,
        "lop_days": lop_days,
        "pro_rate_ratio": round(ratio, 4),
        "gross_salary": gross,
        "earnings": earnings,
        "employer_contributions": employer_contribs,
        "statutory_deductions": deductions,
        "other_deductions": {},
        "gross_earnings": gross_earnings,
        "total_deductions": total_deductions,
        "net_salary": net_salary,
        "_row_gross_salary": gross,
        "_row_deductions": total_deductions,
        "_row_lop_days": lop_days,
        "_row_net_salary": net_salary,
    }

    return breakdown


def compute_payroll_run(db: Session, month: int, year: int) -> tuple[list[dict], list[str]]:
    """Returns (line_items, skipped_names) driven by dynamic PayType logic."""
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
        breakdown = compute_employee_payroll(db, employee, config, month, year)

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