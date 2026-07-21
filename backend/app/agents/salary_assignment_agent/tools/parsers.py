from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Any


def parse_effective_date(text: str) -> date:
    normalized = text.lower()
    today = date.today()
    if "today" in normalized:
        return today
    if "tomorrow" in normalized:
        return today + timedelta(days=1)
    if "next month" in normalized:
        year = today.year + (1 if today.month == 12 else 0)
        month = 1 if today.month == 12 else today.month + 1
        return date(year, month, 1)

    iso_match = re.search(r"(\d{4}-\d{2}-\d{2})", text)
    if iso_match:
        return date.fromisoformat(iso_match.group(1))

    month_match = re.search(r"(?:from|effective\s+from)\s+(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?", text, re.IGNORECASE)
    if month_match:
        month_names = {
            "jan": 1,
            "january": 1,
            "feb": 2,
            "february": 2,
            "mar": 3,
            "march": 3,
            "apr": 4,
            "april": 4,
            "may": 5,
            "jun": 6,
            "june": 6,
            "jul": 7,
            "july": 7,
            "aug": 8,
            "august": 8,
            "sep": 9,
            "september": 9,
            "oct": 10,
            "october": 10,
            "nov": 11,
            "november": 11,
            "dec": 12,
            "december": 12,
        }
        month = month_names.get(month_match.group(2).lower())
        if month:
            return date(int(month_match.group(3) or today.year), month, int(month_match.group(1)))

    return today


def parse_amount(text: str) -> float | None:
    matches = list(re.finditer(r"(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|lakh|lac|l)?\b", text, re.IGNORECASE))
    if not matches:
        return None
    match = matches[-1] if any(word in text.lower() for word in ("update", "change", "revise", "increase", "decrease")) else matches[0]
    amount = float(match.group(1).replace(",", ""))
    unit = (match.group(2) or "").lower()
    if unit in {"k", "thousand"}:
        amount *= 1_000
    elif unit in {"lakh", "lac", "l"}:
        amount *= 100_000
    return amount


def parse_salary_assignment_command(command: str) -> dict[str, Any]:
    normalized = command.strip()
    shorthand_match = re.search(
        r"\bsalary\s+structure\s*(?:is|:|-|=)?\s*(?:the\s+)?(?P<structure>[A-Za-z][A-Za-z&./-]*?)\s+(?P<employee>[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)+)\s+(?:salary|gross|ctc|pay)\b",
        normalized,
    )
    if shorthand_match:
        return {
            "employee_name": shorthand_match.group("employee").strip(),
            "structure_name": shorthand_match.group("structure").strip(),
            "gross_salary": parse_amount(normalized),
            "effective_from": parse_effective_date(normalized),
            "reason": normalized,
        }

    structure_match = re.search(
        r"assign\s+(.+?)\s+(?:salary\s+)?structure\s+to\s+(.+?)(?=\s+(?:with|for|effective|from|whose|his|her|gross|salary|ctc|pay|at|on)\b|[,.;]|$)",
        normalized,
        re.IGNORECASE,
    )
    if structure_match:
        structure_name = structure_match.group(1).strip()
        employee_name = structure_match.group(2).strip()
    else:
        employee_match = re.search(
            r"\bto\s+([a-z][a-z\s.'-]+?)(?=\s+(?:with|for|effective|from|whose|his|her|gross|salary|ctc|pay|at|on)\b|[,.;]|$)",
            normalized,
            re.IGNORECASE,
        )
        structure_match = re.search(r"assign\s+(.+?)\s+(?:salary\s+)?structure", normalized, re.IGNORECASE)
        employee_name = employee_match.group(1).strip() if employee_match else ""
        structure_name = structure_match.group(1).strip() if structure_match else ""
        if not employee_name:
            employee_match = re.search(
                r"\b(?:assign|update|change|set)\s+([A-Za-z][A-Za-z\s.'-]*?)(?=\s+(?:salary|pay|ctc)\b)",
                normalized,
                re.IGNORECASE,
            )
            employee_name = employee_match.group(1).strip() if employee_match else ""
        if not structure_name:
            structure_match = re.search(
                r"\b(?:salary\s+structure|structure)\s*(?:is|:|-|=)?\s*(?:the\s+)?([A-Za-z][A-Za-z\s&./-]*?)(?=\s+(?:with|for|effective|from|whose|his|her|gross|salary|ctc|pay|at|on)\b|[,.;]|$)",
                normalized,
                re.IGNORECASE,
            )
            structure_name = structure_match.group(1).strip() if structure_match else ""

    return {
        "employee_name": employee_name,
        "structure_name": structure_name,
        "gross_salary": parse_amount(normalized),
        "effective_from": parse_effective_date(normalized),
        "reason": normalized,
    }


def parse_salary_revision_command(command: str) -> dict[str, Any]:
    employee_match = re.search(r"(?:increase|decrease|revise|update|change)\s+(.+?)\s+salary", command, re.IGNORECASE)
    percent_match = re.search(r"(\d+(?:\.\d+)?)\s*%", command)
    amount = parse_amount(command)
    return {
        "employee_name": employee_match.group(1).strip() if employee_match else "",
        "percent": float(percent_match.group(1)) if percent_match else None,
        "amount": amount if not percent_match else None,
        "effective_from": parse_effective_date(command),
        "direction": "DECREASE" if "decrease" in command.lower() else "INCREASE",
        "reason": command.strip(),
    }


def parse_salary_history_query(command: str) -> str:
    match = re.search(r"(?:show|view)\s+(.+?)\s+salary", command, re.IGNORECASE)
    if match:
        return match.group(1).replace("history of", "").replace("breakup for", "").strip()
    match = re.search(r"(?:for|of)\s+([a-z][a-z\s.]+)$", command, re.IGNORECASE)
    return match.group(1).strip() if match else ""
