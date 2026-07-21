from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class PermissionRead(BaseModel):
    code: str
    name: str


class RoleRead(BaseModel):
    id: UUID
    name: str
    permissions: list[PermissionRead]


class CurrentUserResponse(BaseModel):
    id: UUID
    email: EmailStr
    full_name: str
    is_active: bool
    is_superuser: bool
    roles: list[str]
    permissions: list[str]


class RefreshTokenRecord(BaseModel):
    token_hash: str
    expires_at: datetime

