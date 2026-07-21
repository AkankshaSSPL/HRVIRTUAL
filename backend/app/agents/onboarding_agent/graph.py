from typing import Any, TypedDict

from langgraph.graph import END, StateGraph


class OnboardingState(TypedDict, total=False):
    command: str
    candidate: dict[str, Any]
    approval_required: bool
    documents: list[dict[str, Any]]
    assets: list[dict[str, Any]]
    structured_response: dict[str, Any]


def parse_request(state: OnboardingState) -> OnboardingState:
    state["approval_required"] = True
    return state


def coordinate_agents(state: OnboardingState) -> OnboardingState:
    state["documents"] = state.get("documents", [])
    state["assets"] = state.get("assets", [])
    return state


def generate_response(state: OnboardingState) -> OnboardingState:
    state["structured_response"] = {"type": "onboarding_progress", "candidate": state.get("candidate", {})}
    return state


def build_graph():
    graph = StateGraph(OnboardingState)
    graph.add_node("request", parse_request)
    graph.add_node("multi_agent_coordination", coordinate_agents)
    graph.add_node("structured_response", generate_response)
    graph.set_entry_point("request")
    graph.add_edge("request", "multi_agent_coordination")
    graph.add_edge("multi_agent_coordination", "structured_response")
    graph.add_edge("structured_response", END)
    return graph.compile()
