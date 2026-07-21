from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

from app.agents.approval_agent.handlers import handler_registry
from app.agents.employee_agent.service import audit_employee_action
from app.agents.employee_agent.tools import (
    create_employee_draft,
    deactivate_employee,
    employee_profile,
    get_employee_by_id,
    soft_delete_employee,
    update_employee_fields,
)
from app.agents.salary_assignment_agent.services import SalaryAssignmentService
from app.agents.salary_assignment_agent.tools.parsers import parse_effective_date
from app.db.session import SessionLocal


def _actor(payload: dict[str, Any]) -> UUID | None:
    value = payload.get("approved_by") or payload.get("requested_by")
    return UUID(str(value)) if value else None


def _employee_id(payload: dict[str, Any]) -> UUID:
    value = payload.get("employee_id")
    if not value:
        raise LookupError("Employee approval payload does not include employee_id")
    return UUID(str(value))


def execute_employee_update(payload: dict[str, Any]) -> dict[str, Any]:
    db = SessionLocal()
    try:
        employee_id = _employee_id(payload)
        fields = {key: value for key, value in (payload.get("fields") or {}).items() if value is not None}
        employee, old_value, new_value = update_employee_fields(db, employee_id, fields)
        audit_employee_action(
            db,
            action=f"employee.{payload.get('action', 'update')}.executed",
            payload=payload,
            performed_by=_actor(payload),
            entity_id=employee.id,
            old_value=old_value,
            new_value=new_value,
        )
        db.commit()
        return {
            "status": "executed",
            "message": "Approved employee update executed.",
            "employee": employee_profile(employee),
            "structured_response": {
                "type": "employee_card",
                "title": "Employee update completed",
                "summary": "The approved employee change has been applied and audited.",
                "employee": employee_profile(employee),
                "payload": payload,
            },
        }
    finally:
        db.close()


def execute_salary_update(payload: dict[str, Any]) -> dict[str, Any]:
    db = SessionLocal()
    try:
        employee_id = _employee_id(payload)
        employee = get_employee_by_id(db, employee_id)
        if not employee:
            raise LookupError("Employee not found")
        old_value = employee_profile(employee)
        new_salary = payload.get("fields", {}).get("current_salary")
        salary_service = SalaryAssignmentService(db)
        active_assignment = salary_service.active_assignment(employee_id)
        assignment_result = None
        breakup = None
        if active_assignment:
            effective_from = parse_effective_date(payload.get("command") or "") if payload.get("command") else date.today()
            pending_assignment = salary_service.create_pending_assignment(
                employee=employee,
                structure=active_assignment.salary_structure,
                gross_salary=new_salary,
                effective_from=effective_from,
                requested_by=_actor(payload),
                reason=payload.get("command") or "Approved employee salary revision",
            )
            assignment_result = salary_service.activate_assignment(pending_assignment.id, _actor(payload))
            breakup = salary_service.calculate_breakup(active_assignment.salary_structure, new_salary)
            employee = get_employee_by_id(db, employee_id)
            new_value = employee_profile(employee)
        else:
            employee, _, new_value = update_employee_fields(db, employee_id, {"current_salary": new_salary})
        result_payload = {
            **payload,
            "current_value": old_value.get("salary") or "Not assigned",
            "proposed_value": new_value.get("salary") or payload.get("proposed_value"),
            "salary_assignment": assignment_result,
            "breakup": breakup,
            "salary_structure_assigned": bool(active_assignment),
        }
        audit_employee_action(
            db,
            action="employee.salary_update.executed",
            payload=result_payload,
            performed_by=_actor(payload),
            entity_id=employee.id,
            old_value=old_value,
            new_value=new_value,
        )
        db.commit()
        return {
            "status": "executed",
            "message": "Approved salary update executed.",
            "employee": employee_profile(employee),
            "assignment": assignment_result,
            "breakup": breakup,
            "structured_response": {
                "type": "approval_diff_card",
                "title": "Salary update completed",
                "summary": "The approved compensation change has been applied across Employee Master and salary details." if active_assignment else "The approved salary was saved in Employee Master. Assign a salary structure to generate a component breakup.",
                "payload": result_payload,
                "employee": employee_profile(employee),
                "assignment": assignment_result,
                "breakup": breakup,
            },
        }
    finally:
        db.close()


def execute_employee_create(payload: dict[str, Any]) -> dict[str, Any]:
    db = SessionLocal()
    try:
        employee, new_value = create_employee_draft(db, payload.get("fields") or payload)
        audit_employee_action(
            db,
            action="employee.create.executed",
            payload=payload,
            performed_by=_actor(payload),
            entity_id=employee.id,
            old_value=None,
            new_value=new_value,
        )
        db.commit()
        return {
            "status": "executed",
            "message": "Approved employee draft created.",
            "employee": employee_profile(employee),
            "structured_response": {
                "type": "employee_card",
                "title": "Employee created",
                "summary": "The approved employee draft has been created.",
                "employee": employee_profile(employee),
                "payload": payload,
            },
        }
    finally:
        db.close()


def execute_employee_delete(payload: dict[str, Any]) -> dict[str, Any]:
    db = SessionLocal()
    try:
        employee, old_value, new_value = soft_delete_employee(db, _employee_id(payload))
        audit_employee_action(
            db,
            action="employee.delete.executed",
            payload=payload,
            performed_by=_actor(payload),
            entity_id=employee.id,
            old_value=old_value,
            new_value=new_value,
        )
        db.commit()
        return {
            "status": "executed",
            "message": "Approved employee deletion soft-deleted the employee record.",
            "structured_response": {
                "type": "status_banner",
                "title": "Employee deleted",
                "summary": "The employee record was soft-deleted and audited.",
                "payload": payload,
            },
        }
    finally:
        db.close()


def execute_employee_deactivate(payload: dict[str, Any]) -> dict[str, Any]:
    db = SessionLocal()
    try:
        employee, old_value, new_value = deactivate_employee(db, _employee_id(payload))
        audit_employee_action(
            db,
            action="employee.deactivate.executed",
            payload=payload,
            performed_by=_actor(payload),
            entity_id=employee.id,
            old_value=old_value,
            new_value=new_value,
        )
        db.commit()
        return {
            "status": "executed",
            "message": "Approved employee deactivation executed.",
            "employee": employee_profile(employee),
            "structured_response": {
                "type": "employee_card",
                "title": "Employee deactivated",
                "summary": "The employee status was updated and audited.",
                "employee": employee_profile(employee),
                "payload": payload,
            },
        }
    finally:
        db.close()


for key, handler in {
    "employee.create": execute_employee_create,
    "employee.update": execute_employee_update,
    "employee.update_salary": execute_salary_update,
    "employee.delete": execute_employee_delete,
    "employee.change_manager": execute_employee_update,
    "employee.change_department": execute_employee_update,
    "employee.deactivate": execute_employee_deactivate,
}.items():
    handler_registry.register(key, handler)
