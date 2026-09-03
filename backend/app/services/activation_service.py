"""Token create/resolve/activate logic for the employee activation/invite flow.

See PLAN.md Part A. Reuses token_hash() and get_password_hash() from
app.core.security, which were confirmed to exist with those exact names.
"""
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import get_password_hash, token_hash
from app.models.auth.models import ActivationToken, User


def create_activation_token(db: Session, user: User, purpose: str = "activation") -> str:
    """Generate a raw token, store only its hash, return the raw token for the link."""
    raw = secrets.token_urlsafe(32)
    db.add(
        ActivationToken(
            user_id=user.id,
            token_hash=token_hash(raw),
            purpose=purpose,
            expires_at=datetime.now(timezone.utc)
            + timedelta(hours=settings.activation_token_expire_hours),
        )
    )
    db.commit()
    return raw


def build_activation_link(raw_token: str) -> str:
    return f"{settings.frontend_url.rstrip('/')}/activate?token={raw_token}"


def resolve_valid_token(db: Session, raw_token: str) -> ActivationToken | None:
    """Return the token row if it exists, is unused, and not expired — else None."""
    row = db.scalar(
        select(ActivationToken).where(ActivationToken.token_hash == token_hash(raw_token))
    )
    if not row or row.used_at is not None:
        return None
    if row.expires_at <= datetime.now(timezone.utc):
        return None
    return row


def activate_account(db: Session, raw_token: str, new_password: str) -> User | None:
    """Set password, stamp activated_at, mark token used. Returns the User or None if invalid."""
    row = resolve_valid_token(db, raw_token)
    if not row:
        return None
    user = db.get(User, row.user_id)
    if not user:
        return None

    user.password_hash = get_password_hash(new_password)
    user.activated_at = datetime.now(timezone.utc)
    user.is_active = True
    row.used_at = datetime.now(timezone.utc)

    # Invalidate any other outstanding activation tokens for this user.
    db.query(ActivationToken).filter(
        ActivationToken.user_id == user.id,
        ActivationToken.used_at.is_(None),
        ActivationToken.id != row.id,
    ).update({ActivationToken.used_at: datetime.now(timezone.utc)})

    db.commit()
    db.refresh(user)
    return user