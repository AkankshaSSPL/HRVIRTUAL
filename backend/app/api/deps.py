from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_token
from app.db.session import get_db
from app.models.auth import User
from app.services.auth_service import AuthService, user_permissions

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_v1_prefix}/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
    except ValueError as exc:
        raise credentials_exception from exc
    if payload.get("type") != "access" or not payload.get("sub"):
        raise credentials_exception
    user = AuthService(db).get_user_by_id(payload["sub"])
    if not user or not user.is_active:
        raise credentials_exception
    return user


def require_roles(*roles: str) -> Callable[[User], User]:
    def guard(user: User = Depends(get_current_user)) -> User:
        user_role_names = {role.name for role in user.roles}
        if user.is_superuser or user_role_names.intersection(roles):
            return user
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")

    return guard


def require_permissions(*permissions: str) -> Callable[[User], User]:
    def guard(user: User = Depends(get_current_user)) -> User:
        if user.is_superuser or set(permissions).issubset(user_permissions(user)):
            return user
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permission")

    return guard

