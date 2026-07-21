import os
import uuid
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user, require_permissions
from app.db.session import get_db
from app.models.audit import AuditLog
from app.models.auth import User
from app.models.employee import Employee, EmployeeDocument

router = APIRouter()

UPLOAD_DIR = os.environ.get("DOCUMENT_UPLOAD_DIR", "uploads/documents")
os.makedirs(UPLOAD_DIR, exist_ok=True)


def document_payload(document: EmployeeDocument) -> dict:
    employee = document.employee
    name = " ".join(part for part in (employee.first_name, employee.last_name) if part).strip() if employee else ""
    return {
        "id": str(document.id),
        "employee_id": str(document.employee_id),
        "employee_name": name or (employee.employee_code if employee else "Unknown employee"),
        "document_type": document.document_type,
        "document_url": document.document_url,
        "status": str(document.status),
        "expiry_date": document.expiry_date.isoformat() if getattr(document, "expiry_date", None) else None,
        "verified_at": document.verified_at.isoformat() if document.verified_at else None,
        "created_at": document.created_at.isoformat() if document.created_at else None,
    }


@router.get("", dependencies=[Depends(require_permissions("documents:view"))])
def list_documents(db: Session = Depends(get_db)):
    documents = db.scalars(
        select(EmployeeDocument)
        .options(selectinload(EmployeeDocument.employee))
        .where(EmployeeDocument.deleted_at.is_(None))
        .order_by(EmployeeDocument.created_at.desc())
    ).all()
    return [document_payload(document) for document in documents]


@router.post("", dependencies=[Depends(require_permissions("documents:manage"))])
async def create_document(
    employee_id: UUID = Form(...),
    document_type: str = Form(...),
    expiry_date: str = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    employee = db.get(Employee, employee_id)
    if not employee or employee.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Save file to disk
    ext = os.path.splitext(file.filename or "")[1] or ".bin"
    filename = f"{uuid.uuid4()}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    contents = await file.read()
    with open(filepath, "wb") as f:
        f.write(contents)

    document_url = f"/uploads/documents/{filename}"
    now = datetime.now(timezone.utc)

    document = EmployeeDocument(
        employee_id=employee.id,
        document_type=document_type.strip(),
        document_url=document_url,
        status="VERIFIED",
        verified_at=now,
    )

    # Set expiry_date if model supports it
    if expiry_date:
        try:
            from datetime import date
            document.expiry_date = date.fromisoformat(expiry_date)
        except (ValueError, AttributeError):
            pass

    db.add(document)
    db.flush()
    db.add(AuditLog(
        entity_type="employee_document",
        entity_id=document.id,
        action="document.uploaded_by_hr",
        new_value={"employee_id": str(employee.id), "document_type": document.document_type, "status": "VERIFIED"},
        performed_by=current_user.id,
    ))
    db.commit()
    db.refresh(document)
    document.employee = employee
    return document_payload(document)


@router.patch("/{document_id}/verify", dependencies=[Depends(require_permissions("documents:manage"))])
def verify_document(
    document_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = db.scalar(
        select(EmployeeDocument)
        .options(selectinload(EmployeeDocument.employee))
        .where(EmployeeDocument.id == document_id, EmployeeDocument.deleted_at.is_(None))
    )
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    now = datetime.now(timezone.utc)
    document.status = "VERIFIED"
    document.verified_at = now
    document.updated_at = now
    db.add(AuditLog(
        entity_type="employee_document",
        entity_id=document.id,
        action="document.verified",
        performed_by=current_user.id,
    ))
    db.commit()
    db.refresh(document)
    return document_payload(document)


@router.delete("/{document_id}", dependencies=[Depends(require_permissions("documents:manage"))])
def delete_document(
    document_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = db.get(EmployeeDocument, document_id)
    if not document or document.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Document not found")
    now = datetime.now(timezone.utc)
    document.deleted_at = now
    document.updated_at = now
    db.add(AuditLog(
        entity_type="employee_document",
        entity_id=document.id,
        action="document.deleted",
        performed_by=current_user.id,
    ))
    db.commit()
    return {"status": "deleted", "document_id": str(document_id)}