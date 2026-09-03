from uuid import UUID
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_db, require_permissions
from app.models.employee.models import CandidateOffer, Candidate, OfferStatus
from app.services.email_service import send_offer_email

router = APIRouter()

class OfferCreateRequest(BaseModel):
    candidate_id: UUID
    designation: str
    salary: float
    start_date: date
    expires_at: date

@router.get("", dependencies=[Depends(require_permissions("candidates:view"))])
def get_offers(db: Session = Depends(get_db)):
    result = db.execute(
        select(CandidateOffer).options(
            selectinload(CandidateOffer.candidate)
        ).order_by(CandidateOffer.offer_date.desc())
    )
    offers = result.scalars().all()

    response = []
    for offer in offers:
        candidate = offer.candidate
        name = f"{candidate.first_name or ''} {candidate.last_name or ''}".strip() if candidate else "Unknown"
        
        response.append({
            "id": str(offer.id),
            "candidate_id": str(offer.candidate_id),
            "candidate_name": name,
            "candidate_status": candidate.candidate_status if candidate else "NEW",
            "designation": offer.designation,
            "salary": float(offer.salary),
            "start_date": offer.start_date.isoformat(),
            "expires_at": offer.expires_at.isoformat(),
            "offer_date": offer.offer_date.isoformat(),
            "status": offer.status,
        })

    return {"data": response, "total": len(response)}

@router.post("", dependencies=[Depends(require_permissions("candidates:manage"))])
def create_offer(
    payload: OfferCreateRequest,
    db: Session = Depends(get_db)
):
    candidate = db.scalar(select(Candidate).where(Candidate.id == payload.candidate_id))
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
        
    offer = CandidateOffer(
        candidate_id=payload.candidate_id,
        designation=payload.designation,
        salary=payload.salary,
        start_date=payload.start_date,
        expires_at=payload.expires_at,
        offer_date=date.today(),
        status=OfferStatus.DRAFT
    )
    
    db.add(offer)
    
    # Optionally update candidate status
    candidate.candidate_status = "OFFERED"
    
    db.commit()
    db.refresh(offer)
    
    return {"message": "Offer created", "offer_id": str(offer.id)}

class OfferStatusUpdate(BaseModel):
    status: OfferStatus

@router.patch("/{offer_id}/status", dependencies=[Depends(require_permissions("candidates:manage"))])
def update_offer_status(
    offer_id: UUID,
    payload: OfferStatusUpdate,
    db: Session = Depends(get_db)
):
    offer = db.scalar(select(CandidateOffer).where(CandidateOffer.id == offer_id))
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
        
    offer.status = payload.status
    db.commit()
    return {"message": "Offer status updated"}

@router.delete("/{offer_id}", dependencies=[Depends(require_permissions("candidates:manage"))])
def delete_offer(offer_id: UUID, db: Session = Depends(get_db)):
    offer = db.scalar(select(CandidateOffer).where(CandidateOffer.id == offer_id))
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
        
    db.delete(offer)
    db.commit()
    return {"message": "Offer deleted successfully"}

@router.post("/{offer_id}/send", dependencies=[Depends(require_permissions("candidates:manage"))])
def send_offer(offer_id: UUID, db: Session = Depends(get_db)):
    offer = db.scalar(select(CandidateOffer).options(selectinload(CandidateOffer.candidate)).where(CandidateOffer.id == offer_id))
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    
    if offer.status != OfferStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Only draft offers can be sent")
        
    sent = send_offer_email(offer)
    if not sent:
        raise HTTPException(status_code=500, detail="Failed to send offer email")
        
    offer.status = OfferStatus.SENT
    db.commit()
    return {"message": "Offer email sent successfully"}

class OfferResponseRequest(BaseModel):
    action: str  # 'accept' or 'reject'

@router.post("/{offer_id}/respond")
def respond_to_offer(offer_id: UUID, payload: OfferResponseRequest, db: Session = Depends(get_db)):
    """Public endpoint for candidates to accept or reject their offer."""
    offer = db.scalar(select(CandidateOffer).options(selectinload(CandidateOffer.candidate)).where(CandidateOffer.id == offer_id))
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
        
    if offer.status not in (OfferStatus.SENT, OfferStatus.DRAFT):
        raise HTTPException(status_code=400, detail="Offer is not in a valid state to be responded to")
        
    if payload.action == 'accept':
        offer.status = OfferStatus.ACCEPTED
        if offer.candidate:
            offer.candidate.candidate_status = "ACCEPTED"
    elif payload.action == 'reject':
        offer.status = OfferStatus.DECLINED
        if offer.candidate:
            offer.candidate.candidate_status = "REJECTED"
    else:
        raise HTTPException(status_code=400, detail="Invalid action. Must be 'accept' or 'reject'")
        
    db.commit()
    return {"message": f"Offer {payload.action}ed successfully"}
