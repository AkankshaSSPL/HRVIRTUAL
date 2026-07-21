from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from app.agents.attendance_agent.tools import (
    absent_on,
    attendance_calendar,
    attendance_detail,
    attendance_matrix,
    attendance_record_payload,
    attendance_dashboard,
    attendance_summary,
    employee_query,
    find_employee_or_raise,
    parse_attendance_date,
    parse_attendance_status,
    parse_month_year,
    payroll_attendance_input,
    payroll_attendance_inputs,
    record_attendance,
)
from app.agents.shared.base_agent import BaseAgent


class AttendanceAgent(BaseAgent):
    name = "attendance_agent"
    description = "Attendance tracking, absence summaries, LOP inputs, and payroll attendance preparation."
    supported_actions = ["show", "record", "regularize", "matrix", "calendar", "detail", "absent_today", "payroll_summary", "lop"]
    approval_required_actions: list[str] = []

    def __init__(self, db: Session | None = None) -> None:
        self.db = db

    async def run(self, state):  # pragma: no cover
        return {"message": "Attendance Agent requires runtime invocation."}

    def execute(self, *, action: str, command: str, user_id=None, workflow_id: str | None = None) -> dict[str, Any]:
        if self.db is None:
            raise RuntimeError("AttendanceAgent requires a database session")
        action = self._classify(action, command)
        if action == "absent_today":
            target_date = parse_attendance_date(command)
            employees = absent_on(self.db, target_date)
            return self._table_response(f"Employees absent on {target_date.isoformat()}", employees, workflow_id, action="absent_today")

        month, year = parse_month_year(command)
        query = employee_query(command)

        if action == "matrix":
            matrix = attendance_matrix(self.db, month=month, year=year, employee=query)
            return self._matrix_response("Attendance matrix loaded", matrix, workflow_id)

        if action == "calendar":
            calendar_payload = attendance_calendar(self.db, month=month, year=year, employee=query)
            return self._calendar_response("Attendance calendar loaded", calendar_payload, workflow_id)

        if action == "detail":
            if not query:
                return self._status_response("Please mention the employee name for the attendance detail.", workflow_id)
            employee = find_employee_or_raise(self.db, query)
            detail = attendance_detail(self.db, employee_id=str(employee.id), attendance_date=parse_attendance_date(command))
            return self._detail_response("Attendance detail loaded", detail, workflow_id)

        if action == "record":
            if not query:
                return self._status_response("Please mention the employee name before recording attendance.", workflow_id)
            employee = find_employee_or_raise(self.db, query)
            record = record_attendance(
                self.db,
                employee=employee,
                attendance_date=parse_attendance_date(command),
                status=parse_attendance_status(command).value,
                remarks="Recorded by Attendance Agent",
                actor_id=user_id,
            )
            self.db.commit()
            return self._record_response("Attendance recorded", attendance_record_payload(record, employee), workflow_id)

        if action == "regularize":
            if not query:
                return self._status_response("Please mention the employee name before regularizing attendance.", workflow_id)
            employee = find_employee_or_raise(self.db, query)
            record = record_attendance(
                self.db,
                employee=employee,
                attendance_date=parse_attendance_date(command),
                status=parse_attendance_status(command).value,
                remarks="Regularized by Attendance Agent",
                actor_id=user_id,
                action="attendance.regularized",
            )
            self.db.commit()
            return self._record_response("Attendance regularized", attendance_record_payload(record, employee), workflow_id)

        if action == "payroll_summary":
            if query:
                employee = find_employee_or_raise(self.db, query)
                payload = payroll_attendance_input(self.db, employee=employee, month=month, year=year)
                payload.update({"employee_name": query or payload["employee_id"], "month": month, "year": year})
                return self._summary_response("Attendance prepared for payroll", payload, workflow_id)
            rows = payroll_attendance_inputs(self.db, month=month, year=year)
            return self._table_response("Attendance prepared for payroll", rows, workflow_id, action="payroll_summary")

        employee = find_employee_or_raise(self.db, query)
        summary = attendance_summary(self.db, employee=employee, month=month, year=year)
        if action == "lop":
            return self._lop_response(summary, workflow_id)
        return self._summary_response("Attendance summary generated", summary, workflow_id)

    def _classify(self, action: str, command: str) -> str:
        normalized = command.lower()
        if "absent today" in normalized or "who was absent" in normalized:
            return "absent_today"
        if "matrix" in normalized:
            return "matrix"
        if "calendar" in normalized:
            return "calendar"
        if "open" in normalized and "attendance" in normalized:
            return "detail"
        if "regularize" in normalized or "correct attendance" in normalized:
            return "regularize"
        if "payroll" in normalized or "prepare attendance" in normalized:
            return "payroll_summary"
        if "record" in normalized or "mark " in normalized:
            return "record"
        if "lop" in normalized or "loss of pay" in normalized:
            return "lop"
        return action if action in self.supported_actions else "show"

    def _matrix_response(self, message: str, matrix: dict[str, Any], workflow_id: str | None) -> dict[str, Any]:
        return {
            "agent": self.name,
            "agent_display_name": "Attendance Agent",
            "action": "matrix",
            "message": message,
            "operation_summary": "Attendance matrix",
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "approval_request_id": None,
            "workflow_id": workflow_id,
            "structured_response": {"type": "attendance_matrix", "title": message, "matrix": matrix},
        }

    def _calendar_response(self, message: str, calendar_payload: dict[str, Any], workflow_id: str | None) -> dict[str, Any]:
        return {
            "agent": self.name,
            "agent_display_name": "Attendance Agent",
            "action": "calendar",
            "message": message,
            "operation_summary": "Attendance calendar",
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "approval_request_id": None,
            "workflow_id": workflow_id,
            "structured_response": {"type": "attendance_calendar", "title": message, "calendar": calendar_payload},
        }

    def _detail_response(self, message: str, detail: dict[str, Any], workflow_id: str | None) -> dict[str, Any]:
        return {
            "agent": self.name,
            "agent_display_name": "Attendance Agent",
            "action": "detail",
            "message": message,
            "operation_summary": "Attendance detail",
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "approval_request_id": None,
            "workflow_id": workflow_id,
            "structured_response": {"type": "attendance_detail", "title": message, "detail": detail},
        }

    def _summary_response(self, message: str, summary: dict[str, Any], workflow_id: str | None) -> dict[str, Any]:
        return {
            "agent": self.name,
            "agent_display_name": "Attendance Agent",
            "action": "show",
            "message": message,
            "operation_summary": "Attendance summary",
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "approval_request_id": None,
            "workflow_id": workflow_id,
            "structured_response": {
                "type": "attendance_summary",
                "title": message,
                "summary": summary,
                "records": summary.get("records", []),
            },
        }

    def _record_response(self, message: str, record: dict[str, Any], workflow_id: str | None) -> dict[str, Any]:
        return {
            "agent": self.name,
            "agent_display_name": "Attendance Agent",
            "action": "record",
            "message": message,
            "operation_summary": "Attendance recorded",
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "approval_request_id": None,
            "workflow_id": workflow_id,
            "structured_response": {
                "type": "attendance_table",
                "title": message,
                "records": [record],
            },
        }

    def _table_response(self, message: str, records: list[dict[str, Any]], workflow_id: str | None, *, action: str) -> dict[str, Any]:
        return {
            "agent": self.name,
            "agent_display_name": "Attendance Agent",
            "action": action,
            "message": message,
            "operation_summary": "Attendance exceptions",
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "approval_request_id": None,
            "workflow_id": workflow_id,
            "structured_response": {
                "type": "attendance_table",
                "title": message,
                "records": records,
            },
        }

    def _lop_response(self, summary: dict[str, Any], workflow_id: str | None) -> dict[str, Any]:
        return {
            "agent": self.name,
            "agent_display_name": "Attendance Agent",
            "action": "lop",
            "message": "LOP calculation prepared.",
            "operation_summary": "LOP calculation",
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "approval_request_id": None,
            "workflow_id": workflow_id,
            "structured_response": {
                "type": "lop_summary",
                "title": "LOP Summary",
                "summary": summary,
            },
        }

    def _status_response(self, message: str, workflow_id: str | None) -> dict[str, Any]:
        return {
            "agent": self.name,
            "agent_display_name": "Attendance Agent",
            "action": "needs_input",
            "message": message,
            "operation_summary": "Attendance request",
            "execution_status": "Needs input",
            "workflow_status": "Needs input",
            "approval_request_id": None,
            "workflow_id": workflow_id,
            "structured_response": {
                "type": "status_banner",
                "title": "More information needed",
                "message": message,
                "status": "pending",
            },
        }
