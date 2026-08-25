from app.db.session import SessionLocal
from app.models.employee.models import Employee
from app.models.auth.models import User, Role
from app.core.security import get_password_hash

def main():
    db = SessionLocal()
    try:
        employee_role = db.query(Role).filter(Role.name == "Employee").first()
        if not employee_role:
            print("Employee role not found. Exiting.")
            return

        employees = db.query(Employee).all()
        created_count = 0
        
        for emp in employees:
            if not emp.user_id:
                # Need to create a User record
                import uuid
                
                # Check if we can use their email
                email_candidates = [emp.official_email, emp.personal_email, f"{emp.employee_code or str(uuid.uuid4())[:8]}@example.com"]
                
                for candidate in email_candidates:
                    if not candidate:
                        continue
                        
                    email = candidate.lower()
                    existing_user = db.query(User).filter(User.email == email).first()
                    
                    if not existing_user:
                        # Email is completely free, create new user
                        new_user = User(
                            email=email,
                            first_name=emp.first_name or "Unknown",
                            last_name=emp.last_name or "-",
                            password_hash=get_password_hash("ChangeMe123!"),
                            is_active=True,
                            is_superuser=False,
                            roles=[employee_role]
                        )
                        db.add(new_user)
                        db.flush()
                        emp.user_id = new_user.id
                        created_count += 1
                        break
                    elif not existing_user.employee_profile:
                        # User exists but has no employee linked. Link it.
                        emp.user_id = existing_user.id
                        if employee_role not in existing_user.roles:
                            existing_user.roles.append(employee_role)
                        break
                    # If existing_user IS linked to someone else, we must try the next email candidate
                else:
                    # Fallback if all candidates were taken
                    fallback_email = f"user_{str(uuid.uuid4())[:8]}@example.com"
                    new_user = User(
                        email=fallback_email,
                        first_name=emp.first_name or "Unknown",
                        last_name=emp.last_name or "-",
                        password_hash=get_password_hash("ChangeMe123!"),
                        is_active=True,
                        is_superuser=False,
                        roles=[employee_role]
                    )
                    db.add(new_user)
                    db.flush()
                    emp.user_id = new_user.id
                    created_count += 1
                    
        db.commit()
        print(f"Created/linked {created_count} User accounts for employees.")
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    main()
