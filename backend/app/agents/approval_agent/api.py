from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.agents.approval_agent.schemas import (
    ApprovalAuditRead,
    ApprovalCreateRequest,
    ApprovalDecisionRequest,
    ApprovalEventRead,
    ApprovalRead,
)
from app.agents.approval_agent.service import ApprovalEngineService
from app.api.deps import get_current_user, require_permissions
from app.db.session import get_db
from app.models.auth import User

router = APIRouter()


def serialize_approval(approval, service: ApprovalEngineService) -> ApprovalRead:
    return ApprovalRead(
        id=approval.id,
        module_name=approval.module_name,
        action_name=approval.action_name,
        payload_json=approval.payload_json,
        status=str(approval.status),
        execution_status=str(approval.execution_status),
        workflow_id=approval.workflow_id,
        workflow_state_json=approval.workflow_state_json,
        approval_reason=approval.approval_reason,
        requested_by=approval.requested_by,
        approved_by=approval.approved_by,
        rejected_by=approval.rejected_by,
        resumed_at=approval.resumed_at,
        executed_at=approval.executed_at,
        created_at=approval.created_at,
        updated_at=approval.updated_at,
        events=[
            ApprovalEventRead(
                id=event.id,
                event_type=str(event.event_type),
                message=event.message,
                payload_json=event.payload_json,
                performed_by=event.performed_by,
                created_at=event.created_at,
            )
            for event in sorted(approval.events, key=lambda event: event.created_at)
        ],
        audit_logs=[
            ApprovalAuditRead(
                id=audit.id,
                action=audit.action,
                old_value=audit.old_value,
                new_value=audit.new_value,
                performed_by=audit.performed_by,
                created_at=audit.created_at,
            )
            for audit in service.list_audit_logs(approval.id)
        ],
    )


def get_service(db: Session = Depends(get_db)) -> ApprovalEngineService:
    return ApprovalEngineService(db)


@router.post("/create", response_model=ApprovalRead, dependencies=[Depends(require_permissions("approvals:manage"))])
def create_approval(
    payload: ApprovalCreateRequest,
    service: ApprovalEngineService = Depends(get_service),
    current_user: User = Depends(get_current_user),
) -> ApprovalRead:
    approval = service.create_approval(
        module_name=payload.module_name,
        action_name=payload.action_name,
        payload_json=payload.payload_json,
        approval_reason=payload.approval_reason,
        requested_by=current_user.id,
        workflow_id=payload.workflow_id,
        workflow_state_json=payload.workflow_state_json,
    )
    return serialize_approval(approval, service)


@router.get("/pending", response_model=list[ApprovalRead], dependencies=[Depends(require_permissions("approvals:view"))])
def pending_approvals(service: ApprovalEngineService = Depends(get_service)) -> list[ApprovalRead]:
    return [serialize_approval(approval, service) for approval in service.list_pending()]


@router.get("/{approval_id}", response_model=ApprovalRead, dependencies=[Depends(require_permissions("approvals:view"))])
def get_approval(approval_id: str, service: ApprovalEngineService = Depends(get_service)) -> ApprovalRead:
    try:
        return serialize_approval(service.get_approval(approval_id), service)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval request not found") from exc


@router.post("/{approval_id}/approve", response_model=ApprovalRead, dependencies=[Depends(require_permissions("approvals:manage"))])
def approve(
    approval_id: str,
    payload: ApprovalDecisionRequest,
    service: ApprovalEngineService = Depends(get_service),
    current_user: User = Depends(get_current_user),
) -> ApprovalRead:
    service.approve(approval_id, current_user.id, payload.comment)
    return serialize_approval(service.resume_workflow(approval_id, current_user.id), service)


@router.post("/{approval_id}/reject", response_model=ApprovalRead, dependencies=[Depends(require_permissions("approvals:manage"))])
def reject(
    approval_id: str,
    payload: ApprovalDecisionRequest,
    service: ApprovalEngineService = Depends(get_service),
    current_user: User = Depends(get_current_user),
) -> ApprovalRead:
    return serialize_approval(service.reject(approval_id, current_user.id, payload.comment), service)


@router.post("/{approval_id}/needs-changes", response_model=ApprovalRead, dependencies=[Depends(require_permissions("approvals:manage"))])
def needs_changes(
    approval_id: str,
    payload: ApprovalDecisionRequest,
    service: ApprovalEngineService = Depends(get_service),
    current_user: User = Depends(get_current_user),
) -> ApprovalRead:
    return serialize_approval(service.needs_changes(approval_id, current_user.id, payload.comment), service)


@router.post("/{approval_id}/resume-workflow", response_model=ApprovalRead, dependencies=[Depends(require_permissions("approvals:manage"))])
def resume_workflow(
    approval_id: str,
    service: ApprovalEngineService = Depends(get_service),
    current_user: User = Depends(get_current_user),
) -> ApprovalRead:
    return serialize_approval(service.resume_workflow(approval_id, current_user.id), service)
