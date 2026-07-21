from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.auth import User
from app.models.lookup import LookupValue

router = APIRouter()


@router.get("")
def list_lookups(
    categories: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    statement = select(LookupValue).where(LookupValue.active.is_(True), LookupValue.deleted_at.is_(None))
    if categories:
        requested = [value.strip() for value in categories.split(",") if value.strip()]
        statement = statement.where(LookupValue.category.in_(requested))
    values = db.scalars(statement.order_by(LookupValue.category, LookupValue.sort_order, LookupValue.label)).all()
    grouped: dict[str, list[dict]] = {}
    for value in values:
        grouped.setdefault(value.category, []).append(
            {
                "id": str(value.id),
                "code": value.code,
                "label": value.label,
                "sort_order": value.sort_order,
                "metadata": value.metadata_json or {},
            }
        )
    return grouped
