from __future__ import annotations

import re
import uuid
from pathlib import Path
from typing import Any

from app.core.config import settings


SUPPORTED_CONTENT_TYPES = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}
SUPPORTED_SUFFIXES = {".pdf", ".docx"}


class ResumeUploadError(ValueError):
    pass


def validate_resume(filename: str, content_type: str, content: bytes) -> None:
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES or content_type not in SUPPORTED_CONTENT_TYPES:
        raise ResumeUploadError("Unsupported file type. Upload a PDF or DOCX resume.")
    max_bytes = settings.max_resume_upload_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise ResumeUploadError(f"Resume is too large. Maximum allowed size is {settings.max_resume_upload_mb} MB.")
    if not content:
        raise ResumeUploadError("Resume file is empty.")


def save_resume_file(original_filename: str, content_type: str, content: bytes) -> tuple[str, Path]:
    storage_dir = Path(settings.resume_storage_dir)
    if not storage_dir.is_absolute():
        storage_dir = Path.cwd() / storage_dir
    storage_dir.mkdir(parents=True, exist_ok=True)
    suffix = Path(original_filename).suffix.lower() or SUPPORTED_CONTENT_TYPES.get(content_type, ".pdf")
    stored_filename = f"{uuid.uuid4()}{suffix}"
    path = storage_dir / stored_filename
    path.write_bytes(content)
    return stored_filename, path


def parse_candidate_data(text: str) -> dict[str, Any]:
    email = _first(r"[\w.\-+]+@[\w.\-]+\.\w+", text)
    phone = _first(r"(?:\+?\d[\d\s-]{8,}\d)", text)
    full_name = _name_from_text(text, email)
    skills = _skills(text)
    return {
        "full_name": full_name,
        "email": email,
        "phone": phone,
        "skills": skills,
        "total_experience": _first(r"(\d+(?:\.\d+)?\+?\s+years?(?:\s+of)?\s+experience)", text, re.IGNORECASE),
        "education": _first(r"(B\.?Tech|M\.?Tech|MBA|BSc|MSc|Bachelor|Master|BE|ME)[^\n\r]{0,100}", text, re.IGNORECASE),
        "current_company": _company(text),
        "raw_text_preview": text[:1200],
    }


def candidate_payload_from_parsed(parsed: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": parsed.get("full_name"),
        "email": parsed.get("email"),
        "phone": parsed.get("phone"),
        "skills": parsed.get("skills") or [],
        "experience": parsed.get("total_experience"),
        "education": parsed.get("education"),
        "current_company": parsed.get("current_company"),
    }


def _first(pattern: str, text: str, flags: int = 0) -> str | None:
    match = re.search(pattern, text, flags)
    return match.group(0).strip() if match else None


def _name_from_text(text: str, email: str | None) -> str | None:
    for line in text.splitlines()[:8]:
        clean = line.strip()
        if not clean or "@" in clean or any(char.isdigit() for char in clean):
            continue
        words = clean.split()
        if 1 < len(words) <= 5:
            return clean.title()
    if email:
        return email.split("@")[0].replace(".", " ").replace("_", " ").title()
    return None


def _skills(text: str) -> list[str]:
    known = [
        "Python",
        "Java",
        "JavaScript",
        "TypeScript",
        "React",
        "SQL",
        "PostgreSQL",
        "FastAPI",
        "Django",
        "AWS",
        "Azure",
        "Docker",
        "Kubernetes",
        "Payroll",
        "HRMS",
        "Recruitment",
        "Excel",
    ]
    lowered = text.lower()
    return [skill for skill in known if skill.lower() in lowered]


def _company(text: str) -> str | None:
    match = re.search(r"(?:current company|company|employer)[:\s]+([A-Za-z0-9 &.,-]{2,80})", text, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return None
