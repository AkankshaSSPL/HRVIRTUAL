from sqlalchemy import Boolean, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel


class LookupValue(BaseModel):
    __tablename__ = "lookup_values"
    __table_args__ = (
        UniqueConstraint("category", "code", name="uq_lookup_values_category_code"),
        Index("ix_lookup_values_category_active_order", "category", "active", "sort_order"),
    )

    category: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[str] = mapped_column(String(120), nullable=False)
    label: Mapped[str] = mapped_column(String(180), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSONB)
