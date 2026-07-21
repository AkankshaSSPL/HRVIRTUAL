import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.payroll import SalaryComponent

STANDARD_COMPONENT_TYPES = {
    "BASIC": "earning",
    "HRA": "earning",
    "CA": "earning",
    "CONVEYANCE_ALLOWANCE": "earning",
    "EDUCATION_ALLOWANCE": "earning",
    "MEDICAL_ALLOWANCE": "earning",
    "SPECIAL_ALLOWANCE": "earning",
    "EMPLOYER_PF": "employer_contribution",
    "EMPLOYEE_PF": "deduction",
    "PF": "deduction",
    "PT": "deduction",
    "PROFESSIONAL_TAX": "deduction",
    "TDS": "deduction",
}


def normalize_code(name: str) -> str:
    code = re.sub(r"[^A-Za-z0-9]+", "_", name.strip()).strip("_")
    return code.upper()[:50]


def _strip_component_action(command: str) -> str:
    command = command.strip()
    command = re.sub(r"^(?:create|add|update|change|remove|delete)\s+", "", command, flags=re.IGNORECASE).strip()
    command = re.sub(r"^(?:salary\s+)?component\s+", "", command, flags=re.IGNORECASE).strip()
    return command


def parse_salary_component_command(command: str) -> dict[str, Any]:
    command = _strip_component_action(command)
    normalized = command.lower()

    split = re.split(r"\s+(?:as|with|to)\s+", command, maxsplit=1, flags=re.IGNORECASE)
    name = split[0].strip()
    spec = split[1].strip() if len(split) > 1 else ""
    if not spec:
        natural = re.match(r"^(.+?)\s+((?:earning|deduction|fixed|percentage|formula)\b.*|\d+(?:\.\d+)?\s*%.*|(?:₹|rs\.?\s*)?\d[\d,]*(?:\.\d+)?.*)$", name, flags=re.IGNORECASE)
        if natural:
            name = natural.group(1).strip()
            spec = natural.group(2).strip()

    if not name:
        name = "Salary Component"

    name_lower = name.lower()
    type_value = "earning"
    if "deduction" in normalized or "deduction" in name_lower or "tax" in name_lower or "pf" in name_lower or "tds" in name_lower or "loan" in name_lower:
        type_value = "deduction"
    elif "earning" in normalized or "salary" in name_lower or "hra" in name_lower or "basic" in name_lower:
        type_value = "earning"

    calculation_type = "fixed"
    calculation_value = None
    formula = None
    reference_component_code = None

    percent_match = re.search(r"(\d+(?:\.\d+)?)\s*%", spec)
    amount_match = re.search(r"(?:₹|rs\.?\s*)([\d,]+(?:\.\d+)?)", spec, flags=re.IGNORECASE)
    if not amount_match:
        amount_match = re.search(r"([\d,]+(?:\.\d+)?)", spec)
    if amount_match and not re.search(r"\d", amount_match.group(1)):
        amount_match = None
    reference_match = re.search(r"of\s+([A-Za-z][A-Za-z0-9\s]+)", spec, flags=re.IGNORECASE)

    if percent_match:
        calculation_type = "percentage"
        calculation_value = float(percent_match.group(1).replace(",", ""))
        reference_component_code = normalize_code(reference_match.group(1)) if reference_match else None
        formula = f"{calculation_value}% of {reference_component_code or 'base'}"
    elif "percentage" in spec or "percent" in spec:
        calculation_type = "percentage"
    elif amount_match:
        calculation_type = "fixed"
        calculation_value = float(amount_match.group(1).replace(",", ""))
    elif "formula" in spec or any(sym in spec for sym in ["+", "-", "*", "/"]):
        calculation_type = "formula"
        formula = spec
    elif "earning" in spec or "deduction" in spec:
        calculation_type = "fixed"

    taxable = False if type_value == "deduction" else True
    active = True

    code = normalize_code(name)
    if code == "":
        code = "SALARY_COMPONENT"
    type_value = STANDARD_COMPONENT_TYPES.get(code, type_value)

    return {
        "name": name,
        "code": code,
        "type": type_value,
        "calculation_type": calculation_type,
        "calculation_value": calculation_value,
        "formula": formula,
        "reference_component_code": reference_component_code,
        "taxable": taxable,
        "active": active,
    }


def validate_salary_component_data(component_data: dict[str, Any]) -> list[str]:
    calculation_type = component_data.get("calculation_type")
    if calculation_type == "percentage" and component_data.get("calculation_value") is None:
        return ["percentage value"]
    if calculation_type == "fixed" and component_data.get("calculation_value") is None:
        return ["fixed amount"]
    if calculation_type == "formula" and not component_data.get("formula"):
        return ["formula"]
    return []


def component_query_from_command(command: str) -> str:
    text = _strip_component_action(command)
    text = re.split(r"\s+(?:as|with|to)\s+", text, maxsplit=1, flags=re.IGNORECASE)[0]
    return text.strip()


def list_salary_components(db: Session) -> list[dict[str, Any]]:
    components = db.scalars(
        select(SalaryComponent).where(SalaryComponent.deleted_at.is_(None)).order_by(SalaryComponent.name.asc())
    ).all()
    return [component_to_dict(component) for component in components]


def find_salary_component(db: Session, query: str) -> SalaryComponent | None:
    code = normalize_code(query)
    return db.scalar(
        select(SalaryComponent)
        .where(SalaryComponent.deleted_at.is_(None))
        .where((SalaryComponent.code == code) | (SalaryComponent.name.ilike(f"%{query}%")))
        .limit(1)
    )


def component_to_dict(component: SalaryComponent) -> dict[str, Any]:
    return {
        "id": str(component.id),
        "name": component.name,
        "code": component.code,
        "type": component.type,
        "calculation_type": component.calculation_type,
        "calculation_value": float(component.calculation_value) if component.calculation_value is not None else None,
        "formula": component.formula,
        "reference_component_code": component.reference_component_code,
        "taxable": component.taxable,
        "active": component.active,
        "created_at": component.created_at.isoformat() if component.created_at else None,
        "updated_at": component.updated_at.isoformat() if component.updated_at else None,
    }
