from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from uuid import UUID

from app.api.deps import require_permissions
from app.db.session import get_db
from app.models.auth.models import User, Role
from app.schemas.auth import UserListResponse, UserRead, UserUpdateRequest

router = APIRouter()

@router.get("", response_model=UserListResponse, dependencies=[Depends(require_permissions("settings:view"))])
def get_users(db: Session = Depends(get_db)):
    result = db.execute(select(User).options(selectinload(User.roles)).order_by(User.first_name))
    users = result.scalars().all()
    
    # Map to schema
    user_reads = []
    for user in users:
        # Extract role names
        role_names = [role.name for role in user.roles]
        user_reads.append(UserRead(
            id=user.id,
            first_name=user.first_name,
            last_name=user.last_name,
            email=user.email,
            is_active=user.is_active,
            roles=role_names,
            created_at=user.created_at,
            face_registered=user.face_registered
        ))
    
    return UserListResponse(data=user_reads, total=len(user_reads))


@router.patch("/{user_id}", response_model=UserRead, dependencies=[Depends(require_permissions("settings:manage"))])
def update_user(user_id: UUID, payload: UserUpdateRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).options(selectinload(User.roles)).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if payload.first_name is not None:
        user.first_name = payload.first_name
    if payload.last_name is not None:
        user.last_name = payload.last_name
    if payload.email is not None:
        user.email = payload.email
        
    if payload.roles is not None:
        roles = db.scalars(select(Role).where(Role.name.in_(payload.roles))).all()
        user.roles = list(roles)
        
    db.commit()
    db.refresh(user)
    
    return UserRead(
        id=user.id,
        first_name=user.first_name,
        last_name=user.last_name,
        email=user.email,
        is_active=user.is_active,
        roles=[role.name for role in user.roles],
        created_at=user.created_at,
        face_registered=user.face_registered
    )
