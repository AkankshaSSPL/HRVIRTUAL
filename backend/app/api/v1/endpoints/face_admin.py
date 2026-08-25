from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_permissions
from app.db.session import get_db
from app.models.auth.models import FaceLoginAttempt, User
from app.services.face_service import face_service

router = APIRouter()


class EnrollFacesRequest(BaseModel):
    images_base64: list[str]

    @field_validator("images_base64")
    @classmethod
    def validate_min_images(cls, v: list[str]) -> list[str]:
        if len(v) < 3:
            raise ValueError("At least 3 images are required for enrollment")
        return v


class FaceAttemptResponse(BaseModel):
    id: str
    user_id: str | None
    user_name: str | None
    success: bool
    confidence_score: float | None
    ip_address: str | None
    failure_reason: str | None
    attempted_at: datetime


@router.post("/users/{user_id}/enroll", dependencies=[Depends(require_permissions("face:enroll"))])
def admin_enroll_face(
    user_id: UUID,
    payload: EnrollFacesRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        total = face_service.enroll_faces(str(user_id), payload.images_base64, db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    background_tasks.add_task(face_service.retrain_classifier)
    return {
        "success": True,
        "user_id": str(user.id),
        "user_name": user.full_name,
        "embeddings_stored": total,
        "message": f"Successfully enrolled {total} face images for {user.full_name}",
    }


@router.delete("/users/{user_id}/face", dependencies=[Depends(require_permissions("face:enroll"))])
def admin_remove_face(
    user_id: UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.face_registered:
        raise HTTPException(status_code=400, detail="No face enrollment found to remove")

    try:
        face_service.remove_enrollment(str(user_id), db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    background_tasks.add_task(face_service.retrain_classifier)
    return {"success": True, "message": "Face enrollment removed."}


@router.get("/attempts", response_model=list[FaceAttemptResponse], dependencies=[Depends(require_permissions("face:view_logs"))])
def list_face_attempts(
    db: Session = Depends(get_db),
    user_id: UUID | None = Query(default=None),
    success: bool | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
):
    """View recent face login attempts. Shows users and unknown faces."""
    stmt = select(FaceLoginAttempt)
    if user_id:
        stmt = stmt.where(FaceLoginAttempt.user_id == user_id)
    if success is not None:
        stmt = stmt.where(FaceLoginAttempt.success == success)
    stmt = stmt.order_by(FaceLoginAttempt.created_at.desc()).limit(limit)

    attempts = db.scalars(stmt).all()

    return [
        FaceAttemptResponse(
            id=str(attempt.id),
            user_id=str(attempt.user_id) if attempt.user_id else None,
            user_name=attempt.user.full_name if attempt.user else None,
            success=attempt.success,
            confidence_score=attempt.confidence_score,
            ip_address=attempt.ip_address,
            failure_reason=attempt.failure_reason,
            attempted_at=attempt.created_at,
        )
        for attempt in attempts
    ]


@router.post("/retrain", dependencies=[Depends(require_permissions("face:retrain"))])
def trigger_retrain(background_tasks: BackgroundTasks):
    background_tasks.add_task(face_service.retrain_classifier)
    return {"message": "Classifier retrain scheduled"}