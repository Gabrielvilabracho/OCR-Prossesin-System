"""extract_agents/types.py — shared data contracts for extraction sub-agents.

SS0: Each extraction sub-agent returns SectionResult.
The validator accepts three SectionResults and produces the final merged output.
"""

from typing import Any, TypedDict


class SectionResult(TypedDict):
    """Result returned by each extraction sub-agent.

    Fields:
        agent: Sub-agent identifier, e.g. "agente-header".
        fields: Extracted key→value pairs (raw, pre-validation).
        warnings: Non-fatal issues emitted during extraction.
        errors: Fatal issues that prevented field extraction.
    """

    agent: str
    fields: dict[str, Any]
    warnings: list[str]
    errors: list[str]


class AgentError(TypedDict):
    """Structured error record for a failed sub-agent.

    Fields:
        agent: Sub-agent identifier, e.g. "agente-header".
        message: Human-readable error description.
    """

    agent: str
    message: str
