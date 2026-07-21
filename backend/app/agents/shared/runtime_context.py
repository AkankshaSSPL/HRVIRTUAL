from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class RuntimeContext(BaseModel):
    workflow_id: str
    user_id: UUID | None = None
    tenant_id: UUID | None = None
    correlation_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

