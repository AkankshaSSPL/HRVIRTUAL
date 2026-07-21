from app.agents.shared.base_agent import BaseAgent
from app.agents.shared.exceptions import AgentAlreadyRegisteredError, AgentNotFoundError
from app.agents.shared.runtime_context import RuntimeContext


class AgentRegistry:
    def __init__(self) -> None:
        self._agents: dict[str, BaseAgent] = {}

    def register(self, agent: BaseAgent) -> None:
        if agent.name in self._agents:
            raise AgentAlreadyRegisteredError(agent.name)
        self._agents[agent.name] = agent

    def register_or_replace(self, agent: BaseAgent) -> None:
        self._agents[agent.name] = agent

    def get(self, name: str) -> BaseAgent:
        try:
            return self._agents[name]
        except KeyError as exc:
            raise AgentNotFoundError(name) from exc

    def list_agents(self) -> list[str]:
        return sorted(self._agents)

    def metadata(self) -> list[dict]:
        return [
            {
                "name": agent.name,
                "description": agent.description,
                "supported_actions": agent.supported_actions,
                "approval_required_actions": agent.approval_required_actions,
            }
            for agent in self._agents.values()
        ]

    async def invoke(self, name: str, action: str, payload: dict, context: RuntimeContext) -> dict:
        return await self.get(name).invoke(action, payload, context)


agent_registry = AgentRegistry()
