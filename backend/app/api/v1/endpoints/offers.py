from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_db, require_permissions
from app.models.employee.models import EmployeeOffer, Employee

router = APIRouter()

@router.get("", dependencies=[Depends(require_permissions("candidates:view"))])
def get_offers(db: Session = Depends(get_db)):
    result = db.execute(
        select(EmployeeOffer).options(
            selectinload(EmployeeOffer.employee).selectinload(Employee.designation)
        ).order_by(EmployeeOffer.offer_date.desc())
    )
    offers = result.scalars().all()

    response = []
    for offer in offers:
        emp = offer.employee
        designation = emp.designation.title if emp and emp.designation else "Unknown"
        name = f"{emp.first_name or ''} {emp.last_name or ''}".strip() if emp else "Unknown"
        
        response.append({
            "id": str(offer.id),
            "candidate_name": name,
            "designation": designation,
            "salary": float(offer.salary),
            "start_date": offer.start_date.isoformat(),
            "expires_at": offer.expires_at.isoformat(),
            "offer_date": offer.offer_date.isoformat(),
            "status": offer.status,
        })

    return {"data": response, "total": len(response)}
