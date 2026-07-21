from typing import Any

from langgraph.graph import END, StateGraph

from app.agents.shared.workflow_state import WorkflowState


def intent_analysis(state: WorkflowState) -> WorkflowState:
    state.current_step = "intent_analysis"
    return state


def agent_selection(state: WorkflowState) -> WorkflowState:
    state.current_step = "agent_selection"
    return state


def route_to_agent(state: WorkflowState) -> WorkflowState:
    state.current_step = "route_to_agent"
    return state


def collect_result(state: WorkflowState) -> WorkflowState:
    state.current_step = "collect_result"
    return state


def build_coordinator_graph() -> Any:
    graph = StateGraph(WorkflowState)
    graph.add_node("intent_analysis", intent_analysis)
    graph.add_node("agent_selection", agent_selection)
    graph.add_node("route_to_agent", route_to_agent)
    graph.add_node("collect_result", collect_result)
    graph.set_entry_point("intent_analysis")
    graph.add_edge("intent_analysis", "agent_selection")
    graph.add_edge("agent_selection", "route_to_agent")
    graph.add_edge("route_to_agent", "collect_result")
    graph.add_edge("collect_result", END)
    return graph.compile()


coordinator_graph = build_coordinator_graph()

