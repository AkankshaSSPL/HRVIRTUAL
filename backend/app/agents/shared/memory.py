from typing import Any
from uuid import UUID


class AgentMemory:
    """Persistence boundary for future agent memory backends."""

    async def load(self, tenant_id: UUID, key: str) -> dict[str, Any] | None:
        return None

    async def save(self, tenant_id: UUID, key: str, value: dict[str, Any]) -> None:
        return None

