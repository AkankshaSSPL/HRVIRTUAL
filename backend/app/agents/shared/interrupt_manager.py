from typing import Any

from langgraph.types import Command, interrupt


class InterruptManager:
    def pause_for_approval(self, payload: dict[str, Any]) -> Any:
        return interrupt(payload)

    def resume_with_decision(self, decision: dict[str, Any]) -> Command:
        return Command(resume=decision)


interrupt_manager = InterruptManager()

