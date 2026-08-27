from fastapi import APIRouter
from app.agents.approval_agent import api as approvals
from app.agents.attendance_agent import api as attendance
from app.agents.coordinator_agent import command_api as agent_command
from app.agents.coordinator_agent import router as coordinator
from app.agents.leave_agent import api as leave
# ONBOARDING DISABLED: from app.agents.onboarding_agent import api as onboarding
from app.agents.resume_parser_agent import api as resume
from app.agents.salary_assignment_agent import api as salary_assignments
from app.api.v1.endpoints import (
    assets,
    auth,
    documents,
    employees,
    face_admin,
    face_auth,
    face_self,
    health,
    hr_documents,
    lookups,
    masters,
    pay_type,
    notifications,
    offers,
    settings,
)
from app.api.v1.endpoints import payroll as payroll_endpoints
from app.api.v1.endpoints import seats
from app.api.v1.endpoints import audit_logs
from app.api.v1.endpoints import dashboard
from app.api.v1.endpoints import users
from app.api.v1.endpoints import roles
api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(approvals.router, prefix="/approvals", tags=["approvals"])
api_router.include_router(coordinator.router, prefix="/agents", tags=["agents"])
api_router.include_router(agent_command.router, prefix="/agent-command", tags=["agent-command"])
api_router.include_router(employees.router, prefix="/employees", tags=["employees"])
api_router.include_router(documents.router, prefix="/documents", tags=["documents"])
api_router.include_router(hr_documents.router, prefix="/hr-documents", tags=["hr-documents"])
api_router.include_router(lookups.router, prefix="/lookups", tags=["lookups"])
api_router.include_router(masters.router, prefix="/masters", tags=["masters"])
api_router.include_router(pay_type.router, prefix="/pay-types", tags=["pay-types"])
api_router.include_router(attendance.router, prefix="/attendance", tags=["attendance"])
api_router.include_router(leave.router, prefix="/leave", tags=["leave"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(offers.router, prefix="/offers", tags=["offers"])
# ONBOARDING DISABLED: api_router.include_router(onboarding.router, prefix="/onboarding", tags=["onboarding"])
api_router.include_router(resume.router, prefix="/resume", tags=["resume"])
api_router.include_router(payroll_endpoints.router, prefix="/payroll", tags=["payroll"])
api_router.include_router(salary_assignments.router, prefix="/salary-assignments", tags=["salary-assignments"])
api_router.include_router(assets.router, prefix="/assets", tags=["assets"])
api_router.include_router(seats.router, prefix="/seats", tags=["seats"])
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(audit_logs.router, prefix="/audit-logs", tags=["audit-logs"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(face_auth.router, prefix="/face-auth", tags=["face-auth"])
api_router.include_router(face_self.router, prefix="/face-auth", tags=["face-auth"])
api_router.include_router(face_admin.router, prefix="/face-auth", tags=["face-auth-admin"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(roles.router, prefix="/roles", tags=["roles"])
api_router.include_router(settings.router, prefix="/settings", tags=["settings"])