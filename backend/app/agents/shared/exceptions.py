class AgentError(Exception):
    """Base exception for agent platform failures."""


class AgentNotFoundError(AgentError):
    def __init__(self, agent_name: str) -> None:
        super().__init__(f"Agent not found: {agent_name}")


class AgentAlreadyRegisteredError(AgentError):
    def __init__(self, agent_name: str) -> None:
        super().__init__(f"Agent already registered: {agent_name}")

