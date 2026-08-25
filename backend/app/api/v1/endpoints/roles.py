from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from uuid import UUID

from app.api.deps import require_permissions
from app.db.session import get_db
from app.models.auth.models import Role, Permission
from app.schemas.auth import RoleListResponse, RoleRead, PermissionRead, RoleUpdateRequest

router = APIRouter()

@router.get("", response_model=RoleListResponse, dependencies=[Depends(require_permissions("settings:view"))])
def get_roles(db: Session = Depends(get_db)):
    result = db.execute(select(Role).options(selectinload(Role.permissions)).order_by(Role.name))
    roles = result.scalars().all()
    
    # Map to schema
    role_reads = []
    for role in roles:
        perms = [PermissionRead(code=p.code, name=p.name) for p in role.permissions]
        role_reads.append(RoleRead(
            id=role.id,
            name=role.name,
            permissions=perms
        ))
    
    return RoleListResponse(data=role_reads, total=len(role_reads))


@router.get("/permissions", response_model=list[PermissionRead], dependencies=[Depends(require_permissions("settings:view"))])
def get_permissions(db: Session = Depends(get_db)):
    result = db.execute(select(Permission).order_by(Permission.code))
    permissions = result.scalars().all()
    return [PermissionRead(code=p.code, name=p.name) for p in permissions]


@router.get("/{role_id}", response_model=RoleRead, dependencies=[Depends(require_permissions("settings:view"))])
def get_role(role_id: UUID, db: Session = Depends(get_db)):
    role = db.execute(select(Role).options(selectinload(Role.permissions)).filter(Role.id == role_id)).scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    perms = [PermissionRead(code=p.code, name=p.name) for p in role.permissions]
    return RoleRead(id=role.id, name=role.name, permissions=perms)


@router.put("/{role_id}", response_model=RoleRead, dependencies=[Depends(require_permissions("settings:manage"))])
def update_role(role_id: UUID, request: RoleUpdateRequest, db: Session = Depends(get_db)):
    role = db.execute(select(Role).options(selectinload(Role.permissions)).filter(Role.id == role_id)).scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
        
    # Get all requested permissions
    if not request.permissions:
        new_permissions = []
    else:
        result = db.execute(select(Permission).filter(Permission.code.in_(request.permissions)))
        new_permissions = result.scalars().all()
        
    # Update role permissions
    role.permissions = new_permissions
    db.commit()
    db.refresh(role)
    
    perms = [PermissionRead(code=p.code, name=p.name) for p in role.permissions]
    return RoleRead(id=role.id, name=role.name, permissions=perms)
