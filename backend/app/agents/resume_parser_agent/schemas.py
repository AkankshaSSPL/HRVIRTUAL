from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class ParsedResumeRead(BaseModel):
    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    skills: list[str] = Field(default_factory=list)
    total_experience: str | None = None
    education: str | None = None
    current_company: str | None = None
    raw_text_preview: str | None = None


class ResumeUploadRead(BaseModel):
    id: UUID
    original_filename: str
    stored_filename: str
    uploaded_at: datetime
    content_type: str
    file_size: int


class ResumeUploadResponse(BaseModel):
    upload: ResumeUploadRead
    parsed: ParsedResumeRead
    candidate: dict[str, Any]
    structured_response: dict[str, Any]
    suggested_command: str
