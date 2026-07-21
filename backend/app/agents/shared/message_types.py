from datetime import datetime, timezone
from enum import StrEnum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field


class AgentMessageType(StrEnum):
    USER = "user_message"
    AGENT = "agent_message"
    SYSTEM = "system_message"
    APPROVAL = "approval_message"
    WORKFLOW = "workflow_message"


class AgentMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    type: AgentMessageType
    content: str
    agent_name: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

