from typing import Any


class MemoryManager:
    """Short-term workflow memory boundary. Long-term vector memory can plug in later."""

    def __init__(self) -> None:
        self._memory: dict[str, dict[str, Any]] = {}

    def get(self, workflow_id: str) -> dict[str, Any]:
        return self._memory.setdefault(workflow_id, {})

    def update(self, workflow_id: str, values: dict[str, Any]) -> dict[str, Any]:
        memory = self.get(workflow_id)
        memory.update(values)
        return memory


memory_manager = MemoryManager()

