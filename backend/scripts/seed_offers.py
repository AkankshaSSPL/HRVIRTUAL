import random
import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.employee.models import Employee, EmployeeOffer, OfferStatus


def seed_offers():
    db = SessionLocal()
    try:
        employees = db.scalars(select(Employee).where(Employee.deleted_at.is_(None))).all()
        statuses = [
            OfferStatus.ACCEPTED,
            OfferStatus.ACCEPTED,
            OfferStatus.ACCEPTED,
            OfferStatus.SENT,
            OfferStatus.DRAFT,
            OfferStatus.NEGOTIATING,
            OfferStatus.DECLINED,
            OfferStatus.EXPIRED,
        ]

        count = 0
        for emp in employees:
            # Skip if offer already exists
            existing = db.scalar(select(EmployeeOffer).where(EmployeeOffer.employee_id == emp.id))
            if existing:
                continue

            status = random.choice(statuses)
            start_date = emp.joining_date if emp.joining_date else date.today() + timedelta(days=random.randint(5, 30))
            offer_date = start_date - timedelta(days=random.randint(15, 45))
            expires_at = offer_date + timedelta(days=14)
            
            # Expire logic
            if status == OfferStatus.EXPIRED and expires_at >= date.today():
                expires_at = date.today() - timedelta(days=1)
                
            salary = float(emp.current_salary) if emp.current_salary else random.randint(40000, 120000)

            offer = EmployeeOffer(
                employee_id=emp.id,
                salary=salary,
                start_date=start_date,
                expires_at=expires_at,
                offer_date=offer_date,
                status=status,
            )
            db.add(offer)
            count += 1
            
        db.commit()
        print(f"Seeded {count} offers.")
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_offers()
