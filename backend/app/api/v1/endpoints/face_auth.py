from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.auth.models import FaceLoginAttempt
from app.models.auth import User
from app.schemas.auth import TokenResponse
from app.services.auth_service import AuthService
from app.services.face_service import face_service

router = APIRouter()


class FaceImageRequest(BaseModel):
    image_base64: str


class DetectFacesResponse(BaseModel):
    face_count: int
    boxes: list[list[float]]


@router.post("/detect", response_model=DetectFacesResponse)
def detect_faces(payload: FaceImageRequest):
    """No auth required. Frontend calls this before every capture to
    validate exactly one face is present."""
    try:
        result = face_service.detect_faces(payload.image_base64)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not process image: {exc}") from exc
    return DetectFacesResponse(**result)


@router.post("/login", response_model=TokenResponse)
def face_login(
    payload: FaceImageRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> TokenResponse:
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    try:
        official_email, distance = face_service.recognize_face(payload.image_base64)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not process image: {exc}") from exc

    if not official_email:
        db.add(
            FaceLoginAttempt(
                user_id=None,
                success=False,
                confidence_score=distance,
                ip_address=ip_address,
                user_agent=user_agent,
                failure_reason="No matching face found",
            )
        )
        db.commit()
        raise HTTPException(status_code=401, detail="Face not recognized")

    user = db.scalar(
        select(User).where(User.email == official_email, User.deleted_at.is_(None))
    )
    if not user or not user.is_active:
        db.add(
            FaceLoginAttempt(
                user_id=user.id if user else None,
                success=False,
                confidence_score=distance,
                ip_address=ip_address,
                user_agent=user_agent,
                failure_reason="No active user account linked to this face",
            )
        )
        db.commit()
        raise HTTPException(status_code=401, detail="Face not recognized")

    db.add(
        FaceLoginAttempt(
            user_id=user.id,
            success=True,
            confidence_score=distance,
            ip_address=ip_address,
            user_agent=user_agent,
            failure_reason=None,
        )
    )
    db.commit()

    access_token, refresh_token = AuthService(db).issue_tokens(user)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)