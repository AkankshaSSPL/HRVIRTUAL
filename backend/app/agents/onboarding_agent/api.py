from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.resume_parser_agent.service import ResumeParserAgent
from app.api.deps import get_current_user, require_permissions, require_roles
from app.db.session import get_db
from app.models.agents import AgentRun
from app.models.auth import User

router = APIRouter()


@router.post("/resume", dependencies=[Depends(require_permissions("agent_command:view"))])
async def upload_resume(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    content = await file.read()
    return ResumeParserAgent(db).upload_and_parse(
        filename=file.filename or "resume",
        content_type=file.content_type or "application/octet-stream",
        content=content,
        uploaded_by=current_user.id,
    )


@router.get(
    "/state/{workflow_id}",
    dependencies=[Depends(require_roles("Super Admin"))],
)
def onboarding_state_debug(workflow_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    run = db.scalar(
        select(AgentRun)
        .where(AgentRun.correlation_id == workflow_id, AgentRun.agent_name == "coordinator_agent")
        .order_by(AgentRun.created_at.desc())
    )
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Onboarding workflow not found")
    result = (run.metadata_json or {}).get("result") or {}
    return {
        "workflow_id": workflow_id,
        "onboarding_state": result.get("onboarding_state") or {},
        "debug": result.get("onboarding_debug") or {},
    }
