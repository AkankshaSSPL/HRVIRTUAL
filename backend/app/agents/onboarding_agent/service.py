from __future__ import annotations

import logging
from datetime import date, datetime, timezone
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
from app.services.email_service import send_welcome_email
from app.agents.onboarding_agent.llm import llm_available, llm_extract_onboarding, llm_compose_reply

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
        """Conversational, LLM-driven onboarding. Create-early: as soon as a name is
        known the employee record is created and the 7-step bar appears; each turn the
        assistant captures whatever the user said (LLM, regex fallback), updates the
        record, recomputes progress, and asks for the next section naturally."""
        employee_id = _latest_onboarding_finishing_employee_id(self.db, user_id)
        employee = get_employee_by_id(self.db, employee_id) if employee_id else None

        fields, source = self._extract_fields(command, employee)
        logger.info("Onboarding turn (source=%s) captured=%s", source, fields)

        if employee is None:
            if not fields.get("first_name") and not fields.get("last_name"):
                return self._ask_for_name(command=command, workflow_id=workflow_id)
            employee = self._create_early(fields=fields, user_id=user_id)
            just_captured = fields
        else:
            just_captured = self._apply_fields(employee=employee, fields=fields, command=command, user_id=user_id)

        self.db.refresh(employee)
        return self._turn(employee=employee, command=command, workflow_id=workflow_id, just_captured=just_captured)

    # ----- conversational helpers (LLM for language, code for truth) -----

    def _extract_fields(self, command: str, employee: Employee | None) -> tuple[dict[str, Any], str]:
        known = self._known_from_employee(employee) if employee else {}
        if llm_available():
            try:
                return _normalize_canonical(llm_extract_onboarding(command, known)), "llm"
            except Exception:
                logger.exception("LLM onboarding extraction failed; using rule fallback")
        return _normalize_canonical(extract_onboarding_entities(command)), "rules"

    def _known_from_employee(self, employee: Employee) -> dict[str, Any]:
        return {
            key: value
            for key, value in {
                "first_name": employee.first_name,
                "last_name": employee.last_name,
                "personal_email": employee.personal_email,
                "phone": employee.phone,
                "gender": employee.gender,
                "joining_date": employee.joining_date.isoformat() if employee.joining_date else None,
                "department_id_set": bool(employee.department_id),
                "designation_id_set": bool(employee.designation_id),
                "manager_set": bool(employee.reporting_manager_id),
                "salary_set": employee.current_salary is not None,
            }.items()
            if value not in (None, "", False)
        }

    def _create_early(self, *, fields: dict[str, Any], user_id: UUID | None) -> Employee:
        name = " ".join(part for part in (fields.get("first_name"), fields.get("last_name")) if part).strip()
        candidate = {
            "name": name,
            "email": fields.get("personal_email"),
            "phone": fields.get("phone"),
            "department": fields.get("department"),
            "designation": fields.get("designation"),
            "manager": fields.get("manager"),
            "joining_date": fields.get("joining_date") or date.today().isoformat(),
            "salary": fields.get("salary"),
            "dob": fields.get("dob"),
            "gender": fields.get("gender"),
            "employment_type": fields.get("employment_type"),
            "bank_account_number": fields.get("bank_account_number"),
            "ifsc_code": fields.get("ifsc_code"),
            "pan_number": fields.get("pan_number"),
            "aadhaar_number": fields.get("aadhaar_number"),
            "uan_number": fields.get("uan_number"),
        }
        result = _create_employee_from_onboarding(
            self.db,
            candidate=candidate,
            assets=ASSET_CHECKLIST,
            payload={"candidate_id": None, "command": "agent onboarding"},
            performed_by=user_id,
        )
        self.db.commit()
        return get_employee_by_id(self.db, UUID(result["employee"]["id"]))

    def _apply_fields(self, *, employee: Employee, fields: dict[str, Any], command: str, user_id: UUID | None) -> dict[str, Any]:
        # Supplement the LLM with a targeted regex seat parse (bare "A-3" replies).
        if not fields.get("seat"):
            regex_seat = extract_onboarding_entities(command).get("seat")
            if regex_seat:
                fields["seat"] = regex_seat

        updates: dict[str, Any] = {}
        captured: dict[str, Any] = {}
        for src, col in (
            ("first_name", "first_name"),
            ("last_name", "last_name"),
            ("personal_email", "personal_email"),
            ("phone", "phone"),
            ("dob", "dob"),
            ("gender", "gender"),
            ("employment_type", "employment_type"),
            ("joining_date", "joining_date"),
            ("bank_account_number", "bank_account_number"),
            ("ifsc_code", "ifsc_code"),
            ("pan_number", "pan_number"),
            ("aadhaar_number", "aadhaar_number"),
            ("uan_number", "uan_number"),
        ):
            if fields.get(src) is not None:
                updates[col] = fields[src]
                captured[src] = fields[src]
        if fields.get("salary") is not None:
            updates["current_salary"] = fields["salary"]
            captured["salary"] = fields["salary"]
        if fields.get("department"):
            dept = _find_or_create_department(self.db, fields["department"])
            if dept:
                updates["department_id"] = dept.id
                captured["department"] = dept.name
        if fields.get("designation"):
            desig = _find_or_create_designation(self.db, fields["designation"])
            if desig:
                updates["designation_id"] = desig.id
                captured["designation"] = desig.title
        if fields.get("manager"):
            mgr = _find_manager(self.db, fields["manager"])
            if mgr:
                updates["reporting_manager_id"] = mgr.id
                captured["manager"] = employee_display_name(mgr)
        if fields.get("seat"):
            updates["seat_label"] = str(fields["seat"]).upper()
            captured["seat"] = updates["seat_label"]

        if updates:
            update_employee_fields(self.db, employee.id, updates)
            self.db.add(
                AuditLog(
                    entity_type="employee",
                    entity_id=employee.id,
                    action="employee.onboarding_updated",
                    new_value=captured,
                    performed_by=user_id,
                )
            )
            self.db.flush()
            self.db.refresh(employee)

        # Welcome-mail confirmation (button sends "yes"); mirror the manual endpoint.
        progress = compute_onboarding_progress(self.db, employee)
        if (
            _first_pending_finishing_step(progress) == "welcome_mail"
            and _is_affirmative(command)
            and progress["welcome_kit_ready"]
            and employee.welcome_kit_sent_at is None
        ):
            if send_welcome_email(employee):
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
                captured["welcome_mail"] = "sent"

        self.db.commit()
        self.db.refresh(employee)
        return captured

    def _turn(self, *, employee: Employee, command: str, workflow_id: str, just_captured: dict[str, Any]) -> dict[str, Any]:
        progress = compute_onboarding_progress(self.db, employee)
        section_label, ask_for, kind = _next_section(progress, employee)
        completed = kind == "done"
        name = employee_display_name(employee)
        message = self._reply(
            name=name,
            percent=progress["percent"],
            section_label=section_label,
            ask_for=ask_for,
            just_captured=just_captured,
            completed=completed,
        )
        structured_response: dict[str, Any] = {
            "type": "onboarding_finishing",
            "title": "Onboarding complete" if completed else "Onboarding in progress",
            "summary": message,
            "employee_id": str(employee.id),
            "candidate": employee_profile(employee),
            "progress": progress,
            "completed": completed,
        }
        if kind == "document":
            structured_response["awaiting_upload"] = {"employee_id": str(employee.id), "document_type": "Identity Document"}
        return {
            "agent": self.name,
            "agent_display_name": "Onboarding Agent",
            "action": "onboarding_complete" if completed else "onboarding_collect",
            "message": message,
            "operation_summary": "Onboarding workflow",
            "execution_status": "Completed" if completed else "In Progress",
            "workflow_status": "Completed" if completed else "Collecting Details",
            "execution_summary": f"{name} is {progress['percent']}% onboarded.",
            "next_actions": "Open Employees to review the record." if completed else "Reply with the requested details.",
            "approval_request_id": None,
            "structured_response": structured_response,
            "command": command,
            "workflow_id": workflow_id,
            "completed_at": datetime.now(timezone.utc).isoformat() if completed else None,
        }

    def _reply(self, *, name: str, percent: int, section_label: str, ask_for: list[str], just_captured: dict[str, Any], completed: bool) -> str:
        if llm_available():
            try:
                return llm_compose_reply(
                    name=name,
                    percent=percent,
                    section_label=section_label,
                    ask_for=ask_for,
                    just_captured=just_captured,
                    completed=completed,
                )
            except Exception:
                logger.exception("LLM reply composition failed; using template")
        return _template_reply(name=name, percent=percent, section_label=section_label, ask_for=ask_for, completed=completed)

    def _ask_for_name(self, *, command: str, workflow_id: str) -> dict[str, Any]:
        message = "Sure — who are we onboarding? Tell me the new hire's name (and anything else you already have)."
        return {
            "agent": self.name,
            "agent_display_name": "Onboarding Agent",
            "action": "onboarding_collect",
            "message": message,
            "operation_summary": "Onboarding workflow",
            "execution_status": "Collecting Details",
            "workflow_status": "Collecting Details",
            "execution_summary": "Waiting for the new hire's name to begin.",
            "next_actions": "Reply with the employee's name.",
            "approval_request_id": None,
            "structured_response": {"type": "status_banner", "title": "Let's onboard someone", "summary": message},
            "command": command,
            "workflow_id": workflow_id,
        }

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
                # Mirror the manual send-welcome-kit endpoint: actually send the
                # email, and only stamp welcome_kit_sent_at if it succeeded (no
                # false "sent"). On failure the step stays pending and re-prompts.
                sent = send_welcome_email(employee)
                if sent:
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


# Noise keys the LLM/regex may return that the onboarding record does not use.
_CANONICAL_DROP = {"resume_uploaded", "salary_structure", "location", "experience", "shift", "address", "employee_code"}


def _normalize_canonical(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalize LLM (first_name/last_name/personal_email) and regex (name/email)
    extractions into one canonical field dict."""
    data = dict(raw or {})
    if "name" in data:  # regex path yields a combined name
        first, last = _split_name(data.pop("name"))
        if first:
            data.setdefault("first_name", first)
        if last:
            data.setdefault("last_name", last)
    if "email" in data and "personal_email" not in data:
        data["personal_email"] = data.pop("email")
    for key in _CANONICAL_DROP:
        data.pop(key, None)
    return {key: value for key, value in data.items() if value not in (None, "", [])}


def _next_section(progress: dict[str, Any], employee: Employee) -> tuple[str, list[str], str]:
    """Return (section_label, fields_to_ask, kind) for the first incomplete section.
    kind is one of: collect | document | seat | welcome | done."""
    by_key = {item["key"]: item for item in progress["items"]}

    if not by_key["personal_details"]["complete"]:
        needed: list[str] = []
        if not employee.first_name and not employee.last_name:
            needed.append("full name")
        elif not employee.last_name:
            needed.append("last name")
        if not employee.personal_email:
            needed.append("personal email")
        return "personal details", needed or ["personal email"], "collect"

    if not by_key["employment_details"]["complete"]:
        needed = []
        if not employee.designation_id:
            needed.append("designation")
        if not employee.department_id:
            needed.append("department")
        if not employee.reporting_manager_id:
            needed.append("reporting manager")
        return "employment details", needed, "collect"

    if not (by_key["payroll_readiness"]["complete"] and by_key["salary"]["complete"]):
        needed = []
        if employee.current_salary is None:
            needed.append("salary")
        if not employee.bank_account_number:
            needed.append("bank account number")
        if not employee.ifsc_code:
            needed.append("IFSC code")
        if not employee.pan_number:
            needed.append("PAN number")
        return "payroll details", needed, "collect"

    if not by_key["documents"]["complete"]:
        return "documents", ["an identity document (PAN, Aadhaar, etc.)"], "document"

    if not by_key["seating"]["complete"]:
        return "seating", ["a desk, e.g. A-3"], "seat"

    if not by_key["welcome_mail"]["complete"]:
        return "welcome email", ["confirmation to send the welcome email"], "welcome"

    return "done", [], "done"


def _template_reply(*, name: str, percent: int, section_label: str, ask_for: list[str], completed: bool) -> str:
    if completed:
        return f"All done — {name}'s onboarding is complete and they're now in the Employees list."
    return f"({percent}%) Next, for {section_label}: please share {', '.join(ask_for)}."


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