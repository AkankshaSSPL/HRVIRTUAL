from typing import Any
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.api.deps import get_db, require_permissions
from app.models.company import AppSetting

router = APIRouter()

@router.get("/{category}", dependencies=[Depends(require_permissions("settings:view"))])
def get_settings(
    category: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Retrieve all settings for a given category as a key-value dictionary."""
    settings = db.scalars(
        select(AppSetting).where(AppSetting.category == category)
    ).all()
    
    return {s.key: s.value for s in settings}


@router.put("/{category}", dependencies=[Depends(require_permissions("settings:edit"))])
def update_settings(
    category: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Upsert settings for a given category based on a key-value dictionary payload."""
    
    # Fetch existing
    existing = {
        s.key: s
        for s in db.scalars(select(AppSetting).where(AppSetting.category == category)).all()
    }
    
    for key, value in payload.items():
        if key in existing:
            existing[key].value = value
        else:
            new_setting = AppSetting(category=category, key=key, value=value)
            db.add(new_setting)
            existing[key] = new_setting
            
    db.commit()
    return {k: v.value for k, v in existing.items()}
