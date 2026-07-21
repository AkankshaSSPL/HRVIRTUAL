from abc import ABC, abstractmethod
from typing import Any

from app.agents.shared.agent_state import AgentExecutionState, AgentStatus
from app.agents.shared.runtime_context import RuntimeContext


class BaseAgent(ABC):
    """Base contract for every HRMS agent folder."""

    name: str
    description: str
    supported_actions: list[str] = []
    approval_required_actions: list[str] = []
    requires_approval: bool = False

    async def execute(self, state: AgentExecutionState) -> AgentExecutionState:
        state.status = AgentStatus.RUNNING
        try:
            result = await self.run(state)
            state.output = result
            state.status = AgentStatus.COMPLETED
            return state
        except Exception as exc:
            state.errors.append(str(exc))
            state.status = AgentStatus.FAILED
            raise

    @abstractmethod
    async def run(self, state: AgentExecutionState) -> dict:
        """Run agent-specific logic in the concrete domain package."""

    async def invoke(self, action: str, payload: dict[str, Any], context: RuntimeContext) -> dict[str, Any]:
        return {
            "agent": self.name,
            "action": action,
            "status": "placeholder_completed",
            "message": f"{self.name} placeholder handled {action}. No HRMS business logic was executed.",
            "payload": payload,
            "workflow_id": context.workflow_id,
        }
