"""Public activation endpoints. Mounted under /auth (see router.py):

    GET  /api/v1/auth/activation/{token}
    POST /api/v1/auth/activate

Neither endpoint requires auth — activation IS how a brand-new employee
gets their first session.

ASSUMPTIONS THAT NEED VERIFICATION against the real files:
  - `app.schemas.auth.TokenResponse` is importable and is the same shape
    returned by POST /auth/login (per the plan). Not yet confirmed since
    the actual schemas/auth.py content wasn't shared in this session.
  - `AuthService(db).issue_tokens(user)` returns something directly
    compatible with TokenResponse (no extra wrapping/serialization step).
  - `User` has a `.employee` relationship for pulling first_name to show
    on the activation landing page. If the relationship is named
    differently (or doesn't exist), swap the lookup in
    get_activation_info accordingly.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.auth import TokenResponse
from app.services.activation_service import activate_account, resolve_valid_token
from app.services.auth_service import AuthService

router = APIRouter()


class ActivationInfoResponse(BaseModel):
    valid: bool
    first_name: str | None = None
    email: str | None = None
    face_optional: bool = True


class ActivateRequest(BaseModel):
    token: str
    password: str = Field(min_length=8)


@router.get("/activation/{token}", response_model=ActivationInfoResponse)
def get_activation_info(token: str, db: Session = Depends(get_db)) -> ActivationInfoResponse:
    row = resolve_valid_token(db, token)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This activation link is invalid or has expired.",
        )

    user = row.user
    employee = getattr(user, "employee", None)
    first_name = getattr(employee, "first_name", None)

    return ActivationInfoResponse(
        valid=True,
        first_name=first_name,
        email=user.email,
        face_optional=True,
    )


@router.post("/activate", response_model=TokenResponse)
def activate(payload: ActivateRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = activate_account(db, payload.token, payload.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This activation link is invalid, already used, or has expired.",
        )

    return AuthService(db).issue_tokens(user)