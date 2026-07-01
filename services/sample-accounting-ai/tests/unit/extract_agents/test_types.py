"""T1 RED — SectionResult TypedDict contract (SS0).

Tests that SectionResult and AgentError exist with the expected keys.
These tests define the contract before implementation.
"""

from src.graph.nodes.extract_agents.types import AgentError, SectionResult


class TestSectionResult:
    """SS0: sub-agent result shape must include agent, fields, warnings, errors."""

    def test_section_result_has_required_keys(self):
        """SectionResult must accept all four required keys."""
        result: SectionResult = {
            "agent": "agente-header",
            "fields": {"supplier_nif": "100000002"},
            "warnings": [],
            "errors": [],
        }
        assert result["agent"] == "agente-header"
        assert result["fields"] == {"supplier_nif": "100000002"}
        assert result["warnings"] == []
        assert result["errors"] == []

    def test_section_result_fields_can_be_empty(self):
        """SectionResult with empty fields is valid (partial extraction)."""
        result: SectionResult = {
            "agent": "agente-lineas",
            "fields": {},
            "warnings": ["no lines found"],
            "errors": [],
        }
        assert result["fields"] == {}
        assert result["warnings"] == ["no lines found"]

    def test_agent_error_has_agent_and_message(self):
        """AgentError must have agent name and message."""
        err: AgentError = {
            "agent": "agente-header",
            "message": "NIF validation failed",
        }
        assert err["agent"] == "agente-header"
        assert "NIF" in err["message"]
