from typing import Any

from app.agents.approval_agent.handlers import handler_registry


def execute_approved_handler(module_name: str, action_name: str, payload_json: dict[str, Any]) -> dict[str, Any]:
    handler_key = f"{module_name}.{action_name}"
    return handler_registry.get(handler_key)(payload_json)

