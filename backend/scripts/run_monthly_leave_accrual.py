import argparse
import logging
from datetime import date
from sqlalchemy import select, and_
from sqlalchemy.orm import Session

# Adjust the python path so it can be run from backend directory
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.db.session import SessionLocal
from app.models.employee import Employee, LeaveBalance, LeaveType
from app.models.employee.models import EmploymentStatus, EmploymentType

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

def run_monthly_accrual(target_date: date, leave_type_name: str, accrual_amount: float = 2.0):
    """
    Accrues a fixed amount of leave for all full-time active employees.
    Handles month-to-month and year-over-year carryover natively using the LeaveBalance schema.
    """
    db: Session = SessionLocal()
    try:
        current_year = target_date.year
        
        # 1. Ensure the LeaveType exists
        leave_type = db.scalar(
            select(LeaveType).where(LeaveType.name == leave_type_name, LeaveType.deleted_at.is_(None))
        )
        if not leave_type:
            logger.error(f"LeaveType '{leave_type_name}' not found. Cannot run accrual.")
            return

        # 2. Get active employees, specifically excluding CONSULTANTs who don't get paid leaves
        employees = db.scalars(
            select(Employee).where(
                Employee.deleted_at.is_(None),
                Employee.employment_type != EmploymentType.CONSULTANT,
                Employee.employment_status == EmploymentStatus.ACTIVE
            )
        ).all()
        
        logger.info(f"Found {len(employees)} active full-time/contract employees. Starting {target_date.strftime('%B %Y')} accrual...")
        
        for employee in employees:
            try:
                # 3. Check for current year's leave balance
                balance = db.scalar(
                    select(LeaveBalance).where(
                        LeaveBalance.employee_id == employee.id,
                        LeaveBalance.leave_type_id == leave_type.id,
                        LeaveBalance.year == current_year,
                        LeaveBalance.deleted_at.is_(None)
                    ).with_for_update()
                )
                
                # If balance doesn't exist for the current year, we might be crossing a year boundary!
                if not balance:
                    opening_balance = 0.0
                    
                    # Fetch previous year's balance to carry over
                    prev_balance = db.scalar(
                        select(LeaveBalance).where(
                            LeaveBalance.employee_id == employee.id,
                            LeaveBalance.leave_type_id == leave_type.id,
                            LeaveBalance.year == current_year - 1,
                            LeaveBalance.deleted_at.is_(None)
                        )
                    )
                    
                    if prev_balance:
                        opening_balance = float(prev_balance.remaining or 0)
                        logger.info(f"Year rollover for {employee.first_name} {employee.last_name}: Carried over {opening_balance} leaves from {current_year - 1}.")
                    
                    balance = LeaveBalance(
                        employee_id=employee.id,
                        leave_type_id=leave_type.id,
                        leave_type=leave_type.name,
                        year=current_year,
                        allocated=0.0,
                        opening_balance=opening_balance,
                        accrued=0.0,
                        used=0.0,
                        remaining=opening_balance
                    )
                    db.add(balance)
                    db.flush() # Flush to get an ID/object state
                
                # 4. Accrue the monthly leaves
                balance.accrued = float(balance.accrued or 0) + accrual_amount
                
                # 5. Recalculate remaining based on the strict formula
                balance.remaining = float(balance.opening_balance or 0) + float(balance.allocated or 0) + float(balance.accrued or 0) - float(balance.used or 0)
                
                db.add(balance)
                
            except Exception as e:
                logger.error(f"Error processing employee {employee.id}: {e}")
                db.rollback()
                continue
                
        db.commit()
        logger.info(f"Successfully processed monthly leave accrual for {len(employees)} employees.")
        
    finally:
        db.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run Monthly Leave Accrual Job")
    parser.add_argument("--date", type=str, help="Target date (YYYY-MM-DD). Defaults to today.", default=date.today().isoformat())
    parser.add_argument("--type", type=str, help="Leave Type Name to accrue", default="Paid Leave")
    parser.add_argument("--amount", type=float, help="Amount of leaves to accrue", default=2.0)
    
    args = parser.parse_args()
    
    try:
        target_date = date.fromisoformat(args.date)
    except ValueError:
        logger.error("Invalid date format. Use YYYY-MM-DD.")
        sys.exit(1)
        
    run_monthly_accrual(target_date=target_date, leave_type_name=args.type, accrual_amount=args.amount)
