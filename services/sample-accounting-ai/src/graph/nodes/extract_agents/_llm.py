"""extract_agents/_llm.py — reusable LLM call wrapper for extraction sub-agents.

Mock boundary: src.services.mistral_client.Mistral (matches all existing tests).
Moves _extract_json_from_response from extract.py to avoid duplication.

LangSmith opt-in: when LANGSMITH_API_KEY is set, calls are wrapped with
langsmith.traceable for span-level tracing. No-op when key is absent.
"""

import json
import os
import re
from collections.abc import Callable
from typing import Any

from src.services.mistral_client import Mistral


def _get_traceable() -> Callable[[Any], Any] | None:
    """Return langsmith.traceable if LANGSMITH_API_KEY is set, else None."""
    if not os.environ.get("LANGSMITH_API_KEY"):
        return None
    try:
        from langsmith import traceable
        return traceable
    except ImportError:
        return None


def _extract_json_from_response(content: str) -> dict[str, object]:
    """Extract JSON object from LLM response content.

    Handles cases where the model wraps JSON in markdown code blocks.
    Raises ValueError if no valid JSON is found.
    """
    # Try direct parse first
    try:
        result: dict[str, object] = json.loads(content.strip())
        return result
    except json.JSONDecodeError:
        pass

    # Try to extract from markdown code block
    code_block = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", content, re.DOTALL)
    if code_block:
        try:
            result = json.loads(code_block.group(1))
            return result
        except json.JSONDecodeError:
            pass

    # Try to find any JSON object in the response
    json_match = re.search(r"\{[^{}]*\}", content, re.DOTALL)
    if json_match:
        try:
            result = json.loads(json_match.group(0))
            return result
        except json.JSONDecodeError:
            pass

    raise ValueError(f"No valid JSON found in LLM response: {content[:200]!r}")


async def _call_mistral_json(system: str, user: str, *, name: str = "extract_llm") -> dict[str, object]:
    """Call Mistral with a system+user prompt and return parsed JSON dict.

    When LANGSMITH_API_KEY is set, the call is wrapped with langsmith.traceable
    using the provided name for span identification (SO1+SO2).

    Reusable across all extraction sub-agents. Keeps the mock boundary
    (src.services.mistral_client.Mistral) identical to existing tests.

    Args:
        system: System prompt string for this sub-agent.
        user: User message (typically OCR text with USER_TEMPLATE).
        name: Span name for LangSmith tracing (e.g. "extract_header").

    Returns:
        Parsed dict from the LLM JSON response.

    Raises:
        ValueError: If the LLM response cannot be parsed as JSON.
        Exception: Re-raised from Mistral client on connection/rate errors.
    """
    async def _invoke() -> dict[str, object]:
        client = Mistral()
        response = client.chat.complete(
            model="mistral-small-latest",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        content = response.choices[0].message.content
        return _extract_json_from_response(content)

    traceable = _get_traceable()
    if traceable is not None:
        # traceable(name=name) returns a decorator; apply it to _invoke then call it
        wrapped = traceable(name=name)(_invoke)  # type: ignore[call-arg]
        return await wrapped()  # type: ignore[no-any-return]
    return await _invoke()
