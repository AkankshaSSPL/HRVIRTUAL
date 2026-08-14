import os
import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user, require_permissions
from app.db.session import get_db
from app.models.auth import User
from app.models.company import HRDocument

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
    return hr_document_payload(document)
