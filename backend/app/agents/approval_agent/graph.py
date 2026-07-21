from typing import Any

from langgraph.graph import END, StateGraph

from app.agents.approval_agent.tools import execute_approved_handler
from app.agents.shared.interrupt_manager import interrupt_manager
from app.agents.shared.workflow_state import ApprovalWorkflowState


def pause_for_human(state: ApprovalWorkflowState) -> ApprovalWorkflowState:
    decision = interrupt_manager.pause_for_approval(
        {
            "approval_request_id": state.get("approval_request_id"),
            "workflow_id": state.get("workflow_id"),
            "module_name": state.get("module_name"),
            "action_name": state.get("action_name"),
            "approval_reason": state.get("approval_reason"),
        }
    )
    return {**state, "decision": decision}


def execute_after_approval(state: ApprovalWorkflowState) -> ApprovalWorkflowState:
    if state.get("decision") != "APPROVED":
        return {**state, "execution_status": "BLOCKED", "result": {"message": "Workflow not approved"}}

    result = execute_approved_handler(
        module_name=state["module_name"],
        action_name=state["action_name"],
        payload_json=state.get("payload_json", {}),
    )
    return {**state, "execution_status": "EXECUTED", "result": result}


def build_approval_graph() -> Any:
    graph = StateGraph(ApprovalWorkflowState)
    graph.add_node("pause_for_human", pause_for_human)
    graph.add_node("execute_after_approval", execute_after_approval)
    graph.set_entry_point("pause_for_human")
    graph.add_edge("pause_for_human", "execute_after_approval")
    graph.add_edge("execute_after_approval", END)
    return graph.compile()


approval_graph = build_approval_graph()

