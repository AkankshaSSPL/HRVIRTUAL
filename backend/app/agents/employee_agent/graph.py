from typing import Any, TypedDict

from langgraph.graph import END, StateGraph


class EmployeeAgentState(TypedDict, total=False):
    command: str
    action: str
    approval_required: bool
    structured_response: dict[str, Any]


def parse_intent(state: EmployeeAgentState) -> EmployeeAgentState:
    command = state.get("command", "").lower()
    if "salary" in command:
        state["action"] = "update_salary"
    elif "show" in command or "list" in command or "search" in command:
        state["action"] = "search"
    else:
        state["action"] = "list"
    return state


def classify_operation(state: EmployeeAgentState) -> EmployeeAgentState:
    state["approval_required"] = state.get("action") in {
        "create",
        "update",
        "delete",
        "update_salary",
        "change_manager",
        "change_department",
        "deactivate",
    }
    return state


def approval_check(state: EmployeeAgentState) -> EmployeeAgentState:
    return state


def generate_response(state: EmployeeAgentState) -> EmployeeAgentState:
    state["structured_response"] = {"type": "status_banner", "action": state.get("action")}
    return state


def build_graph():
    graph = StateGraph(EmployeeAgentState)
    graph.add_node("intent_parsing", parse_intent)
    graph.add_node("operation_classification", classify_operation)
    graph.add_node("approval_check", approval_check)
    graph.add_node("structured_response_generation", generate_response)
    graph.set_entry_point("intent_parsing")
    graph.add_edge("intent_parsing", "operation_classification")
    graph.add_edge("operation_classification", "approval_check")
    graph.add_edge("approval_check", "structured_response_generation")
    graph.add_edge("structured_response_generation", END)
    return graph.compile()
