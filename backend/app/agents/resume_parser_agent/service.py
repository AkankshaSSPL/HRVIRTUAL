from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.agents.onboarding_agent.tools import candidate_to_payload, create_candidate_profile
from app.agents.resume_parser_agent.parser import ResumeParsingError, extract_text
from app.agents.resume_parser_agent.tools import candidate_payload_from_parsed, parse_candidate_data, save_resume_file, validate_resume
from app.agents.shared.base_agent import BaseAgent
from app.agents.shared.runtime_context import RuntimeContext
from app.models.employee import ResumeUpload


class ResumeParserAgent(BaseAgent):
    name = "resume_parser_agent"
    description = "Resume parser agent for PDF/DOCX extraction and candidate profile generation."
    supported_actions = ["upload", "parse"]
    approval_required_actions: list[str] = []

    def __init__(self, db: Session | None = None) -> None:
        self.db = db

    async def run(self, state):  # pragma: no cover
        return {"message": "Resume Parser Agent requires upload invocation."}

    async def invoke(self, action: str, payload: dict[str, Any], context: RuntimeContext) -> dict[str, Any]:
        return {"agent": self.name, "action": action, "workflow_id": context.workflow_id}

    def upload_and_parse(self, *, filename: str, content_type: str, content: bytes, uploaded_by: UUID | None) -> dict[str, Any]:
        if self.db is None:
            raise RuntimeError("ResumeParserAgent requires a database session")
        validate_resume(filename, content_type, content)
        stored_filename, path = save_resume_file(filename, content_type, content)
        raw_text = extract_text(path, content_type)
        parsed = parse_candidate_data(raw_text)
        if not (parsed.get("full_name") or parsed.get("email")):
            raise ResumeParsingError("Unable to identify candidate name or email from resume.")

        candidate = create_candidate_profile(self.db, _candidate_profile(parsed), source="resume_parser_agent")
        upload = ResumeUpload(
            candidate_id=candidate.id,
            original_filename=filename,
            stored_filename=stored_filename,
            storage_path=str(path),
            content_type=content_type,
            file_size=len(content),
            uploaded_by=uploaded_by,
            parsed_text_preview=raw_text[:1200],
            parsed_json=parsed,
        )
        self.db.add(upload)
        self.db.commit()
        self.db.refresh(upload)
        self.db.refresh(candidate)
        candidate_payload = candidate_to_payload(candidate)
        return {
            "upload": {
                "id": upload.id,
                "original_filename": upload.original_filename,
                "stored_filename": upload.stored_filename,
                "uploaded_at": upload.created_at,
                "content_type": upload.content_type,
                "file_size": upload.file_size,
            },
            "parsed": parsed,
            "candidate": candidate_payload,
            "structured_response": {
                "type": "candidate_card",
                "title": candidate_payload.get("name") or parsed.get("full_name") or "Candidate profile",
                "summary": "Resume parsed and candidate profile generated.",
                "candidate": candidate_payload,
                "payload": {"resume_upload_id": str(upload.id)},
                "actions": ["Start Onboarding", "Edit Candidate", "Reject Candidate"],
            },
            "suggested_command": _suggested_onboarding_command(candidate_payload, parsed),
        }


def _candidate_profile(parsed: dict[str, Any]) -> dict[str, Any]:
    payload = candidate_payload_from_parsed(parsed)
    return {
        "name": payload.get("name"),
        "email": payload.get("email"),
        "phone": payload.get("phone"),
        "skills": payload.get("skills") or [],
        "experience": payload.get("experience"),
        "education": payload.get("education"),
        "current_company": payload.get("current_company"),
        "field_sources": {field: "resume" for field, value in payload.items() if value not in (None, "", [])},
        "raw_text_preview": parsed.get("raw_text_preview"),
    }


def _suggested_onboarding_command(candidate: dict[str, Any], parsed: dict[str, Any]) -> str:
    name = candidate.get("name") or parsed.get("full_name")
    details = [value for value in (candidate.get("email"), candidate.get("phone")) if value]
    return f"Onboard {name}{' ' + ' '.join(details) if details else ''}" if name else "Start onboarding"
