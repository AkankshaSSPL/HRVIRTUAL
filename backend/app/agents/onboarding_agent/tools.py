from __future__ import annotations

import re
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.employee import Candidate
from app.models.employee.models import CandidateStatus


DOCUMENT_CHECKLIST = [
    {"name": "PAN", "status": "PENDING"},
    {"name": "Aadhaar", "status": "PENDING"},
    {"name": "Bank details", "status": "PENDING"},
    {"name": "Educational documents", "status": "PENDING"},
    {"name": "Experience letters", "status": "PENDING"},
]

ASSET_CHECKLIST = [
    {"name": "Laptop", "status": "REQUESTED"},
    {"name": "Accessories", "status": "REQUESTED"},
    {"name": "ID card", "status": "REQUESTED"},
    {"name": "Email access", "status": "REQUESTED"},
    {"name": "Software access", "status": "REQUESTED"},
]


def parse_resume_bytes(filename: str, content: bytes) -> dict[str, Any]:
    text = _decode_resume_preview(content)
    email = _first_match(r"[\w.\-+]+@[\w.\-]+\.\w+", text)
    phone = _first_match(r"(?:\+?\d[\d\s-]{8,}\d)", text)
    name = _name_from_text(text)
    skills = [skill for skill in ("Python", "SQL", "React", "Payroll", "HRMS", "FastAPI", "Excel") if skill.lower() in text.lower()]
    return {
        "name": name,
        "email": email,
        "phone": phone,
        "skills": skills,
        "experience": _first_match(r"(\d+\+?\s+years?(?:\s+of)?\s+experience)", text, flags=re.IGNORECASE),
        "education": _first_match(r"(B\.?Tech|M\.?Tech|MBA|BSc|MSc|Bachelor|Master)[^\n\r]{0,80}", text, flags=re.IGNORECASE),
        "current_company": _first_match(r"(?:current company|company)[:\s]+([A-Za-z0-9 &.]+)", text, flags=re.IGNORECASE),
        "raw_text_preview": text[:1200],
    }


def create_candidate_profile(db: Session, parsed: dict[str, Any], source: str = "agent_onboarding") -> Candidate:
    existing = None
    if parsed.get("email"):
        existing = db.scalar(select(Candidate).where(Candidate.email == parsed["email"], Candidate.deleted_at.is_(None)))
    if existing:
        existing.parsed_resume_json = parsed
        existing.candidate_status = CandidateStatus.SCREENING
        db.add(existing)
        db.flush()
        db.refresh(existing)
        return existing

    first_name, last_name = split_name(parsed.get("name"))
    candidate = Candidate(
        first_name=first_name,
        last_name=last_name,
        email=parsed.get("email"),
        phone=parsed.get("phone"),
        source=source,
        parsed_resume_json=parsed,
        current_company=parsed.get("current_company"),
        candidate_status=CandidateStatus.SCREENING,
    )
    db.add(candidate)
    db.flush()
    db.refresh(candidate)
    return candidate


def candidate_to_payload(candidate: Candidate) -> dict[str, Any]:
    parsed = candidate.parsed_resume_json or {}
    return {
        "id": str(candidate.id),
        "name": " ".join(part for part in (candidate.first_name, candidate.last_name) if part).strip(),
        "email": candidate.email,
        "phone": candidate.phone,
        "source": candidate.source,
        "status": str(candidate.candidate_status),
        "skills": parsed.get("skills") or [],
        "experience": parsed.get("experience"),
        "education": parsed.get("education"),
        "current_company": candidate.current_company or parsed.get("current_company"),
        "designation": parsed.get("designation"),
        "department": parsed.get("department"),
        "manager": parsed.get("manager"),
        "joining_date": parsed.get("joining_date"),
        "salary": parsed.get("salary"),
        "employment_type": parsed.get("employment_type"),
        "location": parsed.get("location"),
        "shift": parsed.get("shift"),
        "field_sources": parsed.get("field_sources") or {},
        "resume_uploaded": parsed.get("resume_uploaded", candidate.source == "resume_parser_agent"),
    }


def parsed_from_command(command: str) -> dict[str, Any]:
    name = _name_from_command(command)
    return {
        "name": name,
        "email": _first_match(r"[\w.\-+]+@[\w.\-]+\.\w+", command),
        "phone": _first_match(r"(?:\+?\d[\d\s-]{8,}\d)", command),
        "skills": [],
        "experience": None,
        "education": None,
        "current_company": None,
        "designation": _designation_from_command(command),
        "department": _department_from_command(command),
        "manager": _manager_from_command(command),
        "joining_date": _joining_date_from_command(command),
        "resume_uploaded": False,
        "raw_text_preview": command,
    }


def split_name(name: str) -> tuple[str, str]:
    parts = (name or "").strip().split()
    if not parts:
        return "", ""
    return parts[0], " ".join(parts[1:])


def _decode_resume_preview(content: bytes) -> str:
    try:
        return content.decode("utf-8", errors="ignore")
    except Exception:
        return ""


def _first_match(pattern: str, text: str, flags: int = 0) -> str | None:
    match = re.search(pattern, text, flags)
    return match.group(0).strip() if match else None


def _name_from_text(text: str) -> str | None:
    first_line = next((line.strip() for line in text.splitlines() if line.strip()), "")
    if first_line and len(first_line.split()) <= 5 and "@" not in first_line:
        return first_line.title()
    return None


def _name_from_command(command: str) -> str | None:
    text = _normalized_command(command)
    match = re.search(
        r"(?:onboard|hire|start onboarding for)\s+([A-Za-z][A-Za-z\s.]*?)(?=\s+(?:as\s+a|as|department|departmet|dept|his\s+manager|manager|joining|joing|from)\b|$)",
        text,
        re.IGNORECASE,
    )
    return _title(match.group(1)) if match else None


def _designation_from_command(command: str) -> str | None:
    text = _normalized_command(command)
    match = re.search(
        r"\bas\s+(?:a|an)?\s*([A-Za-z][A-Za-z\s&.-]*?)(?=\s+(?:department|departmet|dept|his\s+manager|her\s+manager|manager\s+is|reports\s+to|joining|joing|from)\b|$)",
        text,
        re.IGNORECASE,
    )
    return _title(match.group(1)) if match else None


def _department_from_command(command: str) -> str | None:
    text = _normalized_command(command)
    match = re.search(
        r"\b(?:department|departmet|dept)\s+([A-Za-z][A-Za-z\s&.-]*?)(?=\s+(?:his\s+manager|manager|joining|joing|from)\b|$)",
        text,
        re.IGNORECASE,
    )
    return _title(match.group(1)) if match else None


def _manager_from_command(command: str) -> str | None:
    text = _normalized_command(command)
    match = re.search(
        r"\b(?:his\s+manager\s+is|her\s+manager\s+is|manager\s+is|reports\s+to)\s+([A-Za-z][A-Za-z\s.]*?)(?=\s+(?:joining|joing|from)\b|$)",
        text,
        re.IGNORECASE,
    )
    return _title(match.group(1)) if match else None


def _joining_date_from_command(command: str) -> str | None:
    if re.search(r"\b(?:joining|joing|from)\s+(?:today|now)\b", command, re.IGNORECASE):
        from datetime import date

        return date.today().isoformat()
    return None


def _normalized_command(command: str) -> str:
    return re.sub(r"\s+", " ", command).strip()


def _title(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = re.sub(r"\s+", " ", value).strip(" .")
    return cleaned.title() if cleaned else None
