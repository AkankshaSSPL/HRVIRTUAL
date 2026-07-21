from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.agents.salary_assignment_agent.agent import SalaryAssignmentAgent
from app.agents.salary_assignment_agent.services import SalaryAssignmentService
from app.agents.attendance_agent.tools import attendance_summary
from app.agents.employee_agent.tools import employee_display_name
from app.api.deps import get_current_user, require_permissions
from app.db.session import get_db
from app.models.auth import User
from app.models.employee import Employee


router = APIRouter()


class SalaryCommandRequest(BaseModel):
    command: str


@router.post("/command", dependencies=[Depends(require_permissions("payroll:view"))])
def salary_assignment_command(payload: SalaryCommandRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    return SalaryAssignmentAgent(db).execute(action="inspect", command=payload.command, user_id=current_user.id, workflow_id="salary-assignment-api")


@router.get("/employees/{employee_id}", dependencies=[Depends(require_permissions("payroll:view"))])
def employee_salary(employee_id: UUID, db: Session = Depends(get_db)) -> dict[str, Any]:
    service = SalaryAssignmentService(db)
    assignment = service.active_assignment(employee_id)
    if not assignment:
        employee = db.get(Employee, employee_id)
        if not employee or employee.current_salary is None:
            return {"current": None, "breakup": None, "history": service.assignment_history(employee_id), "structure_assigned": False}
        gross = float(employee.current_salary)
        return {
            "current": {
                "id": None,
                "employee_id": str(employee.id),
                "employee_name": employee_display_name(employee),
                "salary_structure_id": None,
                "salary_structure": "Salary structure not assigned",
                "gross_salary": gross,
                "gross_salary_display": f"₹{gross:,.0f}",
                "effective_from": None,
                "effective_to": None,
                "status": "UNSTRUCTURED",
            },
            "breakup": None,
            "history": service.assignment_history(employee_id),
            "structure_assigned": False,
        }
    return {
        "current": service.assignment_summary(assignment),
        "breakup": service.calculate_breakup(assignment.salary_structure, assignment.gross_salary),
        "history": service.assignment_history(employee_id),
        "structure_assigned": True,
    }


@router.get("/employees/{employee_id}/payroll-impact", dependencies=[Depends(require_permissions("payroll:view"))])
def employee_payroll_impact(
    employee_id: UUID,
    month: int = Query(default=date.today().month, ge=1, le=12),
    year: int = Query(default=date.today().year, ge=2000, le=2200),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    service = SalaryAssignmentService(db)
    employee = db.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    attendance = attendance_summary(db, employee=employee, month=month, year=year)
    assignment = service.active_assignment(employee_id)
    if not assignment:
        return {
            "employee_id": str(employee.id),
            "employee_name": attendance["employee_name"],
            "employment_type": str(employee.employment_type),
            "month": month,
            "year": year,
            "attendance": attendance,
            "salary_ready": False,
            "blocking_issues": ["Active salary assignment is missing"],
        }
    breakup = service.calculate_breakup(assignment.salary_structure, assignment.gross_salary)
    gross = float(assignment.gross_salary)
    working_days = float(attendance["working_days"] or 0)
    lop_days = float(attendance["lop_days"] or 0)
    lop_deduction = round((gross / working_days) * lop_days, 2) if working_days else 0
    other_deductions = float(breakup["deductions"])
    estimated_net = max(0, round(gross - other_deductions - lop_deduction, 2))
    blocking_issues = []
    if float(attendance["payable_days"]) < working_days and month == date.today().month and year == date.today().year:
        blocking_issues.append("Current-month attendance is still in progress")
    return {
        "employee_id": str(employee.id),
        "employee_name": attendance["employee_name"],
        "employment_type": str(employee.employment_type),
        "month": month,
        "year": year,
        "attendance": attendance,
        "salary_ready": True,
        "gross_salary": gross,
        "gross_salary_display": breakup["gross_salary_display"],
        "other_deductions": other_deductions,
        "other_deductions_display": breakup["deductions_display"],
        "lop_deduction": lop_deduction,
        "lop_deduction_display": f"₹{lop_deduction:,.0f}",
        "estimated_net": estimated_net,
        "estimated_net_display": f"₹{estimated_net:,.0f}",
        "blocking_issues": blocking_issues,
    }


@router.get("/history", dependencies=[Depends(require_permissions("payroll:view"))])
def salary_history(employee: str = Query(...), db: Session = Depends(get_db)) -> dict[str, Any]:
    service = SalaryAssignmentService(db)
    record = service.find_employee(employee)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    return {"employee_id": str(record.id), "employee_name": employee, "history": service.assignment_history(record.id)}


@router.get("/pending", dependencies=[Depends(require_permissions("payroll:view"))])
def pending_salary_assignments(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    service = SalaryAssignmentService(db)
    return [service.assignment_summary(row) for row in service.pending_assignments()]
