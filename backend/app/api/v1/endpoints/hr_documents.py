import os
import uuid
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from app.api.deps import get_current_user, require_permissions
from app.db.session import get_db, SessionLocal
from app.models.auth import User
from app.models.company import HRDocument
from app.services.knowledge_index import index_document, remove_document_index
router = APIRouter()
UPLOAD_DIR = os.environ.get('DOCUMENT_UPLOAD_DIR', 'uploads/documents')
os.makedirs(UPLOAD_DIR, exist_ok=True)
def hr_document_payload(document: HRDocument) -> dict:
    return {
        'id': str(document.id),
        'title': document.title,
        'description': document.description,
        'category': document.category,
        'status': document.status,
        'file_url': document.file_url,
        'version': document.version,
        'downloads': document.downloads,
        'lastUpdate': document.updated_at.strftime('%Y-%m-%d') if document.updated_at else None,
        'author': {
            'name': ' '.join(part for part in (document.author.first_name, document.author.last_name) if part).strip() if document.author else 'System',
            'email': document.author.email if document.author else ''
        }
    }
def _index_document_task(document_id: uuid.UUID) -> None:
    """Runs in a background task after the request session is gone — opens its own session."""
    db = SessionLocal()
    try:
        document = db.get(HRDocument, document_id)
        if document:
            index_document(db, document)
    finally:
        db.close()
@router.get('', dependencies=[Depends(require_permissions('documents:view'))])
def list_hr_documents(db: Session = Depends(get_db)):
    documents = db.scalars(
        select(HRDocument)
        .options(selectinload(HRDocument.author))
        .where(HRDocument.deleted_at.is_(None))
        .order_by(HRDocument.created_at.desc())
    ).all()
    return [hr_document_payload(document) for document in documents]
@router.post('', dependencies=[Depends(require_permissions('documents:manage'))])
async def create_hr_document(
    background_tasks: BackgroundTasks,
    title: str = Form(...),
    description: str = Form(''),
    category: str = Form(...),
    status: str = Form('Draft'),
    version: str = Form('v1.0'),
    file: UploadFile = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document_url = None
    if file:
        ext = os.path.splitext(file.filename or '')[1] or '.pdf'
        filename = f'{uuid.uuid4()}{ext}'
        filepath = os.path.join(UPLOAD_DIR, filename)
        contents = await file.read()
        with open(filepath, 'wb') as f:
            f.write(contents)
        document_url = f'/uploads/documents/{filename}'
    document = HRDocument(
        title=title,
        description=description,
        category=category,
        status=status,
        file_url=document_url,
        version=version,
        author_id=current_user.id
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    
    # Load author to return complete payload
    db.refresh(document, ['author'])

    if document_url:
        background_tasks.add_task(_index_document_task, document.id)
    return hr_document_payload(document)

@router.delete('/{document_id}', dependencies=[Depends(require_permissions('documents:manage'))])
def delete_hr_document(document_id: str, db: Session = Depends(get_db)):
    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document ID")
    document = db.get(HRDocument, doc_uuid)
    if not document or document.deleted_at:
        raise HTTPException(status_code=404, detail="Document not found")
    document.deleted_at = datetime.now(timezone.utc)
    db.commit()
    remove_document_index(db, doc_uuid)
    return {"message": "Document deleted"}

class BulkDeleteRequest(BaseModel):
    document_ids: List[str]

@router.post('/bulk-delete', dependencies=[Depends(require_permissions('documents:manage'))])
def bulk_delete_hr_documents(payload: BulkDeleteRequest, db: Session = Depends(get_db)):
    deleted_count = 0
    for doc_id in payload.document_ids:
        try:
            doc_uuid = uuid.UUID(doc_id)
            document = db.get(HRDocument, doc_uuid)
            if document and not document.deleted_at:
                document.deleted_at = datetime.now(timezone.utc)
                remove_document_index(db, doc_uuid)
                deleted_count += 1
        except ValueError:
            continue
    db.commit()
    return {"message": f"{deleted_count} documents deleted"}
