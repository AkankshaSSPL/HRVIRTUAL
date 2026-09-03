import asyncio
from datetime import datetime, timezone
from app.db.session import SessionLocal
from app.models.employee.models import Meeting, LeaveRequest, MeetingAttendee, Employee
from app.models.company.models import CompanyHoliday
from sqlalchemy import delete

async def cleanup_calendar():
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        month = now.month
        year = now.year

        print(f"Cleaning up data for {month}/{year}...")

        # 1. Delete Company Holidays for this month
        db.query(CompanyHoliday).filter(
            CompanyHoliday.title.in_(["Labor Day", "Company Foundation Day", "Festival Holiday"])
        ).delete()

        # 2. Delete Meetings
        meetings = db.query(Meeting).filter(
            Meeting.title.in_(["Project Review", "Team All Hands"])
        ).all()
        
        meeting_ids = [m.id for m in meetings]
        if meeting_ids:
            db.query(MeetingAttendee).filter(MeetingAttendee.meeting_id.in_(meeting_ids)).delete(synchronize_session=False)
            db.query(Meeting).filter(Meeting.id.in_(meeting_ids)).delete(synchronize_session=False)

        # 3. Delete Leaves
        db.query(LeaveRequest).filter(
            LeaveRequest.reason == "Vacation",
            LeaveRequest.leave_type == "ANNUAL_LEAVE"
        ).delete(synchronize_session=False)
        
        db.commit()
        print("Mock calendar data removed successfully!")

    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(cleanup_calendar())
