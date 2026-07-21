from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_password_hash,
    token_hash,
    verify_password,
)
from app.models.auth import Permission, RefreshToken, Role, User

ROLE_NAMES = ["Super Admin", "HR Admin", "HR Executive", "Manager", "Employee"]

PERMISSIONS = {
    "dashboard:view": "View dashboard",
    "employees:view": "View employees",
    "employees:manage": "Manage employees",
    "candidates:view": "View candidates",
    "onboarding:view": "View onboarding",
    "attendance:view": "View attendance",
    "attendance:manage": "Manage attendance",
    "leave:view": "View leave",
    "leave:manage": "Manage leave",
    "payroll:view": "View payroll",
    "payroll:manage": "Manage payroll",
    "documents:view": "View documents",
    "documents:manage": "Manage documents",
    "assets:view": "View assets",
    "offboarding:view": "View offboarding",
    "approvals:view": "View approvals",
    "approvals:manage": "Manage approvals",
    "agent_command:view": "View agent command center",
    "audit_logs:view": "View audit logs",
    "settings:view": "View settings",
    "settings:manage": "Manage settings",
}

ROLE_PERMISSION_CODES = {
    "Super Admin": list(PERMISSIONS),
    "HR Admin": [
        "dashboard:view",
        "employees:view",
        "employees:manage",
        "candidates:view",
        "onboarding:view",
        "attendance:view",
        "attendance:manage",
        "leave:view",
        "leave:manage",
        "payroll:view",
        "payroll:manage",
        "documents:view",
        "documents:manage",
        "assets:view",
        "offboarding:view",
        "approvals:view",
        "approvals:manage",
        "agent_command:view",
        "audit_logs:view",
        "settings:view",
        "settings:manage",
    ],
    "HR Executive": [
        "dashboard:view",
        "employees:view",
        "employees:manage",
        "candidates:view",
        "onboarding:view",
        "attendance:view",
        "attendance:manage",
        "leave:view",
        "leave:manage",
        "documents:view",
        "documents:manage",
        "assets:view",
        "approvals:view",
    ],
    "Manager": ["dashboard:view", "employees:view", "attendance:view", "leave:view", "approvals:view"],
    "Employee": ["dashboard:view", "documents:view", "leave:view"],
}


class AuthService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_user_by_email(self, email: str) -> User | None:
        return self.db.scalar(
            select(User).where(User.email == email.lower()).options(selectinload(User.roles).selectinload(Role.permissions))
        )

    def get_user_by_id(self, user_id: str | UUID) -> User | None:
        return self.db.scalar(
            select(User).where(User.id == user_id).options(selectinload(User.roles).selectinload(Role.permissions))
        )

    def authenticate(self, email: str, password: str) -> User | None:
        user = self.get_user_by_email(email)
        if not user or not user.is_active:
            return None
        if not verify_password(password, user.password_hash):
            return None
        user.last_login_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(user)
        return user

    def issue_tokens(self, user: User) -> tuple[str, str]:
        access_token = create_access_token(str(user.id))
        refresh_token = create_refresh_token(str(user.id))
        expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
        self.db.add(RefreshToken(user_id=user.id, token_hash=token_hash(refresh_token), expires_at=expires_at))
        self.db.commit()
        return access_token, refresh_token

    def rotate_refresh_token(self, refresh_token: str) -> tuple[User, str, str] | None:
        try:
            payload = decode_token(refresh_token)
        except ValueError:
            return None
        if payload.get("type") != "refresh" or not payload.get("sub"):
            return None

        record = self.db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash(refresh_token)))
        now = datetime.now(timezone.utc)
        if not record or record.revoked_at or record.expires_at <= now:
            return None

        user = self.get_user_by_id(payload["sub"])
        if not user or not user.is_active:
            return None

        record.revoked_at = now
        access_token, new_refresh_token = self.issue_tokens(user)
        self.db.commit()
        return user, access_token, new_refresh_token

    def revoke_refresh_token(self, refresh_token: str | None) -> None:
        if not refresh_token:
            return
        record = self.db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash(refresh_token)))
        if record and not record.revoked_at:
            record.revoked_at = datetime.now(timezone.utc)
            self.db.commit()


def user_permissions(user: User) -> set[str]:
    if user.is_superuser:
        return set(PERMISSIONS)
    return {permission.code for role in user.roles for permission in role.permissions}


def seed_auth_data(db: Session) -> User:
    permission_by_code: dict[str, Permission] = {}
    for code, name in PERMISSIONS.items():
        permission = db.scalar(select(Permission).where(Permission.code == code))
        if not permission:
            permission = Permission(code=code, name=name, description=name)
            db.add(permission)
        permission_by_code[code] = permission

    role_by_name: dict[str, Role] = {}
    for role_name in ROLE_NAMES:
        role = db.scalar(select(Role).where(Role.name == role_name))
        if not role:
            role = Role(name=role_name, description=f"{role_name} role")
            db.add(role)
        role.permissions = [permission_by_code[code] for code in ROLE_PERMISSION_CODES[role_name]]
        role_by_name[role_name] = role

    admin = db.scalar(select(User).where(User.email == settings.admin_email.lower()))
    if not admin:
        first_name, _, last_name = settings.admin_name.partition(" ")
        admin = User(
            email=settings.admin_email.lower(),
            first_name=first_name or "Super",
            last_name=last_name or "Admin",
            password_hash=get_password_hash(settings.admin_password),
            is_active=True,
            is_superuser=True,
            roles=[role_by_name["Super Admin"]],
        )
        db.add(admin)
    else:
        first_name, _, last_name = settings.admin_name.partition(" ")
        admin.first_name = first_name or admin.first_name
        admin.last_name = last_name or admin.last_name
        admin.is_active = True
        admin.is_superuser = True
        if role_by_name["Super Admin"] not in admin.roles:
            admin.roles.append(role_by_name["Super Admin"])

    db.commit()
    db.refresh(admin)
    return admin
