import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Column, DateTime, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base

class HRDocument(Base):
    __tablename__ = "hr_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    category = Column(String, nullable=False)
    status = Column(String, nullable=False, default="Draft")
    file_url = Column(String, nullable=True)
    version = Column(String, nullable=False, default="v1.0")
    author_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    downloads = Column(Integer, nullable=False, default=0)
    
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    author = relationship("User", foreign_keys=[author_id])
