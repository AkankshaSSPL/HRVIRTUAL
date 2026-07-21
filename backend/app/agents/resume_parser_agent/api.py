from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.agents.resume_parser_agent.parser import ResumeParsingError
from app.agents.resume_parser_agent.schemas import ResumeUploadResponse
from app.agents.resume_parser_agent.service import ResumeParserAgent
from app.agents.resume_parser_agent.tools import ResumeUploadError
from app.api.deps import get_current_user, require_permissions
from app.db.session import get_db
from app.models.auth import User

router = APIRouter()


@router.post("/upload", response_model=ResumeUploadResponse, dependencies=[Depends(require_permissions("agent_command:view"))])
async def upload_resume(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResumeUploadResponse:
    try:
        content = await file.read()
        result = ResumeParserAgent(db).upload_and_parse(
            filename=file.filename or "resume",
            content_type=file.content_type or "application/octet-stream",
            content=content,
            uploaded_by=current_user.id,
        )
        return ResumeUploadResponse.model_validate(result)
    except ResumeUploadError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except ResumeParsingError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Resume upload failed. Please try again.") from exc
