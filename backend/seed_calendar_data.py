import asyncio
from datetime import datetime, timezone, timedelta
from app.db.session import SessionLocal
from app.models.auth import User
from app.models.employee.models import Employee, Meeting, MeetingAttendee, LeaveRequest
from app.models.company.models import CompanyHoliday
from sqlalchemy import select

async def seed_calendar():
    db = SessionLocal()
    try:
        # Get an active user to assign meetings/leaves to
        user = db.query(User).filter(User.is_active == True).first()
        if not user:
            print("No active user found.")
            return

        employee = db.query(Employee).filter(Employee.user_id == user.id).first()
        if not employee:
            print("No employee record for user.")
            return

        now = datetime.now(timezone.utc)
        month = now.month
        year = now.year

        print(f"Seeding data for {month}/{year}...")

        # 1. Holidays
        # Adding to specific days in the month
        holidays = [
            CompanyHoliday(title="Labor Day", date=datetime(year, month, 7, tzinfo=timezone.utc)),
            CompanyHoliday(title="Company Foundation Day", date=datetime(year, month, 15, tzinfo=timezone.utc)),
            CompanyHoliday(title="Festival Holiday", date=datetime(year, month, 25, tzinfo=timezone.utc)),
        ]
        db.add_all(holidays)

        # 2. Meetings
        m1_start = now.replace(day=12, hour=10, minute=0, second=0, microsecond=0)
        m1 = Meeting(
            title="Project Review",
            description="Monthly project review",
            start_time=m1_start,
            end_time=m1_start + timedelta(hours=1),
            organizer_id=user.id
        )
        
        m2_start = now.replace(day=20, hour=14, minute=0, second=0, microsecond=0)
        m2 = Meeting(
            title="Team All Hands",
            description="Team all hands meeting",
            start_time=m2_start,
            end_time=m2_start + timedelta(hours=1),
            organizer_id=user.id
        )

        db.add_all([m1, m2])
        db.flush()

        db.add_all([
            MeetingAttendee(meeting_id=m1.id, user_id=user.id),
            MeetingAttendee(meeting_id=m2.id, user_id=user.id)
        ])

        # 3. Leaves
        # Add a leave for the current user
        leave1_start = now.replace(day=10)
        leave1 = LeaveRequest(
            employee_id=employee.id,
            leave_type="ANNUAL_LEAVE",
            start_date=leave1_start.date(),
            end_date=(leave1_start + timedelta(days=2)).date(),
            from_date=leave1_start.date(),
            to_date=(leave1_start + timedelta(days=2)).date(),
            total_days=2.0,
            reason="Vacation",
            status="APPROVED"
        )
        db.add(leave1)

        # 4. Birthdays
        # Update the current employee's DOB to be in this month so it shows up
        employee.dob = datetime(1990, month, 1).date()
        
        db.commit()
        print("Calendar data seeded successfully!")

    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(seed_calendar())
