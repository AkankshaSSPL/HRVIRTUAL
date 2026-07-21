import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.payroll import SalaryComponent
from app.agents.payroll_agent.tools import normalize_code

COMPONENT_CODE_ALIASES = {
    "PROFESSIONAL_TAX": "PT",
    "PROFESSION_TAX": "PT",
    "CONVEYANCE_ALLOWANCE": "CA",
    "BASIC_SALARY": "BASIC",
    "EMPLOYER_PF": "EMPLOYER_PF",
    "EMPLOYEE_PF_DEDUCTION": "EMPLOYEE_PF",
    "EMPLOYEE_PF": "EMPLOYEE_PF",
    "EDUCATION_ALLOWANCE": "EDUCATION_ALLOWANCE",
    "MEDICAL_ALLOWANCE": "MEDICAL_ALLOWANCE",
}

AUTO_COMPONENT_DEFINITIONS = {
    "BASIC": ("Basic", "earning"),
    "HRA": ("HRA", "earning"),
    "CA": ("Conveyance Allowance", "earning"),
    "EDUCATION_ALLOWANCE": ("Education Allowance", "earning"),
    "MEDICAL_ALLOWANCE": ("Medical Allowance", "earning"),
    "EMPLOYER_PF": ("Employer PF", "employer_contribution"),
    "EMPLOYEE_PF": ("Employee PF", "deduction"),
    "PT": ("Professional Tax", "deduction"),
    "TDS": ("TDS", "deduction"),
}


def parse_salary_structure_command(command: str) -> dict[str, Any]:
    # Improved parser: extracts a clean structure name and component specs.
    normalized = command.strip()
    ctc_policy = _parse_ctc_policy_structure(normalized)
    if ctc_policy:
        return ctc_policy
    # Try to capture the name between "create" and "salary structure" (allows newlines)
    # Accept 'create' or 'save' as action verbs
    m = re.search(r"(?:create|save|add|update|change|remove|delete)\s+(.+?)\s+salary\s+structure", normalized, flags=re.IGNORECASE | re.DOTALL)
    if m:
        raw_name = m.group(1).strip()
    else:
        # Fallback: capture between 'create'/'save' and first 'with' or the word 'salary'
        m2 = re.search(r"(?:create|save|add|update|change|remove|delete)\s+(.+?)\s+(?:with|salary)", normalized, flags=re.IGNORECASE | re.DOTALL)
        raw_name = m2.group(1).strip() if m2 else "Salary Structure"

    # Clean name: remove stray punctuation and normalize whitespace
    name = re.sub(r"[\r\n]+", " ", raw_name)
    name = re.sub(r"\s+", " ", name).strip()

    # Extract component specs after "with"
    specs_part = ""
    m3 = re.search(r"with\s+(.+)$", normalized, flags=re.IGNORECASE | re.DOTALL)
    if m3:
        specs_part = m3.group(1)

    # Split by comma or and
    parts = re.split(r",|\band\b", specs_part)
    items: list[dict[str, Any]] = []
    for p in parts:
        token = p.strip()
        if not token:
            continue
        # percentage e.g. "HRA 20%" or "PF 12% of Basic"
        pct = re.search(r"([\d.]+)\s*%", token)
        amt = re.search(r"(?:₹|rs\.?\s*)?([\d,]+(?:\.\d+)?)", token, flags=re.IGNORECASE)
        ref = re.search(r"of\s+([A-Za-z0-9 _]+)", token, flags=re.IGNORECASE)
        # Component names may contain multiple words, for example
        # "Professional Tax ₹200". Keep everything before the first amount.
        comp_name = re.split(r"(?:₹|â‚¹|rs\.?\s*)?\d", token, maxsplit=1, flags=re.IGNORECASE)[0].strip()

        percentage_first = re.fullmatch(
            r"(?P<value>\d+(?:\.\d+)?)\s*%\s+of\s+(?P<component>[A-Za-z0-9_-]+)(?:\s+(?P<reference>.+))?",
            token,
            flags=re.IGNORECASE,
        )
        if percentage_first:
            comp_name = percentage_first.group("component").strip()
            reference_name = (percentage_first.group("reference") or "Gross Salary").strip()
            reference_code = normalize_code(reference_name)
            items.append({
                "component_name": comp_name,
                "component_code": normalize_code(comp_name),
                "calculation_type": "percentage",
                "calculation_value": float(percentage_first.group("value")),
                "reference_component_code": None if reference_code in {"GROSS", "GROSS_SALARY"} else reference_code,
            })
            continue

        comp_code = normalize_code(comp_name or token)

        if pct:
            calculation_type = "percentage"
            calculation_value = float(pct.group(1).replace(",", ""))
            reference = normalize_code(ref.group(1)) if ref else None
            items.append({
                "component_name": comp_name,
                "component_code": comp_code,
                "calculation_type": calculation_type,
                "calculation_value": calculation_value,
                "reference_component_code": reference,
            })
        elif amt and re.search(r"\d", token):
            calculation_type = "fixed"
            calculation_value = float(amt.group(1).replace(",", ""))
            items.append({
                "component_name": comp_name,
                "component_code": comp_code,
                "calculation_type": calculation_type,
                "calculation_value": calculation_value,
                "reference_component_code": None,
            })
        else:
            # Unknown spec: treat as fixed zero
            items.append({
                "component_name": comp_name,
                "component_code": comp_code,
                "calculation_type": "fixed",
                "calculation_value": 0.0,
                "reference_component_code": None,
            })

    # Structure code: prefix with SS_ and use a clean slug
    struct_code = f"SS_{normalize_code(name)}" if name else "SS_SALARY_STRUCTURE"
    # If the user typed all-lowercase, present a title-cased friendly name
    friendly_name = name.title() if name == name.lower() else name
    return {"name": friendly_name, "code": struct_code, "items": items}


def _parse_ctc_policy_structure(command: str) -> dict[str, Any] | None:
    lower = command.lower()
    if "medical allowance" not in lower or "balance" not in lower:
        return None
    if "ctc" not in lower and "gross" not in lower:
        return None

    name_match = re.search(
        r"(?:create|save|add|update|change)\s+(.+?)\s+salary\s+structure",
        command,
        flags=re.IGNORECASE | re.DOTALL,
    )
    raw_name = name_match.group(1).strip() if name_match else "Employee CTC"
    name = re.sub(r"\s+", " ", raw_name).strip()
    name = name.title() if name == name.lower() else name

    def percent_for(component: str, default: float) -> float:
        pattern = rf"{component}[^0-9%]{{0,80}}(\d+(?:\.\d+)?)\s*%"
        match = re.search(pattern, command, flags=re.IGNORECASE | re.DOTALL)
        return float(match.group(1)) if match else default

    def fixed_for(component: str, default: float) -> float:
        component_match = re.search(component, command, flags=re.IGNORECASE | re.DOTALL)
        if not component_match:
            return default
        window = command[component_match.end():component_match.end() + 180]
        match = re.search(r"(?:fixed\s*)?(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)", window, flags=re.IGNORECASE)
        return float(match.group(1).replace(",", "")) if match else default

    items = [
        {
            "component_name": "Basic",
            "component_code": "BASIC",
            "calculation_type": "percentage",
            "calculation_value": percent_for(r"basic(?:\s+salary)?", 40),
            "reference_component_code": "GROSS_SALARY",
        },
        {
            "component_name": "HRA",
            "component_code": "HRA",
            "calculation_type": "percentage",
            "calculation_value": percent_for(r"hra", 60),
            "reference_component_code": "BASIC",
        },
        {
            "component_name": "Conveyance Allowance",
            "component_code": "CA",
            "calculation_type": "percentage",
            "calculation_value": percent_for(r"(?:conveyance\s+allowance|ca)", 50),
            "reference_component_code": "BASIC",
        },
        {
            "component_name": "Education Allowance",
            "component_code": "EDUCATION_ALLOWANCE",
            "calculation_type": "percentage",
            "calculation_value": percent_for(r"education\s+allowance", 10),
            "reference_component_code": "BASIC",
        },
        {
            "component_name": "Employer PF",
            "component_code": "EMPLOYER_PF",
            "calculation_type": "fixed",
            "calculation_value": fixed_for(r"employer\s+pf", 2042),
            "reference_component_code": None,
        },
        {
            "component_name": "Medical Allowance",
            "component_code": "MEDICAL_ALLOWANCE",
            "calculation_type": "balance",
            "calculation_value": None,
            "formula": "GROSS_SALARY - (BASIC + HRA + CA + EDUCATION_ALLOWANCE + EMPLOYER_PF)",
            "reference_component_code": None,
        },
        {
            "component_name": "Employee PF",
            "component_code": "EMPLOYEE_PF",
            "calculation_type": "fixed",
            "calculation_value": fixed_for(r"employee\s+pf(?:\s+deduction)?", 1800),
            "reference_component_code": None,
        },
        {
            "component_name": "Professional Tax",
            "component_code": "PT",
            "calculation_type": "fixed",
            "calculation_value": fixed_for(r"professional\s+tax", 200),
            "reference_component_code": None,
        },
    ]
    return {"name": name, "code": f"SS_{normalize_code(name)}", "items": items}


def structure_query_from_command(command: str) -> str:
    parsed = parse_salary_structure_command(command)
    return parsed["name"]


def validate_components(db: Session, items: list[dict[str, Any]]) -> tuple[list[str], list[dict[str, Any]]]:
    missing: list[str] = []
    validated: list[dict[str, Any]] = []
    for it in items:
        code = it.get("component_code")
        name = it.get("component_name") or ""
        lookup_code = COMPONENT_CODE_ALIASES.get(code, code)
        # Try match by code first, then by name (case-insensitive contains)
        conditions = [SalaryComponent.code == lookup_code]
        if name:
            conditions.append(SalaryComponent.name.ilike(f"%{name}%"))
        comp = db.scalar(
            select(SalaryComponent).where(
                SalaryComponent.deleted_at.is_(None),
                or_(*conditions),
            )
        )
        if not comp:
            definition = AUTO_COMPONENT_DEFINITIONS.get(lookup_code)
            if definition:
                now = datetime.now(timezone.utc)
                comp = SalaryComponent(
                    name=definition[0],
                    code=lookup_code,
                    type=definition[1],
                    calculation_type=it.get("calculation_type") or "fixed",
                    calculation_value=it.get("calculation_value"),
                    formula=it.get("formula"),
                    reference_component_code=it.get("reference_component_code"),
                    taxable=definition[1] == "earning",
                    active=True,
                    created_at=now,
                    updated_at=now,
                )
                db.add(comp)
                db.flush()
            else:
                missing.append(code)
        elif lookup_code != code:
            it = {**it, "component_code": lookup_code, "component_name": comp.name}
        validated.append(it)
    return missing, validated
