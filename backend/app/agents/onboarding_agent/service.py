from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.agents.onboarding_agent.schemas import OnboardingStepStatus
from app.agents.onboarding_agent.tools import ASSET_CHECKLIST, DOCUMENT_CHECKLIST, candidate_to_payload, create_candidate_profile, parsed_from_command
from app.agents.employee_agent.tools import create_employee_draft, employee_display_name, employee_profile, find_one_employee, get_employee_by_id, update_employee_fields
from app.agents.shared.extraction import extract_onboarding_entities, is_onboarding_intent, is_start_confirmation, merge_entities, missing_onboarding_fields
from app.agents.shared import approval_guard
from app.agents.shared.base_agent import BaseAgent
from app.agents.shared.runtime_context import RuntimeContext
from app.models.agents import AgentRun
from app.models.audit import AuditLog
from app.models.employee import Department, Designation, Employee, EmployeeAsset, Notification
from app.services.onboarding_progress import compute_onboarding_progress

logger = logging.getLogger(__name__)

OPTIONAL_ONBOARDING_FIELDS = {"designation", "department"}

FINISHING_STEP_ORDER = ["documents", "seating", "welcome_mail"]
FINISHING_AFFIRMATIVE_REPLIES = {"yes", "y", "send", "confirm", "proceed", "send it", "go ahead", "yes send"}


class OnboardingAgent(BaseAgent):
    name = "onboarding_agent"
    description = "Multi-agent onboarding orchestrator for candidate capture, employee creation, documents, assets, and notifications."
    supported_actions = ["start", "resume_upload", "inspect"]
    approval_required_actions = []

    def __init__(self, db: Session | None = None) -> None:
        self.db = db

    async def run(self, state):  # pragma: no cover
        return {"message": "Onboarding Agent requires runtime invocation."}

    async def invoke(self, action: str, payload: dict[str, Any], context: RuntimeContext) -> dict[str, Any]:
        if self.db is None:
            raise RuntimeError("OnboardingAgent requires a database session")
        return self.execute(command=payload.get("command", ""), user_id=context.user_id, workflow_id=context.workflow_id)

    def execute(self, *, command: str, user_id: UUID | None, workflow_id: str) -> dict[str, Any]:
        finishing_employee_id = _latest_onboarding_finishing_employee_id(self.db, user_id)
        if finishing_employee_id:
            employee = get_employee_by_id(self.db, finishing_employee_id)
            if employee:
                return self._continue_finishing(employee=employee, command=command, user_id=user_id, workflow_id=workflow_id)

        latest_draft = _latest_onboarding_draft(self.db, user_id)
        extracted = extract_onboarding_entities(command)
        base_draft = None if is_onboarding_intent(command) and not is_start_confirmation(command) else latest_draft
        state_before_merge = dict(base_draft or {})
        draft = merge_entities(base_draft, extracted)
        field_sources = _merge_field_sources(state_before_merge, extracted)
        missing_fields = missing_onboarding_fields(draft)
        state_debug = _state_debug(
            command=command,
            extracted=extracted,
            state_before_merge=state_before_merge,
            state_after_merge=draft,
            field_sources=field_sources,
            missing_fields=missing_fields,
            workflow_id=workflow_id,
        )
        logger.info("Onboarding extraction: %s", state_debug)

        if latest_draft and not missing_fields and is_start_confirmation(command):
            parsed = _draft_to_parsed({**draft, "field_sources": field_sources}, command)
            result = self._start_onboarding(parsed=parsed, command=command, user_id=user_id, workflow_id=workflow_id, conversational=True)
            return _with_state_debug(result, state_debug)

        if missing_fields:
            return _with_state_debug(_missing_field_response(draft=draft, field_sources=field_sources, missing_fields=missing_fields, command=command, workflow_id=workflow_id), state_debug)

        if not missing_fields and is_onboarding_intent(command) and draft.get("name"):
            parsed = _draft_to_parsed({**draft, "field_sources": field_sources}, command)
            result = self._start_onboarding(parsed=parsed, command=command, user_id=user_id, workflow_id=workflow_id, conversational=True)
            return _with_state_debug(result, state_debug)

        if latest_draft or extracted:
            return _with_state_debug(_summary_response(draft=draft, field_sources=field_sources, command=command, workflow_id=workflow_id), state_debug)

        parsed = parsed_from_command(command)
        result = self._start_onboarding(parsed=parsed, command=command, user_id=user_id, workflow_id=workflow_id, conversational=False)
        return _with_state_debug(result, state_debug)

    def _start_onboarding(self, *, parsed: dict[str, Any], command: str, user_id: UUID | None, workflow_id: str, conversational: bool) -> dict[str, Any]:
        candidate = create_candidate_profile(self.db, parsed)
        candidate_payload = candidate_to_payload(candidate)
        candidate_payload.update(
            {
                key: parsed.get(key)
                for key in (
                    "designation",
                    "department",
                    "manager",
                    "joining_date",
                    "salary",
                    "salary_structure",
                    "employment_type",
                    "location",
                    "experience",
                    "shift",
                    "address",
                    "dob",
                    "employee_code",
                    "pan_number",
                    "aadhaar_number",
                    "bank_account_number",
                    "ifsc_code",
                    "uan_number",
                    "gender",
                )
                if parsed.get(key)
            }
        )
        candidate_payload["field_sources"] = parsed.get("field_sources") or _default_field_sources(candidate_payload, "user_input")
        onboarding_payload = {
            "command": command,
            "candidate_id": str(candidate.id),
            "candidate": candidate_payload,
            "field_sources": candidate_payload.get("field_sources") or {},
            "confirmed_fields": {key: value for key, value in candidate_payload.items() if key != "field_sources" and value not in (None, "", [])},
            "inferred_fields": {},
            "documents": DOCUMENT_CHECKLIST,
            "assets": ASSET_CHECKLIST,
            "requested_at": datetime.now(timezone.utc).isoformat(),
        }
        audit_onboarding_action(self.db, action="onboarding.started", payload=onboarding_payload, performed_by=user_id)
        employee_result = _create_employee_from_onboarding(
            self.db,
            candidate=candidate_payload,
            assets=ASSET_CHECKLIST,
            payload=onboarding_payload,
            performed_by=user_id,
        )
        self.db.commit()

        employee = get_employee_by_id(self.db, UUID(employee_result["employee"]["id"]))
        return self._finishing_turn_result(
            employee=employee,
            command=command,
            workflow_id=workflow_id,
            message_prefix=f"Done. {employee_result['employee']['name']} has been onboarded successfully.",
        )

    def _continue_finishing(self, *, employee: Employee, command: str, user_id: UUID | None, workflow_id: str) -> dict[str, Any]:
        progress = compute_onboarding_progress(self.db, employee)
        pending_step = _first_pending_finishing_step(progress)

        if pending_step == "seating":
            seat = extract_onboarding_entities(command).get("seat")
            if seat:
                employee, old_value, new_value = update_employee_fields(self.db, employee.id, {"seat_label": seat})
                self.db.add(
                    AuditLog(
                        entity_type="employee",
                        entity_id=employee.id,
                        action="employee.seat_assigned",
                        old_value={"seat_label": old_value.get("seat_label")},
                        new_value={"seat_label": new_value.get("seat_label")},
                        performed_by=user_id,
                    )
                )
                self.db.commit()
                self.db.refresh(employee)
        elif pending_step == "welcome_mail":
            if _is_affirmative(command) and progress["welcome_kit_ready"] and employee.welcome_kit_sent_at is None:
                employee.welcome_kit_sent_at = datetime.now(timezone.utc)
                self.db.add(
                    AuditLog(
                        entity_type="employee",
                        entity_id=employee.id,
                        action="employee.welcome_kit_sent",
                        new_value={"welcome_kit_sent_at": employee.welcome_kit_sent_at.isoformat()},
                        performed_by=user_id,
                    )
                )
                self.db.commit()
                self.db.refresh(employee)
        # documents: nothing to parse from free text. A synthetic continuation ping sent
        # right after a successful upload will already see documents_complete == True in
        # the fresh progress computed below, so it falls through to the next step on its own.

        return self._finishing_turn_result(employee=employee, command=command, workflow_id=workflow_id)

    def _finishing_turn_result(self, *, employee: Employee, command: str, workflow_id: str, message_prefix: str | None = None) -> dict[str, Any]:
        progress = compute_onboarding_progress(self.db, employee)
        next_step = _first_pending_finishing_step(progress)

        if next_step is None:
            message = f"Onboarding complete — {employee_display_name(employee)} is now in Employees."
            if message_prefix:
                message = f"{message_prefix} {message}"
            completed = True
            awaiting_upload = None
        else:
            step_prompt = _finishing_step_prompt(next_step, employee)
            message = f"{message_prefix} {step_prompt}" if message_prefix else step_prompt
            completed = False
            awaiting_upload = {"employee_id": str(employee.id), "document_type": "Identity Document"} if next_step == "documents" else None

        structured_response: dict[str, Any] = {
            "type": "onboarding_finishing",
            "title": "Onboarding complete" if completed else "Finishing onboarding",
            "summary": message,
            "employee_id": str(employee.id),
            "candidate": employee_profile(employee),
            "progress": progress,
            "completed": completed,
        }
        if awaiting_upload:
            structured_response["awaiting_upload"] = awaiting_upload

        return {
            "agent": self.name,
            "agent_display_name": "Onboarding Agent",
            "action": "finishing_complete" if completed else "finishing",
            "message": message,
            "operation_summary": "Onboarding workflow",
            "execution_status": "Completed" if completed else "Needs Details",
            "workflow_status": "Completed" if completed else "Awaiting Details",
            "execution_summary": "Employee record was created and onboarding tasks were generated." if completed else "Waiting on remaining onboarding steps.",
            "next_actions": "Open Employees to review the new employee record." if completed else "Reply with the requested detail or attach the document.",
            "approval_request_id": None,
            "structured_response": structured_response,
            "command": command,
            "workflow_id": workflow_id,
            "completed_at": datetime.now(timezone.utc).isoformat() if completed else None,
        }


def onboarding_response(
    *,
    title: str,
    summary: str,
    candidate: dict[str, Any],
    approval_request_id: str | None = None,
    completed: bool = False,
    include_resume_step: bool = True,
    conversational: bool = False,
) -> dict[str, Any]:
    if conversational:
        return onboarding_summary_response(candidate, status="Completed" if completed else "Approval Required", approval_request_id=approval_request_id, started=completed or approval_request_id is not None)

    approval_status = OnboardingStepStatus.COMPLETED if completed or not approval_request_id else OnboardingStepStatus.WAITING_APPROVAL
    downstream_status = OnboardingStepStatus.COMPLETED if completed else OnboardingStepStatus.PENDING
    steps = [
        {"agent": "candidate_agent", "title": "Candidate profile", "status": OnboardingStepStatus.COMPLETED, "summary": "Candidate profile prepared."},
        {"agent": "approval_agent", "title": "Onboarding approval", "status": approval_status, "summary": "No approval needed for basic onboarding." if completed and not approval_request_id else ("Salary approval requested." if approval_request_id else "Approval completed.")},
        {"agent": "employee_agent", "title": "Employee creation", "status": downstream_status, "summary": "Employee record created." if completed else "Employee record will be created after approval."},
        {"agent": "document_agent", "title": "Document checklist", "status": downstream_status, "summary": "Document checklist generated." if completed else "Documents pending collection."},
        {"agent": "asset_agent", "title": "Asset allocation", "status": downstream_status, "summary": "Asset requests generated." if completed else "Assets pending request."},
        {"agent": "notification_agent", "title": "Welcome workflow", "status": downstream_status, "summary": "Welcome workflow prepared." if completed else "Notifications pending approval."},
    ]
    if include_resume_step:
        steps.insert(0, {"agent": "resume_parser_agent", "title": "Resume parsed", "status": OnboardingStepStatus.COMPLETED, "summary": "Candidate data extracted."})
    return {
        "type": "onboarding_progress",
        "title": title,
        "summary": summary,
        "candidate": candidate,
        "candidate_id": candidate.get("id"),
        "approval_request_id": approval_request_id,
        "steps": steps,
        "documents": DOCUMENT_CHECKLIST,
        "assets": ASSET_CHECKLIST,
        "payload": {"approval_request_id": approval_request_id},
    }


def onboarding_summary_response(candidate: dict[str, Any], *, status: str, approval_request_id: str | None = None, started: bool = False) -> dict[str, Any]:
    return {
        "type": "onboarding_summary",
        "title": "Onboarding summary",
        "summary": "All onboarding details collected. Would you like me to create the employee profile and start onboarding?" if not started else "Onboarding has been started.",
        "candidate": candidate,
        "field_sources": candidate.get("field_sources") or {},
        "missing_fields": _blocking_missing_fields(candidate),
        "status": status,
        "approval_request_id": approval_request_id,
        "actions": [] if started else ["Start Onboarding", "Edit Details"],
    }


def audit_onboarding_action(db: Session, *, action: str, payload: dict[str, Any], performed_by: UUID | None = None) -> None:
    db.add(
        AuditLog(
            entity_type="onboarding",
            entity_id=UUID(payload["candidate_id"]) if payload.get("candidate_id") else None,
            action=action,
            old_value=None,
            new_value=payload,
            performed_by=performed_by,
        )
    )


def _create_employee_from_onboarding(
    db: Session,
    *,
    candidate: dict[str, Any],
    assets: list[dict[str, str]],
    payload: dict[str, Any],
    performed_by: UUID | None,
) -> dict[str, Any]:
    first_name, last_name = _split_name(candidate.get("name"))
    department = _find_or_create_department(db, candidate.get("department"))
    designation = _find_or_create_designation(db, candidate.get("designation"))
    manager = _find_manager(db, candidate.get("manager"))
    employee, employee_snapshot = create_employee_draft(
        db,
        {
            "first_name": first_name,
            "last_name": last_name,
            "employee_code": candidate.get("employee_code"),
            "employment_status": "ACTIVE",
            "employment_type": candidate.get("employment_type"),
            "official_email": _unique_employee_email(db, candidate.get("email")) if candidate.get("email") else None,
            "personal_email": candidate.get("email"),
            "phone": candidate.get("phone"),
            "joining_date": candidate.get("joining_date"),
            "department_id": department.id if department else None,
            "designation_id": designation.id if designation else None,
            "reporting_manager_id": manager.id if manager else None,
            "current_salary": candidate.get("salary"),
            "dob": candidate.get("dob"),
            "gender": candidate.get("gender"),
            "bank_account_number": candidate.get("bank_account_number"),
            "ifsc_code": candidate.get("ifsc_code"),
            "pan_number": candidate.get("pan_number"),
            "aadhaar_number": candidate.get("aadhaar_number"),
            "uan_number": candidate.get("uan_number"),
        },
    )
    for asset in assets:
        db.add(
            EmployeeAsset(
                employee_id=employee.id,
                asset_type=asset["name"],
                asset_code=f"REQ-{asset['name'].upper().replace(' ', '-')}-{str(employee.id)[:8]}",
                asset_status="ASSIGNED",
                metadata_json={"source": "onboarding_agent"},
            )
        )
    if employee.user_id:
        db.add(
            Notification(
                user_id=employee.user_id,
                title="Welcome to the organization",
                message="Your onboarding workflow has started.",
                channel="email",
                status="UNREAD",
                payload_json={"employee_id": str(employee.id)},
            )
        )
    audit_onboarding_action(db, action="onboarding.completed", payload={**payload, "employee_id": str(employee.id)}, performed_by=performed_by)
    db.add(
        AuditLog(
            entity_type="employee",
            entity_id=employee.id,
            action="employee.created_from_onboarding",
            old_value=None,
            new_value=employee_snapshot,
            performed_by=performed_by,
        )
    )
    db.flush()
    db.refresh(employee)
    return {"employee": employee_profile(employee)}


def _split_name(name: str | None) -> tuple[str, str]:
    parts = (name or "").strip().split()
    if not parts:
        return "", ""
    return parts[0], " ".join(parts[1:]) if len(parts) > 1 else ""


def _unique_employee_email(db: Session, email: str | None) -> str | None:
    if not email:
        return None
    local, _, domain = email.partition("@")
    if not local or not domain:
        return email
    candidate = f"{local}@{domain}"
    suffix = 1
    while db.scalar(select(Employee.id).where(Employee.official_email == candidate)) is not None:
        suffix += 1
        candidate = f"{local}.{suffix}@{domain}"
    return candidate


def _find_or_create_department(db: Session, name: str | None) -> Department | None:
    if not name:
        return None
    existing = db.scalar(select(Department).where(Department.deleted_at.is_(None), Department.name.ilike(name)))
    if existing:
        return existing
    department = Department(name=name, code=_code(name), description="Created from onboarding request")
    db.add(department)
    db.flush()
    return department


def _find_or_create_designation(db: Session, title: str | None) -> Designation | None:
    if not title:
        return None
    existing = db.scalar(select(Designation).where(Designation.deleted_at.is_(None), Designation.title.ilike(title)))
    if existing:
        return existing
    designation = Designation(title=title, code=_code(title), description="Created from onboarding request")
    db.add(designation)
    db.flush()
    return designation


def _code(value: str) -> str:
    return "".join(part[0] for part in value.split() if part).upper()[:12] or "AUTO"


def _find_manager(db: Session, name: str | None) -> Employee | None:
    if not name:
        return None
    manager = find_one_employee(db, name)
    if manager:
        return manager
    tokens = [token for token in name.split() if token]
    if not tokens:
        return None
    conditions = []
    for token in tokens:
        pattern = f"%{token}%"
        conditions.extend([Employee.first_name.ilike(pattern), Employee.last_name.ilike(pattern), Employee.official_email.ilike(pattern)])
    candidates = list(db.scalars(select(Employee).where(Employee.deleted_at.is_(None), or_(*conditions)).limit(10)))
    normalized = _normalize_name(name)
    for employee in candidates:
        display_name = _normalize_name(employee_display_name(employee))
        if normalized in display_name or all(token.lower() in display_name for token in tokens):
            return employee
    return candidates[0] if len(candidates) == 1 else None


def _normalize_name(value: str) -> str:
    return "".join(ch for ch in value.lower() if ch.isalnum())


def _latest_onboarding_draft(db: Session, user_id: UUID | None) -> dict[str, Any] | None:
    if not user_id:
        return None
    rows = db.scalars(
        select(AgentRun)
        .where(AgentRun.requested_by == user_id, AgentRun.agent_name == "coordinator_agent")
        .order_by(AgentRun.created_at.desc())
        .limit(8)
    )
    for run in rows:
        result = (run.metadata_json or {}).get("result") or {}
        response = result.get("structured_response") or {}
        if response.get("type") in {"missing_fields", "onboarding_summary"} and not response.get("started"):
            draft = dict(response.get("draft") or response.get("candidate") or {})
            if response.get("field_sources"):
                draft["field_sources"] = response.get("field_sources")
            return draft
    return None


def _latest_onboarding_finishing_employee_id(db: Session, user_id: UUID | None) -> UUID | None:
    if not user_id:
        return None
    rows = db.scalars(
        select(AgentRun)
        .where(AgentRun.requested_by == user_id, AgentRun.agent_name == "coordinator_agent")
        .order_by(AgentRun.created_at.desc())
        .limit(8)
    )
    for run in rows:
        result = (run.metadata_json or {}).get("result") or {}
        response = result.get("structured_response") or {}
        if response.get("type") == "onboarding_finishing" and not response.get("completed"):
            employee_id = response.get("employee_id")
            if employee_id:
                try:
                    return UUID(str(employee_id))
                except ValueError:
                    return None
    return None


def _first_pending_finishing_step(progress: dict[str, Any]) -> str | None:
    items_by_key = {item["key"]: item for item in progress["items"]}
    for step in FINISHING_STEP_ORDER:
        item = items_by_key.get(step)
        if item and not item["complete"]:
            return step
    return None


def _is_affirmative(command: str) -> bool:
    return command.strip().lower() in FINISHING_AFFIRMATIVE_REPLIES


def _finishing_step_prompt(step: str, employee: Employee) -> str:
    if step == "documents":
        return f"Please attach an identity document (PAN, Aadhaar, etc.) for {employee_display_name(employee)} to verify."
    if step == "seating":
        return "Reply with a seat like A-3 to assign a desk."
    if step == "welcome_mail":
        return "Ready to send the welcome mail? Reply yes to confirm."
    return "Continuing onboarding."


def _missing_field_response(*, draft: dict[str, Any], field_sources: dict[str, str], missing_fields: list[str], command: str, workflow_id: str) -> dict[str, Any]:
    missing_fields = [field for field in missing_fields if field not in OPTIONAL_ONBOARDING_FIELDS]
    label_list = [_field_label(field) for field in missing_fields]
    return {
        "agent": "onboarding_agent",
        "agent_display_name": "Onboarding Agent",
        "action": "collect_details",
        "message": f"Please provide: {', '.join(label_list)}.",
        "operation_summary": "Collect onboarding details",
        "execution_status": "Needs Details",
        "workflow_status": "Awaiting Details",
        "execution_summary": "I captured the onboarding details available in your message and need only the missing fields.",
        "next_actions": "Reply with the missing details in plain text.",
        "approval_request_id": None,
        "structured_response": {
            "type": "missing_fields",
            "title": "A few details are needed",
            "summary": "Reply with only the missing information. I will keep the current onboarding context.",
            "draft": draft,
            "field_sources": field_sources,
            "missing_fields": missing_fields,
            "labels": label_list,
            "prompt": f"Please provide: {', '.join(label_list)}.",
        },
        "command": command,
        "workflow_id": workflow_id,
    }


def _summary_response(*, draft: dict[str, Any], field_sources: dict[str, str], command: str, workflow_id: str) -> dict[str, Any]:
    return {
        "agent": "onboarding_agent",
        "agent_display_name": "Onboarding Agent",
        "action": "summarize_details",
        "message": _collected_details_message(draft),
        "operation_summary": "Review onboarding summary",
        "execution_status": "Ready",
        "workflow_status": "Ready",
        "execution_summary": "I collected the required onboarding details and prepared a summary.",
        "next_actions": "Start onboarding to submit the governed request.",
        "approval_request_id": None,
        "structured_response": {
            **onboarding_summary_response(draft, status="Ready"),
            "draft": draft,
            "field_sources": field_sources,
            "missing_fields": _blocking_missing_fields(draft),
        },
        "command": command,
        "workflow_id": workflow_id,
    }


def _draft_to_parsed(draft: dict[str, Any], command: str) -> dict[str, Any]:
    return {
        **draft,
        "raw_text_preview": command,
        "resume_uploaded": bool(draft.get("resume_uploaded")),
    }


def _field_label(field: str) -> str:
    return field.replace("_", " ").title()


def _blocking_missing_fields(values: dict[str, Any]) -> list[str]:
    return [field for field in missing_onboarding_fields(values) if field not in OPTIONAL_ONBOARDING_FIELDS]


def _state_debug(
    *,
    command: str,
    extracted: dict[str, Any],
    state_before_merge: dict[str, Any],
    state_after_merge: dict[str, Any],
    field_sources: dict[str, str],
    missing_fields: list[str],
    workflow_id: str,
) -> dict[str, Any]:
    return {
        "workflow_id": workflow_id,
        "command": command,
        "extracted_entities": extracted,
        "state_before_merge": state_before_merge,
        "state_after_merge": state_after_merge,
        "field_sources": field_sources,
        "missing_fields": missing_fields,
        "logged_at": datetime.now(timezone.utc).isoformat(),
    }


def _with_state_debug(result: dict[str, Any], state_debug: dict[str, Any]) -> dict[str, Any]:
    result["onboarding_state"] = state_debug["state_after_merge"]
    result["field_sources"] = state_debug["field_sources"]
    result["onboarding_debug"] = state_debug
    structured_response = result.get("structured_response")
    if isinstance(structured_response, dict):
        structured_response["onboarding_state"] = state_debug["state_after_merge"]
        structured_response["field_sources"] = state_debug["field_sources"]
    return result


def _collected_details_message(draft: dict[str, Any]) -> str:
    lines = [
        "All onboarding details collected.",
        "",
        f"Employee: {draft.get('name')}",
        f"Designation: {draft.get('designation')}",
        f"Department: {draft.get('department')}",
        f"Manager: {draft.get('manager')}",
        f"Joining Date: {draft.get('joining_date')}",
        f"Salary: {_format_salary(draft.get('salary'))}",
        f"Salary Structure: {draft.get('salary_structure') or 'Not provided'}",
        f"Location: {draft.get('location') or 'Not provided'}",
        f"Employment Type: {draft.get('employment_type')}",
        f"Shift: {draft.get('shift') or 'Not provided'}",
        "",
        "Would you like me to create the employee profile and start onboarding?",
    ]
    return "\n".join(lines)


def _format_salary(value: Any) -> str:
    if value in (None, ""):
        return "Not provided"
    try:
        return f"₹{int(float(value)):,}/month"
    except (TypeError, ValueError):
        return str(value)


def _merge_field_sources(state_before_merge: dict[str, Any], extracted: dict[str, Any]) -> dict[str, str]:
    existing = dict(state_before_merge.get("field_sources") or {})
    for field, value in extracted.items():
        if field == "resume_uploaded" or value in (None, "", []):
            continue
        existing[field] = "user_input"
    for field, value in state_before_merge.items():
        if field == "field_sources" or value in (None, "", []):
            continue
        existing.setdefault(field, "user_input")
    return existing


def _default_field_sources(candidate: dict[str, Any], source: str) -> dict[str, str]:
    return {field: source for field, value in candidate.items() if field != "field_sources" and value not in (None, "", [])}