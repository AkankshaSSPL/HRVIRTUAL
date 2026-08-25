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


class RoleUpdateRequest(BaseModel):
    permissions: list[str]


class CurrentUserResponse(BaseModel):
    id: UUID
    email: EmailStr
    full_name: str
    is_active: bool
    is_superuser: bool
    roles: list[str]
    permissions: list[str]
    employment_type: str | None = None
    face_registered: bool = False
    face_samples_count: int = 0


class RefreshTokenRecord(BaseModel):
    token_hash: str
    expires_at: datetime


class UserRead(BaseModel):
    id: UUID
    first_name: str
    last_name: str
    email: EmailStr
    is_active: bool
    roles: list[str]
    created_at: datetime
    face_registered: bool = False

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

class UserUpdateRequest(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: EmailStr | None = None
    roles: list[str] | None = None


class UserListResponse(BaseModel):
    data: list[UserRead]
    total: int


class RoleListResponse(BaseModel):
    data: list[RoleRead]
    total: int

