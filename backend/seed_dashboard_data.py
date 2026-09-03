import sys
import os
import uuid
from datetime import datetime, timezone, timedelta

# Add backend directory to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import SessionLocal
from app.models.company.models import Announcement
from app.models.employee.models import Meeting, MeetingAttendee
from app.models.auth import User

def seed_data():
    db = SessionLocal()
    try:
        # Check if announcements exist
        if db.query(Announcement).count() == 0:
            print("Seeding announcements...")
            announcements = [
                Announcement(
                    title="Welcome to New Financial Year 2025",
                    category="Company News",
                    priority="Urgent",
                    content="Welcome everyone to the new financial year.",
                    publish_date=datetime.now(timezone.utc) - timedelta(days=1)
                ),
                Announcement(
                    title="Updated Employee Handbook and Policies",
                    category="Policy Updates",
                    priority="Urgent",
                    content="Please review the updated employee handbook.",
                    publish_date=datetime.now(timezone.utc) - timedelta(days=2)
                ),
                Announcement(
                    title="Annual Performance Review Process",
                    category="HR Updates",
                    priority="Urgent",
                    content="The annual performance review process has started.",
                    publish_date=datetime.now(timezone.utc) - timedelta(days=3)
                ),
                Announcement(
                    title="New Employee Benefits Program Launch",
                    category="Benefits",
                    priority="Normal",
                    content="We are launching a new benefits program.",
                    publish_date=datetime.now(timezone.utc) - timedelta(days=4)
                ),
                Announcement(
                    title="IT Department System Maintenance",
                    category="IT Updates",
                    priority="Normal",
                    content="System maintenance will occur this weekend.",
                    publish_date=datetime.now(timezone.utc) - timedelta(days=5)
                )
            ]
            db.add_all(announcements)
            db.commit()
            print("Announcements seeded.")
        else:
            print("Announcements already exist.")

        # Check if meetings exist
        if db.query(Meeting).count() == 0:
            print("Seeding meetings...")
            # Assign to the first user
            user = db.query(User).first()
            if user:
                meeting = Meeting(
                    title="Weekly Team Sync",
                    description="Sync up on weekly tasks",
                    start_time=datetime.now(timezone.utc) + timedelta(hours=2),
                    end_time=datetime.now(timezone.utc) + timedelta(hours=3),
                    organizer_id=user.id
                )
                db.add(meeting)
                db.flush()
                
                attendee = MeetingAttendee(
                    meeting_id=meeting.id,
                    user_id=user.id,
                    status="ACCEPTED"
                )
                db.add(attendee)
                db.commit()
                print("Meetings seeded.")
            else:
                print("No users found to assign meetings.")
        else:
            print("Meetings already exist.")
            
    finally:
        db.close()

if __name__ == "__main__":
    seed_data()
