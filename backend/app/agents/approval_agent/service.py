from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.orm.attributes import flag_modified

from app.agents.approval_agent.handlers import handler_registry
from app.agents.shared.interrupt_manager import interrupt_manager
from app.agents.shared.agent_events import AgentEvent, AgentEventType
from app.models.agents import AgentRun, AgentRunStatus
from app.models.approvals import ApprovalEvent, ApprovalEventType, ApprovalExecutionStatus, ApprovalRequest, ApprovalStatus
from app.models.audit import AuditLog


class ApprovalEngineService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create_approval(
        self,
        *,
        module_name: str,
        action_name: str,
        payload_json: dict[str, Any],
        approval_reason: str,
        requested_by: str | UUID | None = None,
        workflow_id: str | None = None,
        workflow_state_json: dict[str, Any] | None = None,
    ) -> ApprovalRequest:
        resolved_workflow_id = workflow_id or str(uuid4())
        state = workflow_state_json or {
            "workflow_id": resolved_workflow_id,
            "module_name": module_name,
            "action_name": action_name,
            "payload_json": payload_json,
            "approval_reason": approval_reason,
            "requested_by": str(requested_by) if requested_by else None,
            "execution_status": ApprovalExecutionStatus.WAITING_FOR_APPROVAL,
        }

        approval = ApprovalRequest(
            module_name=module_name,
            action_name=action_name,
            payload_json=payload_json,
            approval_reason=approval_reason,
            workflow_id=resolved_workflow_id,
            workflow_state_json=state,
            execution_status=ApprovalExecutionStatus.WAITING_FOR_APPROVAL,
            status=ApprovalStatus.PENDING,
            requested_by=UUID(str(requested_by)) if requested_by else None,
        )
        self.db.add(approval)
        self.db.flush()
        self._event(approval, ApprovalEventType.CREATED, "Approval request created", performed_by=requested_by, payload=state)
        self._audit(
            entity_type="approval_request",
            entity_id=approval.id,
            action="approval.created",
            new_value=self._audit_snapshot(approval),
            performed_by=requested_by,
        )
        self.db.commit()
        return self.get_approval(approval.id)

    def list_pending(self) -> list[ApprovalRequest]:
        return list(
            self.db.scalars(
                select(ApprovalRequest)
                .where(ApprovalRequest.status == ApprovalStatus.PENDING)
                .options(selectinload(ApprovalRequest.events))
                .order_by(ApprovalRequest.created_at.desc())
            )
        )

    def get_approval(self, approval_id: str | UUID) -> ApprovalRequest:
        approval = self.db.scalar(
            select(ApprovalRequest)
            .where(ApprovalRequest.id == approval_id)
            .options(selectinload(ApprovalRequest.events))
        )
        if approval is None:
            raise LookupError("Approval request not found")
        return approval

    def list_audit_logs(self, approval_id: str | UUID) -> list[AuditLog]:
        return list(
            self.db.scalars(
                select(AuditLog)
                .where(AuditLog.entity_type == "approval_request", AuditLog.entity_id == approval_id)
                .order_by(AuditLog.created_at.asc())
            )
        )

    def approve(self, approval_id: str | UUID, actor_id: str | UUID, comment: str | None = None) -> ApprovalRequest:
        approval = self.get_approval(approval_id)
        if approval.status in {
            ApprovalStatus.APPROVED,
            ApprovalStatus.REJECTED,
            ApprovalStatus.NEEDS_CHANGES,
            ApprovalStatus.EXECUTED,
            ApprovalStatus.FAILED,
        }:
            return approval
        old_value = self._audit_snapshot(approval)
        approval.status = ApprovalStatus.APPROVED
        approval.execution_status = ApprovalExecutionStatus.READY_TO_RESUME
        approval.approved_by = UUID(str(actor_id))
        self._event(approval, ApprovalEventType.APPROVED, comment or "Approval request approved", actor_id)
        self._audit("approval_request", approval.id, "approval.approved", old_value, self._audit_snapshot(approval), actor_id)
        self.db.commit()
        return self.get_approval(approval_id)

    def reject(self, approval_id: str | UUID, actor_id: str | UUID, comment: str | None = None) -> ApprovalRequest:
        approval = self.get_approval(approval_id)
        if approval.status != ApprovalStatus.PENDING:
            return approval
        old_value = self._audit_snapshot(approval)
        approval.status = ApprovalStatus.REJECTED
        approval.execution_status = ApprovalExecutionStatus.BLOCKED
        approval.rejected_by = UUID(str(actor_id))
        rejection_result = self._execute_rejection_handler(approval, actor_id, comment)
        if rejection_result:
            approval.workflow_state_json = {
                **(approval.workflow_state_json or {}),
                "decision": "REJECTED",
                "rejection_result": rejection_result,
            }
        self._event(approval, ApprovalEventType.REJECTED, comment or "Approval request rejected", actor_id)
        self._audit("approval_request", approval.id, "approval.rejected", old_value, self._audit_snapshot(approval), actor_id)
        self.db.commit()
        return self.get_approval(approval_id)

    def needs_changes(self, approval_id: str | UUID, actor_id: str | UUID, comment: str | None = None) -> ApprovalRequest:
        approval = self.get_approval(approval_id)
        if approval.status != ApprovalStatus.PENDING:
            return approval
        old_value = self._audit_snapshot(approval)
        approval.status = ApprovalStatus.NEEDS_CHANGES
        approval.execution_status = ApprovalExecutionStatus.BLOCKED
        self._event(approval, ApprovalEventType.NEEDS_CHANGES, comment or "Approval request needs changes", actor_id)
        self._audit("approval_request", approval.id, "approval.needs_changes", old_value, self._audit_snapshot(approval), actor_id)
        self.db.commit()
        return self.get_approval(approval_id)

    def resume_workflow(self, approval_id: str | UUID, actor_id: str | UUID) -> ApprovalRequest:
        approval = self.get_approval(approval_id)
        if approval.status == ApprovalStatus.EXECUTED or approval.execution_status == ApprovalExecutionStatus.EXECUTED:
            return approval
        old_value = self._audit_snapshot(approval)
        if approval.status != ApprovalStatus.APPROVED:
            approval.execution_status = ApprovalExecutionStatus.BLOCKED
            self._event(
                approval,
                ApprovalEventType.FAILED,
                "Workflow resume blocked because approval is not approved",
                actor_id,
            )
            self.db.commit()
            return self.get_approval(approval_id)

        approval.execution_status = ApprovalExecutionStatus.RESUMING
        approval.resumed_at = datetime.now(timezone.utc)
        resume_command = interrupt_manager.resume_with_decision({"decision": "APPROVED", "approval_request_id": str(approval.id)})
        self._event(
            approval,
            ApprovalEventType.WORKFLOW_RESUMED,
            "Workflow resumed with human approval",
            actor_id,
            {"command": repr(resume_command)},
        )

        handler_key = f"{approval.module_name}.{approval.action_name}"
        handler_payload = {
            **(approval.payload_json or {}),
            "approval_request_id": str(approval.id),
            "requested_by": str(approval.requested_by) if approval.requested_by else None,
            "approved_by": str(actor_id),
        }
        result = handler_registry.get(handler_key)(handler_payload)
        if result.get("status") == "unsupported_action":
            approval.workflow_state_json = {
                **(approval.workflow_state_json or {}),
                "decision": "APPROVED",
                "execution_status": ApprovalExecutionStatus.FAILED,
                "result": result,
            }
            approval.status = ApprovalStatus.FAILED
            approval.execution_status = ApprovalExecutionStatus.FAILED
            self._event(approval, ApprovalEventType.FAILED, "Approved workflow has no implemented execution handler", actor_id, result)
            self._audit("approval_request", approval.id, "approval.workflow_failed", old_value, self._audit_snapshot(approval), actor_id)
            self._resume_agent_run(approval, result)
            self.db.commit()
            return self.get_approval(approval_id)
        approval.workflow_state_json = {
            **(approval.workflow_state_json or {}),
            "decision": "APPROVED",
            "execution_status": ApprovalExecutionStatus.EXECUTED,
            "result": result,
        }
        approval.status = ApprovalStatus.EXECUTED
        approval.execution_status = ApprovalExecutionStatus.EXECUTED
        approval.executed_at = datetime.now(timezone.utc)
        self._event(approval, ApprovalEventType.EXECUTED, "Approved placeholder handler executed", actor_id, result)
        self._audit("approval_request", approval.id, "approval.workflow_executed", old_value, self._audit_snapshot(approval), actor_id)
        self._resume_agent_run(approval, result)
        self.db.commit()
        return self.get_approval(approval_id)

    def _event(
        self,
        approval: ApprovalRequest,
        event_type: ApprovalEventType,
        message: str,
        performed_by: str | UUID | None = None,
        payload: dict[str, Any] | None = None,
    ) -> None:
        self.db.add(
            ApprovalEvent(
                approval_request_id=approval.id,
                event_type=event_type,
                message=message,
                performed_by=UUID(str(performed_by)) if performed_by else None,
                payload_json=payload,
            )
        )

    def _audit(
        self,
        entity_type: str,
        entity_id: UUID,
        action: str,
        old_value: dict[str, Any] | None = None,
        new_value: dict[str, Any] | None = None,
        performed_by: str | UUID | None = None,
    ) -> None:
        self.db.add(
            AuditLog(
                entity_type=entity_type,
                entity_id=entity_id,
                action=action,
                old_value=old_value,
                new_value=new_value,
                performed_by=UUID(str(performed_by)) if performed_by else None,
            )
        )

    def _audit_snapshot(self, approval: ApprovalRequest) -> dict[str, Any]:
        return {
            "id": str(approval.id),
            "module_name": approval.module_name,
            "action_name": approval.action_name,
            "status": str(approval.status),
            "execution_status": str(approval.execution_status),
            "workflow_id": approval.workflow_id,
        }

    def _resume_agent_run(self, approval: ApprovalRequest, result: dict[str, Any]) -> None:
        run = self.db.scalar(select(AgentRun).where(AgentRun.correlation_id == approval.workflow_id).order_by(AgentRun.created_at.desc()))
        if not run:
            return

        metadata = dict(run.metadata_json or {})
        state = dict(metadata.get("workflow_state") or {})
        state["workflow_status"] = "COMPLETED"
        state["approval_status"] = "EXECUTED"
        state["current_step"] = "completed"
        state["result"] = result
        messages = list(state.get("messages") or [])
        messages.append(
            {
                "id": f"workflow-resumed-{approval.id}",
                "type": "workflow_message",
                "content": result.get("message", "Approved workflow executed."),
                "agent_name": "employee_agent" if approval.module_name == "employee" else None,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "metadata": result,
            }
        )
        state["messages"] = messages

        event = AgentEvent(
            workflow_id=approval.workflow_id,
            event_type=AgentEventType.WORKFLOW_RESUMED,
            agent_name="employee_agent" if approval.module_name == "employee" else None,
            message="Approved workflow resumed and executed",
            payload=result,
        )
        metadata["workflow_state"] = state
        metadata["result"] = result
        events = [*metadata.get("events", []), event.model_dump(mode="json")]
        employee_event_type = self._employee_event_type(approval.action_name)
        if approval.module_name == "employee" and employee_event_type:
            events.append(
                AgentEvent(
                    workflow_id=approval.workflow_id,
                    event_type=employee_event_type,
                    agent_name="employee_agent",
                    message="Employee operation executed after approval",
                    payload=result,
                ).model_dump(mode="json")
            )
        if approval.module_name == "onboarding":
            events.extend(
                [
                    AgentEvent(workflow_id=approval.workflow_id, event_type=AgentEventType.EMPLOYEE_CREATED, agent_name="employee_agent", message="Employee record created from onboarding", payload=result).model_dump(mode="json"),
                    AgentEvent(workflow_id=approval.workflow_id, event_type=AgentEventType.DOCUMENT_PENDING, agent_name="document_agent", message="Document checklist generated", payload=result).model_dump(mode="json"),
                    AgentEvent(workflow_id=approval.workflow_id, event_type=AgentEventType.ASSET_REQUESTED, agent_name="asset_agent", message="Asset allocation requested", payload=result).model_dump(mode="json"),
                    AgentEvent(workflow_id=approval.workflow_id, event_type=AgentEventType.ONBOARDING_COMPLETED, agent_name="onboarding_agent", message="Onboarding workflow completed", payload=result).model_dump(mode="json"),
                ]
            )
        if approval.module_name == "leave":
            events.append(
                AgentEvent(workflow_id=approval.workflow_id, event_type=AgentEventType.LEAVE_APPROVED, agent_name="leave_agent", message="Leave approval executed", payload=result).model_dump(mode="json")
            )
        metadata["events"] = events
        run.metadata_json = metadata
        run.status = AgentRunStatus.COMPLETED
        run.completed_at = datetime.now(timezone.utc)
        flag_modified(run, "metadata_json")
        self.db.add(run)

    def _employee_event_type(self, action_name: str) -> AgentEventType | None:
        if action_name == "create":
            return AgentEventType.EMPLOYEE_CREATED
        if action_name == "deactivate":
            return AgentEventType.EMPLOYEE_DEACTIVATED
        if action_name in {"update", "update_salary", "change_manager", "change_department"}:
            return AgentEventType.EMPLOYEE_UPDATED
        return None

    def _execute_rejection_handler(self, approval: ApprovalRequest, actor_id: str | UUID, comment: str | None) -> dict[str, Any] | None:
        handler_key = f"{approval.module_name}.{approval.action_name}.reject"
        if handler_key not in handler_registry.keys():
            return None
        handler_payload = {
            **(approval.payload_json or {}),
            "approval_request_id": str(approval.id),
            "requested_by": str(approval.requested_by) if approval.requested_by else None,
            "rejected_by": str(actor_id),
            "comments": comment,
        }
        return handler_registry.get(handler_key)(handler_payload)
