from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

ApprovalHandler = Callable[[dict[str, Any]], dict[str, Any]]


class ApprovalHandlerRegistry:
    def __init__(self) -> None:
        self._handlers: dict[str, ApprovalHandler] = {}

    def register(self, key: str, handler: ApprovalHandler) -> None:
        self._handlers[key] = handler

    def get(self, key: str) -> ApprovalHandler:
        return self._handlers.get(key, placeholder_handler(key))

    def keys(self) -> list[str]:
        return sorted(self._handlers)


def placeholder_handler(key: str) -> ApprovalHandler:
    def handler(payload: dict[str, Any]) -> dict[str, Any]:
        return {
            "handler": key,
            "status": "unsupported_action",
            "message": "This approval handler is not implemented. No HRMS business mutation was performed.",
            "payload": payload,
        }
    return handler


def approve_payroll_run_handler(payload: dict[str, Any]) -> dict[str, Any]:
    """Executed when a submitted payroll run's approval is APPROVED and the
    workflow is resumed. Flips PayrollRun.status -> APPROVED and stamps
    approved_by/approved_at, which unlocks the Bank Sheet export."""
    from app.db.session import get_db
    from app.models.payroll.models import PayrollRun, PayrollRunStatus

    run_id = payload.get("payroll_run_id")
    if not run_id:
        return {
            "status": "failed",
            "message": "Missing payroll_run_id in approval payload.",
            "payload": payload,
        }

    db_gen = get_db()
    db = next(db_gen)
    try:
        run = db.get(PayrollRun, UUID(str(run_id)))
        if not run or run.deleted_at is not None:
            return {"status": "failed", "message": f"Payroll run {run_id} not found.", "payload": payload}
        if run.status != PayrollRunStatus.PENDING_APPROVAL:
            return {
                "status": "failed",
                "message": f"Payroll run {run_id} is {run.status}, expected PENDING_APPROVAL.",
                "payload": payload,
            }

        approved_by = payload.get("approved_by")
        run.status = PayrollRunStatus.APPROVED
        run.approved_by = UUID(str(approved_by)) if approved_by else None
        run.approved_at = datetime.now(timezone.utc)
        db.add(run)
        db.commit()
        return {
            "status": "success",
            "message": f"Payroll run for {run.month}/{run.year} approved. Bank sheet export unlocked.",
            "payroll_run_id": str(run.id),
        }
    finally:
        try:
            next(db_gen, None)
        except StopIteration:
            pass


def reject_payroll_run_handler(payload: dict[str, Any]) -> dict[str, Any]:
    """Executed when a submitted payroll run's approval is REJECTED. Reverts
    PayrollRun.status -> DRAFT so it can be regenerated and resubmitted."""
    from app.db.session import get_db
    from app.models.payroll.models import PayrollRun, PayrollRunStatus

    run_id = payload.get("payroll_run_id")
    if not run_id:
        return {
            "status": "failed",
            "message": "Missing payroll_run_id in rejection payload.",
            "payload": payload,
        }

    db_gen = get_db()
    db = next(db_gen)
    try:
        run = db.get(PayrollRun, UUID(str(run_id)))
        if not run or run.deleted_at is not None:
            return {"status": "failed", "message": f"Payroll run {run_id} not found.", "payload": payload}

        run.status = PayrollRunStatus.DRAFT
        db.add(run)
        db.commit()
        return {
            "status": "success",
            "message": f"Payroll run for {run.month}/{run.year} rejected and reverted to DRAFT.",
            "payroll_run_id": str(run.id),
        }
    finally:
        try:
            next(db_gen, None)
        except StopIteration:
            pass


handler_registry = ApprovalHandlerRegistry()
for handler_key in (
    "employee.create",
    "employee.update",
    "employee.delete",
    "payroll.process",
    "payroll.generate_bank_sheet",
    "leave.approve",
    "offboarding.start",
):
    handler_registry.register(handler_key, placeholder_handler(handler_key))

handler_registry.register("payroll.approve_payroll_run", approve_payroll_run_handler)
handler_registry.register("payroll.approve_payroll_run.reject", reject_payroll_run_handler)