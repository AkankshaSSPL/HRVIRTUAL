from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.orm.attributes import flag_modified

from app.agents.approval_agent.service import ApprovalEngineService
from app.agents.attendance_agent.service import AttendanceAgent
from app.agents.payroll_agent.service import PayrollAgent
from app.agents.salary_assignment_agent.agent import SalaryAssignmentAgent
from app.agents.salary_structure_agent.service import SalaryStructureAgent
import app.agents.employee_agent.handlers  # noqa: F401
import app.agents.leave_agent.handlers  # noqa: F401
import app.agents.onboarding_agent.handlers  # noqa: F401
import app.agents.salary_assignment_agent.handlers  # noqa: F401
from app.agents.employee_agent.service import EmployeeAgent
from app.agents.leave_agent.service import LeaveAgent
from app.agents.onboarding_agent.service import OnboardingAgent
from app.agents.shared.agent_events import AgentEvent, AgentEventType
from app.agents.shared.agent_registry import agent_registry
from app.agents.shared.base_agent import BaseAgent
from app.agents.shared.execution_tracker import ExecutionTracker
from app.agents.shared.message_types import AgentMessage, AgentMessageType
from app.agents.shared.runtime_context import RuntimeContext
from app.agents.shared.state_store import WorkflowStateStore
from app.agents.shared.workflow_state import ExecutionHistoryItem, WorkflowState, WorkflowStatus
from app.core.config import settings
from app.models.agents import AgentRun, AgentRunStatus, AgentStepStatus

# New imports for the architecture redesign
from app.agents.triage_agent.service import TriageAgent
from app.services.session_manager import SessionManager


# --- Shim class to feed TriageAgent output into unchanged _route_from_extraction ---
class _TriageExtraction:
    """Feeds TriageAgent intent string into _route_from_extraction()."""
    def __init__(self, intent: str) -> None:
        self.intent = intent


# ---------------------------------------------------------------------------
# Critical action keywords (unchanged)
# ---------------------------------------------------------------------------
CRITICAL_ACTION_KEYWORDS = {
    "create employee": ("employee_agent", "create", "employee", "create"),
    "update employee": ("employee_agent", "update", "employee", "update"),
    "delete employee": ("employee_agent", "delete", "employee", "delete"),
    "update salary": ("salary_assignment_agent", "revise", "salary_assignment", "activate"),
    "change salary": ("salary_assignment_agent", "revise", "salary_assignment", "activate"),
    "salary": ("employee_agent", "update_salary", "employee", "update_salary"),
    "approve leave": ("leave_agent", "approve", "leave", "approve"),
    "process payroll": ("payroll_agent", "process", "payroll", "process"),
    "generate payroll": ("payroll_agent", "process", "payroll", "process"),
    "generate bank sheet": ("payroll_agent", "generate_bank_sheet", "payroll", "generate_bank_sheet"),
    "deactivate employee": ("employee_agent", "deactivate", "employee", "update"),
    "send official email": ("notification_agent", "send_official_email", "notification", "send_official_email"),
    "offboarding": ("offboarding_agent", "start", "offboarding", "start"),
    "create pay type": ("payroll_agent", "create_pay_type", "payroll", "create_pay_type"),
    "add pay type rule": ("payroll_agent", "add_pay_type_rule", "payroll", "add_pay_type_rule"),
}


class PlaceholderSpecializedAgent(BaseAgent):
    def __init__(self, name: str, description: str, supported_actions: list[str], approval_required_actions: list[str]) -> None:
        self.name = name
        self.description = description
        self.supported_actions = supported_actions
        self.approval_required_actions = approval_required_actions

    async def run(self, state):  # pragma: no cover
        return {"message": f"{AGENT_DISPLAY_NAMES.get(self.name, self.name)} foundation workflow completed"}


def register_placeholder_agents() -> None:
    for agent in (
        EmployeeAgent(),
        AttendanceAgent(),
        LeaveAgent(),
        PayrollAgent(),
        SalaryAssignmentAgent(),
        SalaryStructureAgent(),
        OnboardingAgent(),
        PlaceholderSpecializedAgent(
            "offboarding_agent",
            "Future offboarding governance agent. Placeholder only.",
            ["inspect", "start"],
            ["start"],
        ),
        PlaceholderSpecializedAgent(
            "notification_agent",
            "Future official notification agent. Placeholder only.",
            ["inspect", "send_official_email"],
            ["send_official_email"],
        ),
    ):
        agent_registry.register_or_replace(agent)


register_placeholder_agents()


AGENT_DISPLAY_NAMES = {
    "employee_agent": "Employee Agent",
    "payroll_agent": "Payroll Agent",
    "salary_assignment_agent": "Salary Assignment Agent",
    "salary_structure_agent": "Salary Structure Agent",
    "onboarding_agent": "Onboarding Agent",
    "offboarding_agent": "Offboarding Agent",
    "leave_agent": "Leave Agent",
    "attendance_agent": "Attendance Agent",
    "notification_agent": "Notification Agent",
    "resume_parser_agent": "Resume Parser Agent",
    "candidate_agent": "Candidate Agent",
    "document_agent": "Document Agent",
    "asset_agent": "Asset Agent",
}

ACTION_SUMMARIES = {
    "inspect": "View employee directory",
    "search": "Search employees",
    "list": "View employee directory",
    "show_profile": "View employee profile",
    "show_department": "View department employees",
    "update": "Review employee update request",
    "create": "Prepare employee creation request",
    "delete": "Review employee deletion request",
    "deactivate": "Review employee deactivation request",
    "update_salary": "Review salary update request",
    "change_salary": "Review salary change request",
    "change_manager": "Confirm reporting manager change",
    "change_department": "Confirm department change",
    "confirm_update": "Confirm employee update",
    "create_component": "Create payroll salary component",
    "update_component": "Update payroll salary component",
    "delete_component": "Remove payroll salary component",
    "create_structure": "Create salary structure",
    "update_structure": "Update salary structure",
    "delete_structure": "Remove salary structure",
    "assign": "Assign employee salary",
    "revise": "Revise employee salary",
    "breakup": "View salary breakup",
    "refresh_breakups": "Refresh employee salary breakups",
    "history": "View salary history",
    "pending_approvals": "View pending salary approvals",
    "process": "Prepare payroll processing request",
    "generate_bank_sheet": "Prepare bank sheet generation request",
    "approve": "Review leave approval request",
    "apply": "Apply leave request",
    "balance": "View leave balance",
    "attendance": "Review attendance summary",
    "lop": "Calculate LOP inputs",
    "start": "Start workflow",
    "send_official_email": "Review official email request",
    "create_pay_type": "Create payroll pay type",
    "inspect_pay_types": "View pay type configuration",
    "add_pay_type_rule": "Add rule to pay type",
}


class CoordinatorRuntimeService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.tracker = ExecutionTracker(db)
        self.state_store = WorkflowStateStore(db)

    def submit_command(self, command: str, user_id: UUID | None, metadata: dict[str, Any] | None = None) -> AgentRun:
        state = WorkflowState()
        state.messages.append(AgentMessage(type=AgentMessageType.USER, content=command))
        state.current_step = "intent_analysis"
        state.workflow_status = WorkflowStatus.RUNNING

        run = self.tracker.start_run(
            workflow_id=state.workflow_id,
            agent_name="coordinator_agent",
            requested_by=user_id,
            metadata={"command": command, **(metadata or {})},
        )
        run_id = run.id

        try:
            # ── 1. Session: load history, expire stale active_agent ──────────────
            session_mgr = SessionManager(self.db)
            session = session_mgr.get_or_create(user_id)
            session_mgr.expire_if_stale(session)      # clears active_agent if > 30 min idle
            history = session_mgr.get_history(session, n=10)

            # ── 2. Triage: one LLM call → intent key ─────────────────────────────
            triage = TriageAgent()
            intent = triage.classify(command, history, session.active_agent)

            # ── 3. Route via existing routes dict (unchanged) ─────────────────────
            route = self._route_from_extraction(_TriageExtraction(intent)) or \
                    self._route("employee_agent", "inspect", "employee", "inspect", "general workforce")

            self.tracker.step(run, step_name="triage_routing", status=AgentStepStatus.COMPLETED,
                              input_json={"command": command, "active_agent": session.active_agent},
                              output_json={"intent": intent, "route": route})
            self.tracker.event(run, AgentEventType.TOOL_EXECUTED, "Triage classified intent",
                               "coordinator_agent", {"intent": intent, "agent": route["agent_name"]})

            execution_command = command

            self.tracker.event(run, AgentEventType.TOOL_EXECUTED, "Coordinator analyzed user intent", "coordinator_agent", route)
            self.tracker.step(run, step_name="intent_analysis", status=AgentStepStatus.COMPLETED,
                              input_json={"command": command, "canonical_command": execution_command},
                              output_json=route)
            state.add_history(ExecutionHistoryItem(step="intent_analysis", agent_name="coordinator_agent",
                                                   status="COMPLETED", metadata=route))

            state.current_agent = route["agent_name"]
            state.current_step = "agent_selection"
            self.tracker.step(run, step_name="agent_selection", status=AgentStepStatus.COMPLETED, output_json=route)
            self.tracker.event(run, AgentEventType.AGENT_STARTED, f"Selected {route['agent_name']}", route["agent_name"], route)

            context = RuntimeContext(workflow_id=state.workflow_id, user_id=user_id, correlation_id=state.workflow_id)

            if route["agent_name"] in {"employee_agent", "onboarding_agent", "attendance_agent", "leave_agent",
                                        "payroll_agent", "salary_structure_agent", "salary_assignment_agent"}:
                result = self._invoke_domain_agent(route, execution_command, context, run,
                                                   history=history, active_entity_id=session.active_entity_id)
                if result.get("approval_request_id"):
                    state.workflow_status = WorkflowStatus.WAITING_APPROVAL
                    state.approval_status = "PENDING"
                    state.approval_request_id = result["approval_request_id"]
                    state.current_step = "approval_interrupt"
                    state.messages.append(
                        AgentMessage(
                            type=AgentMessageType.APPROVAL,
                            content=result["message"],
                            agent_name=route["agent_name"],
                            metadata=result,
                        )
                    )
                    self.tracker.step(
                        run,
                        step_name="approval_interrupt",
                        status=AgentStepStatus.PENDING,
                        output_json={"approval_request_id": result["approval_request_id"],
                                     "structured_response": result.get("structured_response")},
                    )
                    self.tracker.event(
                        run,
                        AgentEventType.APPROVAL_REQUIRED,
                        f"{AGENT_DISPLAY_NAMES.get(route['agent_name'], route['agent_name'])} paused for approval",
                        route["agent_name"],
                        {"approval_request_id": result["approval_request_id"],
                         "structured_response": result.get("structured_response")},
                    )
                    self.tracker.event(run, AgentEventType.WORKFLOW_PAUSED, "Workflow paused", "coordinator_agent")
                    run.status = AgentRunStatus.WAITING_FOR_APPROVAL
                else:
                    state.workflow_status = WorkflowStatus.COMPLETED
                    state.current_step = "completed"
                    state.result = result
                    state.messages.append(
                        AgentMessage(
                            type=AgentMessageType.AGENT,
                            content=result["message"],
                            agent_name=route["agent_name"],
                            metadata=result,
                        )
                    )
                    if route["agent_name"] == "employee_agent" and result.get("action") in {"search", "list", "show_profile"}:
                        event_type = AgentEventType.EMPLOYEE_SEARCHED
                    elif route["agent_name"] == "onboarding_agent":
                        event_type = AgentEventType.ONBOARDING_STARTED
                    elif route["agent_name"] == "attendance_agent" and result.get("action") == "record":
                        event_type = AgentEventType.ATTENDANCE_RECORDED
                    elif route["agent_name"] == "attendance_agent" and result.get("action") == "lop":
                        event_type = AgentEventType.LOP_CALCULATED
                    elif route["agent_name"] == "attendance_agent":
                        event_type = AgentEventType.ATTENDANCE_SUMMARY_GENERATED
                    elif route["agent_name"] == "leave_agent" and result.get("action") == "apply":
                        event_type = AgentEventType.LEAVE_APPLIED
                    else:
                        event_type = AgentEventType.AGENT_COMPLETED
                    self.tracker.event(run, event_type,
                                       f"{AGENT_DISPLAY_NAMES.get(route['agent_name'], route['agent_name'])} completed operation",
                                       route["agent_name"], result)
                    run.status = AgentRunStatus.COMPLETED
                    run.completed_at = datetime.now(timezone.utc)
                    if state.messages[-1].metadata:
                        state.messages[-1].metadata["completed_at"] = run.completed_at.isoformat()
                        state.messages[-1].metadata["duration_ms"] = int((run.completed_at - run.started_at).total_seconds() * 1000) if run.started_at else None
            elif route["approval_required"]:
                approval = ApprovalEngineService(self.db).create_approval(
                    module_name=route["approval_module"],
                    action_name=route["approval_action"],
                    payload_json={"command": command, "route": route},
                    approval_reason=f"Critical action requires human approval: {route['matched_intent']}",
                    requested_by=user_id,
                    workflow_id=state.workflow_id,
                    workflow_state_json=state.model_dump(mode="json"),
                )
                state.workflow_status = WorkflowStatus.WAITING_APPROVAL
                state.approval_status = "PENDING"
                state.approval_request_id = str(approval.id)
                state.current_step = "approval_interrupt"
                state.messages.append(
                    AgentMessage(
                        type=AgentMessageType.APPROVAL,
                        content=f"{AGENT_DISPLAY_NAMES.get(route['agent_name'], route['agent_name'])} is waiting for human approval before execution.",
                        agent_name="coordinator_agent",
                        metadata=self._message_metadata(
                            route=route,
                            workflow_status="Waiting for Approval",
                            execution_status="Paused",
                            summary="Human approval required before continuing this governed operation.",
                            next_actions="Review the approval request in the Approval Inbox.",
                            workflow_id=state.workflow_id,
                            approval_request_id=str(approval.id),
                            started_at=run.started_at,
                            completed_at=None,
                        ),
                    )
                )
                self.tracker.step(
                    run,
                    step_name="approval_interrupt",
                    status=AgentStepStatus.PENDING,
                    output_json={"approval_request_id": str(approval.id)},
                )
                self.tracker.event(
                    run,
                    AgentEventType.APPROVAL_REQUIRED,
                    "Critical action paused for approval",
                    route["agent_name"],
                    {"approval_request_id": str(approval.id)},
                )
                self.tracker.event(run, AgentEventType.WORKFLOW_PAUSED, "Workflow paused", "coordinator_agent")
                run.status = AgentRunStatus.WAITING_FOR_APPROVAL
                result = {
                    "message": f"{AGENT_DISPLAY_NAMES.get(route['agent_name'], route['agent_name'])} paused for approval.",
                    "approval_request_id": str(approval.id),
                    "operation_summary": ACTION_SUMMARIES.get(route["action"], route["matched_intent"]),
                }
            else:
                result = self._invoke_placeholder_agent(route, command, context, run)
                is_blocked = result.get("workflow_status") == "Blocked"
                state.workflow_status = WorkflowStatus.FAILED if is_blocked else WorkflowStatus.COMPLETED
                state.current_step = "blocked" if is_blocked else "completed"
                state.result = result
                state.messages.append(
                    AgentMessage(
                        type=AgentMessageType.AGENT,
                        content=result["message"],
                        agent_name=route["agent_name"],
                        metadata=result,
                    )
                )
                self.tracker.event(
                    run,
                    AgentEventType.ERROR_OCCURRED if is_blocked else AgentEventType.AGENT_COMPLETED,
                    "Operational workflow is not available yet" if is_blocked else "Operational workflow completed",
                    route["agent_name"],
                    result,
                )
                run.status = AgentRunStatus.FAILED if is_blocked else AgentRunStatus.COMPLETED
                run.completed_at = datetime.now(timezone.utc)
                if state.messages[-1].metadata:
                    state.messages[-1].metadata["completed_at"] = run.completed_at.isoformat()
                    state.messages[-1].metadata["duration_ms"] = int((run.completed_at - run.started_at).total_seconds() * 1000) if run.started_at else None

            # ── Session: persist turn and update active_agent ─────────────────────
            session_mgr.append(session, "user", command)
            session_mgr.append(session, "assistant", result.get("message", ""),
                               agent=route["agent_name"],
                               metadata=result.get("structured_response"))

            sr = result.get("structured_response") or {}
            if sr.get("type") == "onboarding_finishing" and not sr.get("completed"):
                emp_id = sr.get("employee_id")
                session_mgr.set_active(session, "onboarding_agent",
                                       entity_id=UUID(emp_id) if emp_id else None,
                                       entity_type="employee_onboarding")
            elif sr.get("type") == "confirmation_card":
                session_mgr.set_active(session, "employee_agent")
            elif sr.get("type") in {"employee_card", "employee_profile", "attendance_summary"}:
                emp_id = sr.get("employee", {}).get("id") or sr.get("payload", {}).get("employee_id") or sr.get("summary", {}).get("employee_id")
                if emp_id:
                    session_mgr.set_active(session, route["agent_name"], entity_id=UUID(str(emp_id)), entity_type="employee")
            elif sr.get("completed") or route["agent_name"] not in {"onboarding_agent", "employee_agent", "attendance_agent", "leave_agent", "payroll_agent", "salary_structure_agent", "salary_assignment_agent"}:
                session_mgr.clear_active(session)

            run.metadata_json = {
                **(run.metadata_json or {}),
                "intent_extraction": {"intent": intent, "source": "triage_agent"},
                "workflow_state": state.model_dump(mode="json"),
                "result": result,
            }
            flag_modified(run, "metadata_json")
            self.db.add(run)
            self.db.commit()
            self.db.refresh(run)
            return run
        except Exception as exc:
            self.db.rollback()
            restored_run = self.db.get(AgentRun, run_id)
            if restored_run is not None:
                run = restored_run
            state.workflow_status = WorkflowStatus.FAILED
            state.current_step = "failed"
            result = {
                "agent": state.current_agent or "coordinator_agent",
                "agent_display_name": AGENT_DISPLAY_NAMES.get(state.current_agent or "coordinator_agent", "Coordinator Agent"),
                "action": "error",
                "message": "I could not complete this request yet.",
                "operation_summary": "Request needs attention",
                "execution_status": "Needs Review",
                "workflow_status": "Failed",
                "execution_summary": str(exc),
                "structured_response": {
                    "type": "status_banner",
                    "title": "Request could not be completed",
                    "summary": "I could not complete this request. Please review the details provided and try again.",
                    "payload": {},
                },
            }
            state.result = result
            state.messages.append(
                AgentMessage(
                    type=AgentMessageType.AGENT,
                    content=result["message"],
                    agent_name=state.current_agent or "coordinator_agent",
                    metadata=result,
                )
            )
            self.tracker.step(run, step_name="error", status=AgentStepStatus.FAILED, output_json={"error": str(exc)})
            self.tracker.event(run, AgentEventType.ERROR_OCCURRED, str(exc), "coordinator_agent")
            run.metadata_json = {**(run.metadata_json or {}), "workflow_state": state.model_dump(mode="json"), "result": result}
            self.tracker.finish(run, AgentRunStatus.FAILED, result)
            return run

    # ------------------------------------------------------------------
    # Remaining methods – unchanged except where noted
    # ------------------------------------------------------------------

    def get_workflow(self, workflow_id: str) -> AgentRun:
        run = self.db.scalar(
            select(AgentRun)
            .where(AgentRun.correlation_id == workflow_id)
            .options(selectinload(AgentRun.steps))
            .order_by(AgentRun.created_at.desc())
        )
        if not run:
            raise LookupError("Workflow not found")
        return run

    def list_workflows(self, limit: int = 20) -> list[AgentRun]:
        return list(
            self.db.scalars(
                select(AgentRun)
                .where(AgentRun.agent_name == "coordinator_agent")
                .options(selectinload(AgentRun.steps))
                .order_by(AgentRun.created_at.desc())
                .limit(limit)
            )
        )

    def list_events(self, workflow_id: str) -> list[AgentEvent]:
        run = self.get_workflow(workflow_id)
        return [AgentEvent.model_validate(event) for event in (run.metadata_json or {}).get("events", [])]

    def _route_from_extraction(self, extraction: _TriageExtraction) -> dict[str, Any] | None:
        routes = {
            "employee_search": ("employee_agent", "search", "employee", "inspect"),
            "employee_profile": ("employee_agent", "show_profile", "employee", "inspect"),
            "employee_confirmation": ("employee_agent", "confirm_update", "employee", "inspect"),
            "employee_update": ("employee_agent", "update", "employee", "update"),
            "employee_deactivate": ("employee_agent", "deactivate", "employee", "update"),
            "change_manager": ("employee_agent", "change_manager", "employee", "change_manager"),
            "change_department": ("employee_agent", "change_department", "employee", "change_department"),
            "attendance_summary": ("attendance_agent", "show", "attendance", "inspect"),
            "attendance_matrix": ("attendance_agent", "matrix", "attendance", "inspect"),
            "absent_employees": ("attendance_agent", "absent_today", "attendance", "inspect"),
            "mark_attendance": ("attendance_agent", "record", "attendance", "inspect"),
            "apply_leave": ("leave_agent", "apply", "leave", "inspect"),
            "cancel_leave": ("leave_agent", "cancel", "leave", "inspect"),
            "leave_balance": ("leave_agent", "balance", "leave", "inspect"),
            "leave_history": ("leave_agent", "history", "leave", "inspect"),
            "leave_pending": ("leave_agent", "pending", "leave", "inspect"),
            "leave_approve": ("leave_agent", "approve", "leave", "approve"),
            "leave_reject": ("leave_agent", "reject", "leave", "inspect"),
            "leave_calendar": ("leave_agent", "calendar", "leave", "inspect"),
            "create_leave_type": ("leave_agent", "create_type", "leave", "inspect"),
            "create_salary_component": ("payroll_agent", "create_component", "payroll", "create_component"),
            "update_salary_component": ("payroll_agent", "update_component", "payroll", "update_component"),
            "delete_salary_component": ("payroll_agent", "delete_component", "payroll", "delete_component"),
            "inspect_salary_components": ("payroll_agent", "inspect", "payroll", "inspect"),
            "create_salary_structure": ("salary_structure_agent", "create_structure", "payroll", "create_structure"),
            "update_salary_structure": ("salary_structure_agent", "update_structure", "payroll", "update_structure"),
            "delete_salary_structure": ("salary_structure_agent", "delete_structure", "payroll", "delete_structure"),
            "inspect_salary_structures": ("salary_structure_agent", "inspect", "payroll", "inspect"),
            "salary_breakup": ("salary_assignment_agent", "breakup", "salary_assignment", "inspect"),
            "refresh_salary_breakups": ("salary_assignment_agent", "refresh_breakups", "salary_assignment", "refresh_breakups"),
            "salary_history": ("salary_assignment_agent", "history", "salary_assignment", "inspect"),
            "assign_salary": ("salary_assignment_agent", "assign", "salary_assignment", "assign"),
            "revise_salary": ("salary_assignment_agent", "revise", "salary_assignment", "revise"),
            "generate_payroll": ("payroll_agent", "process", "payroll", "process"),
            "inspect_payroll": ("payroll_agent", "inspect", "payroll", "inspect"),
            "create_pay_type": ("payroll_agent", "create_pay_type", "payroll", "create_pay_type"),
            "inspect_pay_types": ("payroll_agent", "inspect_pay_types", "payroll", "inspect"),
            "add_pay_type_rule": ("payroll_agent", "add_pay_type_rule", "payroll", "add_pay_type_rule"),
            "onboarding": ("onboarding_agent", "start", "onboarding", "start"),
        }
        selected = routes.get(extraction.intent)
        if not selected:
            return None
        agent_name, action, approval_module, approval_action = selected
        return self._route(agent_name, action, approval_module, approval_action, extraction.intent)

    def _route(self, agent_name: str, action: str, approval_module: str, approval_action: str, matched_intent: str) -> dict[str, Any]:
        agent = agent_registry.get(agent_name)
        return {
            "matched_intent": matched_intent,
            "agent_name": agent_name,
            "action": action,
            "approval_required": action in agent.approval_required_actions,
            "approval_module": approval_module,
            "approval_action": approval_action,
        }

    def _invoke_domain_agent(
        self,
        route: dict[str, Any],
        command: str,
        context: RuntimeContext,
        run: AgentRun,
        history: list[dict] | None = None,
        active_entity_id: UUID | None = None,
    ) -> dict[str, Any]:
        if route["agent_name"] == "onboarding_agent":
            result = OnboardingAgent(self.db).execute(
                command=command,
                user_id=context.user_id,
                workflow_id=context.workflow_id,
                history=history,
                active_entity_id=active_entity_id,
            )
            step_name = "onboarding_agent_execution"
        elif route["agent_name"] == "attendance_agent":
            result = AttendanceAgent(self.db).execute(
                action=route["action"], command=command, user_id=context.user_id, workflow_id=context.workflow_id, history=history, active_entity_id=active_entity_id
            )
            step_name = "attendance_agent_execution"
        elif route["agent_name"] == "leave_agent":
            result = LeaveAgent(self.db).execute(
                action=route["action"], command=command, user_id=context.user_id, workflow_id=context.workflow_id, history=history, active_entity_id=active_entity_id
            )
            step_name = "leave_agent_execution"
        elif route["agent_name"] == "payroll_agent":
            result = PayrollAgent(self.db).execute(
                action=route["action"], command=command, user_id=context.user_id, workflow_id=context.workflow_id, history=history, active_entity_id=active_entity_id
            )
            step_name = "payroll_agent_execution"
        elif route["agent_name"] == "salary_assignment_agent":
            result = SalaryAssignmentAgent(self.db).execute(
                action=route["action"], command=command, user_id=context.user_id, workflow_id=context.workflow_id, history=history, active_entity_id=active_entity_id
            )
            step_name = "salary_assignment_agent_execution"
        elif route["agent_name"] == "salary_structure_agent":
            result = SalaryStructureAgent(self.db).execute(
                action=route["action"], command=command, user_id=context.user_id, workflow_id=context.workflow_id, history=history, active_entity_id=active_entity_id
            )
            step_name = "salary_structure_agent_execution"
        else:
            result = EmployeeAgent(self.db).execute(
                action=route["action"], command=command, user_id=context.user_id, workflow_id=context.workflow_id, history=history, active_entity_id=active_entity_id
            )
            step_name = "employee_agent_execution"
        result = {
            **result,
            "command": command,
            "workflow_id": context.workflow_id,
            "started_at": run.started_at.isoformat() if run.started_at else None,
        }
        self.tracker.step(
            run,
            step_name=step_name,
            status=AgentStepStatus.PENDING if result.get("approval_request_id") else AgentStepStatus.COMPLETED,
            input_json={"command": command, "route": route},
            output_json=result,
        )
        return result

    def _invoke_placeholder_agent(self, route: dict[str, Any], command: str, context: RuntimeContext, run: AgentRun) -> dict[str, Any]:
        operation_summary = ACTION_SUMMARIES.get(route["action"], "Coordinate workforce operation")
        agent_display_name = AGENT_DISPLAY_NAMES.get(route["agent_name"], route["agent_name"])
        result = {
            "agent": route["agent_name"],
            "agent_display_name": agent_display_name,
            "action": route["action"],
            "message": f"{agent_display_name} is not implemented yet. No HRMS records were changed.",
            "operation_summary": operation_summary,
            "execution_status": "Not Available",
            "workflow_status": "Blocked",
            "execution_summary": "The coordinator routed the request, but this specialized agent is still a placeholder.",
            "next_actions": "Build and register the domain service before enabling this command.",
            "command": command,
            "workflow_id": context.workflow_id,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "structured_response": {
                "type": "status_banner",
                "title": f"{agent_display_name} not available",
                "summary": "This workflow has not been implemented yet. Nothing was changed.",
                "payload": {"agent": route["agent_name"], "action": route["action"]},
            },
        }
        self.tracker.step(
            run,
            step_name="route_to_agent",
            status=AgentStepStatus.FAILED,
            input_json={"command": command, "route": route},
            output_json=result,
        )
        return result

    def _message_metadata(
        self,
        *,
        route: dict[str, Any],
        workflow_status: str,
        execution_status: str,
        summary: str,
        next_actions: str,
        workflow_id: str,
        approval_request_id: str | None,
        started_at: datetime | None,
        completed_at: datetime | None,
    ) -> dict[str, Any]:
        return {
            "agent": route["agent_name"],
            "agent_display_name": AGENT_DISPLAY_NAMES.get(route["agent_name"], route["agent_name"]),
            "action": route["action"],
            "operation_summary": ACTION_SUMMARIES.get(route["action"], route["matched_intent"]),
            "execution_status": execution_status,
            "workflow_status": workflow_status,
            "execution_summary": summary,
            "next_actions": next_actions,
            "workflow_id": workflow_id,
            "approval_request_id": approval_request_id,
            "started_at": started_at.isoformat() if started_at else None,
            "completed_at": completed_at.isoformat() if completed_at else None,
        }