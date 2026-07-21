from collections.abc import Callable
from typing import Any


ApprovalHandler = Callable[[dict[str, Any]], dict[str, Any]]


class ApprovalHandlerRegistry:
    def __init__(self) -> None:
        self._handlers: dict[str, ApprovalHandler] = {}

    def register(self, key: str, handler: ApprovalHandler) -> None:
        self._handlers[key] = handler

    def get(self, key: str) -> ApprovalHandler:
        return self._handlers.get(key, placeholder_handler(key))

    def keys(self) -> list[str]:
        return sorted(self._handlers)


def placeholder_handler(key: str) -> ApprovalHandler:
    def handler(payload: dict[str, Any]) -> dict[str, Any]:
        return {
            "handler": key,
            "status": "unsupported_action",
            "message": "This approval handler is not implemented. No HRMS business mutation was performed.",
            "payload": payload,
        }

    return handler


handler_registry = ApprovalHandlerRegistry()

for handler_key in (
    "employee.create",
    "employee.update",
    "employee.delete",
    "payroll.process",
    "payroll.generate_bank_sheet",
    "leave.approve",
    "offboarding.start",
):
    handler_registry.register(handler_key, placeholder_handler(handler_key))
