from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Any


ONBOARDING_REQUIRED_FIELDS = ["name", "joining_date", "manager", "email"]


def extract_onboarding_entities(text: str) -> dict[str, Any]:
    normalized = _normalize(text)
    normalized = _correct_common_typos(normalized)
    without_emails = re.sub(r"[\w.\-+]+@[\w.\-]+\.\w+", " ", normalized)
    entities: dict[str, Any] = {
        "name": _name(normalized),
        "designation": _designation(normalized),
        "department": _department(normalized),
        "experience": _experience(normalized),
        "joining_date": _joining_date(normalized),
        "manager": _manager(normalized),
        "salary": _salary(normalized),
        "salary_structure": _salary_structure(normalized),
        "employment_type": _employment_type(normalized),
        "location": _location(normalized),
        "shift": _shift(normalized),
        "email": _first(r"[\w.\-+]+@[\w.\-]+\.\w+", normalized),
        "phone": _first(r"(?:\+?\d[\d\s-]{8,}\d)", without_emails),
        "bank_account_number": _bank_account_number(normalized),
        "ifsc_code": _ifsc_code(normalized),
        "pan_number": _pan_number(normalized),
        "aadhaar_number": _aadhaar_number(normalized),
        "uan_number": _uan_number(normalized),
        "dob": _dob(normalized),
        "gender": _gender(normalized),
        "seat": _seat(normalized),
        "resume_uploaded": False,
    }
    return {key: value for key, value in entities.items() if value not in (None, "", [])}


def merge_entities(base: dict[str, Any] | None, updates: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base or {})
    for key, value in updates.items():
        if value not in (None, "", []):
            merged[key] = value
    return merged


def missing_onboarding_fields(entities: dict[str, Any]) -> list[str]:
    return [field for field in ONBOARDING_REQUIRED_FIELDS if not entities.get(field)]


def is_onboarding_intent(text: str) -> bool:
    normalized = text.lower()
    return any(keyword in normalized for keyword in ("onboard", "hire", "joining", "start onboarding"))


def is_start_confirmation(text: str) -> bool:
    normalized = text.lower().strip()
    return normalized in {"start onboarding", "start", "confirm", "looks good", "proceed", "submit for approval"} or "start onboarding" in normalized


def _normalize(text: str) -> str:
    text = text.replace("₹", " ₹ ").replace("â‚¹", " ₹ ").replace("Ã¢â€šÂ¹", " ₹ ")
    text = re.sub(r"[,;]+", ", ", text)
    return re.sub(r"\s+", " ", text).strip()


def _correct_common_typos(text: str) -> str:
    replacements = {
        r"\bdepartmet\b": "department",
        r"\bdeparment\b": "department",
        r"\bdeptartment\b": "department",
        r"\bjoing\b": "joining",
        r"\bjoinning\b": "joining",
        r"\bsalry\b": "salary",
        r"\bsallery\b": "salary",
        r"\bsallary\b": "salary",
        r"\brmployment\b": "employment",
        r"\bemployement\b": "employment",
        r"\bconsutant\b": "consultant",
        r"\bfulltime\b": "full time",
        r"\bfull\s+tiem\b": "full time",
        r"\bful\s+time\b": "full time",
    }
    for pattern, replacement in replacements.items():
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    return text


def _name(text: str) -> str | None:
    match = re.search(
        r"(?:onboard|hire|start onboarding for)\s+([A-Za-z][A-Za-z\s.]*?)(?=\s+(?:as\s+a|as\s+an|as|department|departmet|dept|experience|salary|joining|joing|his\s+manager|her\s+manager|manager|location|employment|from)\b|[.!?]|$)",
        text,
        re.IGNORECASE,
    )
    return _title(match.group(1)) if match else None


def _designation(text: str) -> str | None:
    labeled = _labeled_value(text, ("designation", "desig", "role", "title"))
    if labeled:
        return _title(labeled)
    match = re.search(
        r"\bas\s+(?:a|an)?\s*([A-Za-z][A-Za-z\s&./-]*?)(?=\s+(?:in|within)\s+(?:the\s+)?[A-Za-z][A-Za-z\s&./-]*?\s+department\b|\s+(?:department|dept|experience|salary|joining|manager\s+is|his\s+manager|her\s+manager|reports\s+to|under|location|employment|from)\b|[.!?]|$)",
        text,
        re.IGNORECASE,
    )
    return _title(match.group(1)) if match else None


def _department(text: str) -> str | None:
    match = re.search(
        r"\b(?:in|within)\s+(?:the\s+)?([A-Za-z][A-Za-z\s&./-]*?)\s+department\b",
        text,
        re.IGNORECASE,
    )
    if match:
        return _title(match.group(1))
    match = re.search(
        r"\bin\s+([A-Za-z][A-Za-z\s&./-]*?)(?=\s+(?:and\s+)?(?:full|part|contract|intern|consultant|employment|employee\s+type|salary|ctc|pay|location|shift|joining)\b|[.!?]|$)",
        text,
        re.IGNORECASE,
    )
    if match:
        return _title(_clean_entity_value(match.group(1)))
    labeled = _labeled_value(text, ("department", "departmet", "dept"))
    if labeled:
        return _title(_clean_entity_value(labeled))
    match = re.search(
        r"\b(?:department|dept)\s+(?:is\s+)?([A-Za-z][A-Za-z\s&./-]*?)(?=\s+(?:experience|salary|joining|manager|location|employment|from|his\s+salary|her\s+salary|salary\s+is|and\s+(?:full|part|contract|intern|consultant))\b|[.!?]|$)",
        text,
        re.IGNORECASE,
    )
    return _title(match.group(1)) if match else None


def _experience(text: str) -> str | None:
    return _first(r"\b\d+(?:\.\d+)?\+?\s*(?:years?|yrs?)\b", text, re.IGNORECASE)


def _joining_date(text: str) -> str | None:
    if re.search(r"\b(?:(?:joining|joing)(?:\s+date)?(?:\s+is)?|from)\s+today\b", text, re.IGNORECASE):
        return date.today().isoformat()
    if re.search(r"\b(?:(?:joining|joing)(?:\s+date)?(?:\s+is)?|from)\s+tomorrow\b", text, re.IGNORECASE):
        return (date.today() + timedelta(days=1)).isoformat()
    weekday_match = re.search(r"\b(?:(?:joining|joing)(?:\s+date)?(?:\s+is)?|from)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b", text, re.IGNORECASE)
    if weekday_match:
        return _next_weekday(weekday_match.group(1)).isoformat()
    iso_match = re.search(r"\b(?:(?:joining|joing)(?:\s+date)?(?:\s+is)?|from)\s+(\d{4}-\d{2}-\d{2})\b", text, re.IGNORECASE)
    return iso_match.group(1) if iso_match else None


def _manager(text: str) -> str | None:
    match = re.search(
        r"\b(?:manager|reporting\s+manager)\s*(?:is|:|-|=)\s+([A-Za-z][A-Za-z\s.]*?)(?=\s+(?:his\s+|her\s+)?(?:experience|salary|joining|department|dept|location|employment|from|in|shift)\b|[.!?]|$)",
        text,
        re.IGNORECASE,
    )
    if match:
        return _title(_clean_person_value(match.group(1)))
    labeled = _labeled_value(text, ("manager", "reporting manager", "reports to"))
    if labeled:
        return _title(_clean_person_value(labeled))
    match = re.search(
        r"\b(?:manager\s+is|his\s+manager\s+is|her\s+manager\s+is|reports\s+to|under)\s+([A-Za-z][A-Za-z\s.]*?)(?=\s+(?:his\s+|her\s+)?(?:experience|salary|joining|department|dept|location|employment|from|in|shift)\b|[.!?]|$)",
        text,
        re.IGNORECASE,
    )
    return _title(_clean_person_value(match.group(1))) if match else None


def _salary(text: str) -> str | None:
    cleaned_text = text.replace("₹", "").replace(",", "")
    robust_match = re.search(r"\b(?:salary|ctc|pay)\s*(?::|-|=)?\s*(?:is\s+)?(?:rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(lakh|lac|lpa|k)?\b", cleaned_text, re.IGNORECASE)
    if robust_match:
        amount = float(robust_match.group(1))
        unit = (robust_match.group(2) or "").lower()
        if unit in {"lakh", "lac", "lpa"}:
            amount *= 100000
        elif unit == "k":
            amount *= 1000
        return str(int(amount))
    text = text.replace("₹", "").replace("â‚¹", "")
    match = re.search(r"\b(?:salary|ctc|pay)\s*(?::|-|=)?\s*(?:is\s+)?(?:rs\.?|inr|₹)?\s*(\d+(?:\.\d+)?)\s*(lakh|lac|lpa|k)?\b", text, re.IGNORECASE)
    if not match:
        simple = re.fullmatch(r"(?:rs\.?|inr|₹)?\s*(\d+(?:\.\d+)?)\s*(lakh|lac|lpa|k)?", text.strip(), re.IGNORECASE)
        match = simple
    if not match:
        return None
    amount = float(match.group(1).replace(",", ""))
    unit = (match.group(2) or "").lower()
    if unit in {"lakh", "lac", "lpa"}:
        amount *= 100000
    elif unit == "k":
        amount *= 1000
    return str(int(amount))


def _salary_structure(text: str) -> str | None:
    match = re.search(
        r"\b(?:under|with|using|on)\s+(?:the\s+)?([A-Za-z][A-Za-z\s&./-]*?)\s+(?:salary\s+)?structure\b",
        text,
        re.IGNORECASE,
    )
    if match:
        return _title(_clean_entity_value(match.group(1)))
    match = re.search(
        r"\b(?:salary\s+structure|structure)\s*(?:is|:|-|=)?\s*(?:the\s+)?([A-Za-z][A-Za-z\s&./-]*?)(?=\s+(?:salary|ctc|pay|from|joining|manager|department|employment|location)\b|[.!?]|$)",
        text,
        re.IGNORECASE,
    )
    return _title(_clean_entity_value(match.group(1))) if match else None


def _employment_type(text: str) -> str | None:
    match = re.search(r"\b(?:employee\s+type|employment\s+type|type)\s*(?::|-|=)?\s*(?:is\s+)?(full[\s-]?time|part[\s-]?time|contract|intern|consultant)\b", text, re.IGNORECASE)
    if match:
        return _title(match.group(1).replace("-", " "))
    for value in ("full time", "full-time", "part time", "part-time", "contract", "intern", "consultant"):
        if re.search(rf"\b{re.escape(value)}\b", text, re.IGNORECASE):
            return _title(value.replace("-", " "))
    return None


def _location(text: str) -> str | None:
    labeled = _labeled_value(text, ("location", "work location", "based in"))
    if labeled:
        return _title(labeled)
    match = re.search(r"\b(?:location|work location|based in)\s+(?:is\s+)?([A-Za-z][A-Za-z\s.-]*?)(?=\s+(?:employment|salary|joining|joing|manager|department|dept)\b|[.!?]|$)", text, re.IGNORECASE)
    return _title(match.group(1)) if match else None


def _shift(text: str) -> str | None:
    labeled = _labeled_value(text, ("shift", "work shift"))
    if labeled:
        return _title(labeled)
    match = re.search(r"\b(?:default|morning|evening|night|general)\s+shift\b", text, re.IGNORECASE)
    return _title(match.group(0)) if match else None


def _bank_account_number(text: str) -> str | None:
    labeled = _labeled_value(text, ("bank account number", "bank account", "account number", "a/c number", "a/c"))
    if not labeled:
        return None
    digits = re.sub(r"[^0-9A-Za-z]", "", labeled)
    return digits or None


def _ifsc_code(text: str) -> str | None:
    labeled = _labeled_value(text, ("ifsc code", "ifsc"))
    if labeled:
        match = re.search(r"[A-Za-z]{4}0[A-Za-z0-9]{6}", labeled)
        return (match.group(0) if match else labeled.strip()).upper()
    match = re.search(r"\b[A-Za-z]{4}0[A-Za-z0-9]{6}\b", text)
    return match.group(0).upper() if match else None


def _pan_number(text: str) -> str | None:
    labeled = _labeled_value(text, ("pan number", "pan"))
    if labeled:
        match = re.search(r"[A-Za-z]{5}[0-9]{4}[A-Za-z]", labeled)
        return (match.group(0) if match else labeled.strip()).upper()
    match = re.search(r"\b[A-Za-z]{5}[0-9]{4}[A-Za-z]\b", text)
    return match.group(0).upper() if match else None


def _aadhaar_number(text: str) -> str | None:
    labeled = _labeled_value(text, ("aadhaar number", "aadhaar", "aadhar number", "aadhar"))
    if not labeled:
        return None
    digits = re.sub(r"[^0-9]", "", labeled)
    return digits or None


def _uan_number(text: str) -> str | None:
    labeled = _labeled_value(text, ("uan number", "uan"))
    if not labeled:
        return None
    digits = re.sub(r"[^0-9]", "", labeled)
    return digits or None


def _dob(text: str) -> str | None:
    labeled = _labeled_value(text, ("date of birth", "dob"))
    if not labeled:
        return None
    iso_match = re.search(r"\d{4}-\d{2}-\d{2}", labeled)
    if iso_match:
        return iso_match.group(0)
    try:
        return date.fromisoformat(labeled.strip()).isoformat()
    except ValueError:
        return None


def _gender(text: str) -> str | None:
    labeled = _labeled_value(text, ("gender",))
    if not labeled:
        return None
    match = re.search(r"\b(male|female|other)\b", labeled, re.IGNORECASE)
    return _title(match.group(1)) if match else None


def _seat(text: str) -> str | None:
    labeled = _labeled_value(text, ("seat label", "seat"))
    if labeled:
        return labeled.strip().upper()
    match = re.search(r"\b[A-E]-\d{1,2}\b", text, re.IGNORECASE)
    return match.group(0).upper() if match else None


def _labeled_value(text: str, labels: tuple[str, ...]) -> str | None:
    label_pattern = "|".join(re.escape(label) for label in sorted(labels, key=len, reverse=True))
    stop_labels = (
        "name|designation|desig|role|title|department|dept|manager|reporting manager|reports to|under|"
        "salary|salary structure|structure|ctc|pay|employee type|employment type|type|location|work location|based in|joining|experience|email|phone|shift|work shift|"
        "bank account number|bank account|account number|a/c number|a/c|ifsc code|ifsc|pan number|pan|"
        "aadhaar number|aadhaar|aadhar number|aadhar|uan number|uan|date of birth|dob|gender|seat label|seat"
    )
    match = re.search(
        rf"\b(?:{label_pattern})\b\s*(?::|-|=)?\s*(?:is\s+)?(.+?)(?=\s*,\s*(?:his\s+|her\s+)?(?:{stop_labels})\b|\s+(?:his\s+|her\s+)?(?:{stop_labels})\s*(?:is|:|-|=)|[.!?]|$)",
        text,
        re.IGNORECASE,
    )
    return match.group(1).strip(" ,.:;") if match else None


def _clean_entity_value(value: str) -> str:
    return re.split(
        r"\b(?:his|her)?\s*(?:salary|ctc|pay|manager|location|employment|employee\s+type|shift|joining)\b",
        value,
        maxsplit=1,
        flags=re.IGNORECASE,
    )[0].strip(" ,.:;")


def _clean_person_value(value: str) -> str:
    value = _clean_entity_value(value)
    return re.split(r"\b(?:in|within)\s+(?:the\s+)?[A-Za-z][A-Za-z\s&./-]*?\s+department\b", value, maxsplit=1, flags=re.IGNORECASE)[0].strip(" ,.:;")


def _first(pattern: str, text: str, flags: int = 0) -> str | None:
    match = re.search(pattern, text, flags)
    return match.group(0).strip() if match else None


def _title(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = re.sub(r"\s+", " ", value).strip(" .")
    if not cleaned:
        return None
    titled = cleaned.title()
    for acronym in ("IT", "HR", "QA", "UI", "UX", "CTO", "CEO", "CFO"):
        titled = re.sub(rf"\b{acronym.title()}\b", acronym, titled)
    return titled


def _next_weekday(name: str) -> date:
    weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    target = weekdays.index(name.lower())
    today = date.today()
    delta = (target - today.weekday()) % 7
    return today + timedelta(days=delta or 7)