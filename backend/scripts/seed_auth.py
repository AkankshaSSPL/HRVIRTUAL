from app.db.session import SessionLocal
from app.services.auth_service import seed_auth_data


def main() -> None:
    db = SessionLocal()
    try:
        admin = seed_auth_data(db)
        print(f"Seeded auth roles, permissions, and admin user: {admin.email}")
    finally:
        db.close()


if __name__ == "__main__":
    main()

