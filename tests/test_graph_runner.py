"""
Tests for the lightweight StateGraph / CompiledGraph runner.
These test the core orchestration engine — no Gemini mocking needed.
"""
import pytest
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))

from agents.graph_runner import StateGraph, CompiledGraph, END


# ── Fixtures ──────────────────────────────────────────

def _noop(state: dict) -> dict:
    """Identity node — returns state unchanged."""
    return state


def _append(state: dict) -> dict:
    """Appends 'visited' marker."""
    visited = state.get("visited", [])
    return {**state, "visited": visited + ["append"]}


def _double_append(state: dict) -> dict:
    visited = state.get("visited", [])
    return {**state, "visited": visited + ["double"]}


def _error_node(state: dict) -> dict:
    return {**state, "error": "something broke"}


# ── Tests: Graph Construction ─────────────────────────

def test_single_node_graph():
    """A graph with one node that runs and terminates."""
    g = StateGraph()
    g.add_node("start", _append)
    g.set_entry_point("start")
    g.add_edge("start", END)
    compiled = g.compile()

    result = compiled.invoke({"visited": []})
    assert result["visited"] == ["append"]


def test_two_node_chain():
    """Two nodes chained: start → middle → END."""
    g = StateGraph()
    g.add_node("start", _append)
    g.add_node("middle", _double_append)
    g.set_entry_point("start")
    g.add_edge("start", "middle")
    g.add_edge("middle", END)
    compiled = g.compile()

    result = compiled.invoke({"visited": []})
    assert result["visited"] == ["append", "double"]


def test_conditional_edge_error_skip():
    """Conditional edge skips to END when error is set."""
    g = StateGraph()
    g.add_node("classify", _error_node)
    g.add_node("extract", _append)
    g.set_entry_point("classify")

    def _should_continue(state):
        return "end" if state.get("error") else "extract"

    g.add_conditional_edges("classify", _should_continue, {"extract": "extract", "end": END})
    g.add_edge("extract", END)
    compiled = g.compile()

    result = compiled.invoke({"visited": []})
    # Should have skipped extract because error was set
    assert result["visited"] == []
    assert result["error"] == "something broke"


def test_conditional_edge_proceeds_when_no_error():
    """Conditional edge proceeds to next node when no error."""
    g = StateGraph()
    g.add_node("classify", _noop)
    g.add_node("extract", _append)
    g.set_entry_point("classify")

    def _should_continue(state):
        return "end" if state.get("error") else "extract"

    g.add_conditional_edges("classify", _should_continue, {"extract": "extract", "end": END})
    g.add_edge("extract", END)
    compiled = g.compile()

    result = compiled.invoke({"visited": []})
    assert result["visited"] == ["append"]
    assert "error" not in result or not result["error"]


def test_missing_entry_point_raises():
    """CompiledGraph.invoke raises if no entry point was set."""
    g = StateGraph()
    g.add_node("orphan", _noop)
    compiled = g.compile()
    with pytest.raises(ValueError, match="No entry point"):
        compiled.invoke({})


def test_missing_node_raises():
    """CompiledGraph.invoke raises if a referenced node doesn't exist."""
    g = StateGraph()
    g.add_node("start", _noop)
    g.set_entry_point("start")
    g.add_edge("start", "nonexistent")
    compiled = g.compile()
    with pytest.raises(ValueError, match="not found"):
        compiled.invoke({})


def test_state_preserved_across_nodes():
    """State dict is passed through and mutated across nodes."""
    def _add_field(state):
        return {**state, "extra": 42}

    g = StateGraph()
    g.add_node("n1", _add_field)
    g.add_node("n2", _append)
    g.set_entry_point("n1")
    g.add_edge("n1", "n2")
    g.add_edge("n2", END)
    compiled = g.compile()

    result = compiled.invoke({"visited": [], "original": "yes"})
    assert result["original"] == "yes"
    assert result["extra"] == 42
    assert result["visited"] == ["append"]


def test_end_constant():
    """END is the string '__END__'."""
    assert END == "__END__"
    assert StateGraph.END == "__END__"