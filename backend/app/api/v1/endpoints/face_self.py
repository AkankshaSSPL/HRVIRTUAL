from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.auth import User
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





@router.post("/me/enroll")
def enroll_my_face(
    payload: EnrollFacesRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        total = face_service.enroll_faces(str(current_user.id), payload.images_base64, db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    background_tasks.add_task(face_service.retrain_classifier)
    return {
        "success": True,
        "embeddings_stored": total,
        "message": "Face enrollment saved successfully.",
    }


@router.delete("/me/face")
def remove_my_face(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.face_registered:
        raise HTTPException(status_code=400, detail="No face enrollment found to remove")

    try:
        face_service.remove_enrollment(str(current_user.id), db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    background_tasks.add_task(face_service.retrain_classifier)
    return {"success": True, "message": "Face enrollment removed."}