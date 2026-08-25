from app.db.session import SessionLocal
from app.models.auth import Role, User

def main():
    db = SessionLocal()
    try:
        # Rename HR Admin to HR
        hr_admin = db.query(Role).filter(Role.name == "HR Admin").first()
        if hr_admin:
            hr_admin.name = "HR"
            hr_admin.description = "HR role"
            print("Renamed HR Admin to HR")
        
        # Delete HR Executive
        hr_exec = db.query(Role).filter(Role.name == "HR Executive").first()
        if hr_exec:
            # Optionally remove from users if needed, but cascaded or we can just delete
            db.delete(hr_exec)
            print("Deleted HR Executive")
            
        # Delete Manager
        manager = db.query(Role).filter(Role.name == "Manager").first()
        if manager:
            db.delete(manager)
            print("Deleted Manager")
            
        db.commit()
        print("Done!")
    finally:
        db.close()

if __name__ == "__main__":
    main()
