from typing import Any, Optional
from uuid import UUID
from datetime import date, datetime
import secrets

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, status, UploadFile, File
import os
import shutil
import uuid
from pathlib import Path
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_permissions
from app.db.session import get_db
from app.models.auth import User
from app.models.employee.models import Candidate, CandidateStatus, ResumeUpload
from app.models.audit import AuditLog
from app.agents.employee_agent.tools import create_employee_draft, generate_next_employee_code

router = APIRouter()

class CandidateCreateRequest(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone: str
    current_company: Optional[str] = None
    expected_ctc: Optional[float] = None
    notice_period: Optional[str] = None
    source: Optional[str] = "Manual"
    experience_years: Optional[float] = None
    current_ctc: Optional[float] = None
    city: Optional[str] = None
    state: Optional[str] = None
    resume_url: Optional[str] = None

class CandidateUpdateRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    current_company: Optional[str] = None
    expected_ctc: Optional[float] = None
    notice_period: Optional[str] = None
    source: Optional[str] = None
    experience_years: Optional[float] = None
    current_ctc: Optional[float] = None
    city: Optional[str] = None
    state: Optional[str] = None
    resume_url: Optional[str] = None

class CandidateResponse(BaseModel):
    id: UUID
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    current_company: Optional[str] = None
    expected_ctc: Optional[float] = None
    notice_period: Optional[str] = None
    candidate_status: str
    source: Optional[str] = None
    created_at: datetime
    resume_url: Optional[str] = None
    parsed_resume_json: Optional[Any] = None
    
    class Config:
        from_attributes = True

@router.post("/upload-resume", response_model=dict, dependencies=[Depends(require_permissions("candidates:manage"))])
def upload_resume_for_candidate(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    upload_dir = Path("uploads/resumes")
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    ext = Path(file.filename or "").suffix
    file_id = str(uuid.uuid4())
    stored_name = f"{file_id}{ext}"
    file_path = upload_dir / stored_name
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {"url": f"/uploads/resumes/{stored_name}"}

@router.get("", response_model=list[CandidateResponse], dependencies=[Depends(require_permissions("candidates:view"))])
def list_candidates(db: Session = Depends(get_db)):
    candidates = db.scalars(
        select(Candidate)
        .where(Candidate.candidate_status != "HIRED")
        .order_by(desc(Candidate.created_at))
    ).all()
    return candidates

@router.get("/{candidate_id}", response_model=CandidateResponse, dependencies=[Depends(require_permissions("candidates:view"))])
def get_candidate(candidate_id: UUID, db: Session = Depends(get_db)):
    candidate = db.scalar(select(Candidate).where(Candidate.id == candidate_id))
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return candidate

@router.post("", response_model=CandidateResponse, dependencies=[Depends(require_permissions("candidates:manage"))])
def create_candidate(
    payload: CandidateCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    parsed_json = {
        "experience_years": payload.experience_years,
        "current_ctc": payload.current_ctc,
        "city": payload.city,
        "state": payload.state
    }
    
    candidate = Candidate(
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=payload.email,
        phone=payload.phone,
        current_company=payload.current_company,
        expected_ctc=payload.expected_ctc,
        notice_period=payload.notice_period,
        source=payload.source,
        resume_url=payload.resume_url,
        parsed_resume_json=parsed_json,
        candidate_status=CandidateStatus.NEW
    )
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    return candidate

@router.post("/{candidate_id}/start-onboarding", dependencies=[Depends(require_permissions("candidates:manage"))])
def start_onboarding(
    candidate_id: UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    candidate = db.scalar(select(Candidate).where(Candidate.id == candidate_id))
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
        
    official_email = candidate.email or f"temp_{secrets.token_hex(4)}@virtualhr.local"
    
    # Check for duplicate employee email to prevent 500 error
    from app.models.employee.models import Employee
    existing = db.scalar(select(Employee).where(Employee.official_email == official_email))
    if existing:
        raise HTTPException(status_code=400, detail=f"Employee with email {official_email} already exists.")
        
    # Start onboarding logic
    data = {
        "first_name": candidate.first_name or "Unknown",
        "last_name": candidate.last_name or "Unknown",
        "official_email": official_email,
        "personal_email": candidate.email,
        "phone": candidate.phone or "0000000000",
        "employee_code": generate_next_employee_code(db),
        "joining_date": date.today().isoformat(),
        "employment_status": "ACTIVE",
        "employment_type": "FULL_TIME",
        "initial_password": secrets.token_urlsafe(8)
    }
    
    employee, snapshot = create_employee_draft(db, data)
    
    # Optional: Log the creation
    db.add(
        AuditLog(
            entity_type="employee",
            entity_id=employee.id,
            action="employee.created_from_candidate",
            new_value=snapshot,
            performed_by=current_user.id,
        )
    )
    
    # Update candidate status instead of deleting to preserve offer history
    candidate.candidate_status = "HIRED"
    db.commit()
    
    return {"message": "Onboarding started", "employee_id": str(employee.id)}

@router.patch("/{candidate_id}", response_model=CandidateResponse, dependencies=[Depends(require_permissions("candidates:manage"))])
def update_candidate(
    candidate_id: UUID,
    payload: CandidateUpdateRequest,
    db: Session = Depends(get_db),
):
    candidate = db.scalar(select(Candidate).where(Candidate.id == candidate_id))
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
        
    update_data = payload.model_dump(exclude_unset=True)
    
    # Handle the JSON-stored fields specially
    json_fields = ["experience_years", "current_ctc", "city", "state"]
    if any(k in update_data for k in json_fields):
        current_json = candidate.parsed_resume_json or {}
        for k in json_fields:
            if k in update_data:
                current_json[k] = update_data.pop(k)
        candidate.parsed_resume_json = current_json
        # SQLAlchemy JSON mutations require flag_modified if modified in-place
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(candidate, "parsed_resume_json")
        
    for key, value in update_data.items():
        setattr(candidate, key, value)
        
    db.commit()
    db.refresh(candidate)
    return candidate

@router.delete("/{candidate_id}", dependencies=[Depends(require_permissions("candidates:manage"))])
def delete_candidate(candidate_id: UUID, db: Session = Depends(get_db)):
    candidate = db.scalar(select(Candidate).where(Candidate.id == candidate_id))
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
        
    # Delete associated resume uploads first to avoid foreign key violations
    from sqlalchemy import delete
    db.execute(delete(ResumeUpload).where(ResumeUpload.candidate_id == candidate_id))
        
    db.delete(candidate)
    db.commit()
    
    return {"message": "Candidate deleted successfully"}
