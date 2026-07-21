from typing import Any, TypedDict

from langgraph.graph import END, StateGraph


class ResumeParserState(TypedDict, total=False):
    filename: str
    raw_text: str
    parsed: dict[str, Any]
    candidate: dict[str, Any]
    structured_response: dict[str, Any]


def extract_text_node(state: ResumeParserState) -> ResumeParserState:
    return state


def parse_candidate_node(state: ResumeParserState) -> ResumeParserState:
    return state


def generate_response_node(state: ResumeParserState) -> ResumeParserState:
    state["structured_response"] = {"type": "candidate_card", "candidate": state.get("candidate", {})}
    return state


def build_graph():
    graph = StateGraph(ResumeParserState)
    graph.add_node("extract_text", extract_text_node)
    graph.add_node("parse_candidate", parse_candidate_node)
    graph.add_node("generate_candidate_profile", generate_response_node)
    graph.set_entry_point("extract_text")
    graph.add_edge("extract_text", "parse_candidate")
    graph.add_edge("parse_candidate", "generate_candidate_profile")
    graph.add_edge("generate_candidate_profile", END)
    return graph.compile()
