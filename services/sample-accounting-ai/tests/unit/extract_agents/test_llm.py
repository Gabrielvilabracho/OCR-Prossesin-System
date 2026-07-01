"""T3 RED — _call_mistral_json LLM wrapper tests.

Mock boundary: src.services.mistral_client.Mistral (same as existing tests).
"""

import json
from unittest.mock import MagicMock, patch

import pytest

from src.graph.nodes.extract_agents._llm import _call_mistral_json


def make_mock_mistral_response(content: str) -> MagicMock:
    mock_msg = MagicMock()
    mock_msg.content = content
    mock_choice = MagicMock()
    mock_choice.message = mock_msg
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    return mock_response


class TestCallMistralJson:
    """_call_mistral_json must call Mistral, parse JSON, return dict."""

    @pytest.mark.asyncio
    async def test_returns_parsed_dict_on_valid_json(self):
        """Returns dict when Mistral responds with valid JSON."""
        payload = {"supplier_nif": "100000002", "invoice_date": "2026-05-01"}

        with patch("src.graph.nodes.extract_agents._llm.Mistral") as MockMistral:
            mock_client = MagicMock()
            mock_client.chat.complete.return_value = make_mock_mistral_response(
                json.dumps(payload)
            )
            MockMistral.return_value = mock_client

            result = await _call_mistral_json(
                system="You are a parser.",
                user="Extract from: test text",
            )

        assert result["supplier_nif"] == "100000002"
        assert result["invoice_date"] == "2026-05-01"

    @pytest.mark.asyncio
    async def test_raises_value_error_on_invalid_json(self):
        """Raises ValueError when Mistral returns non-JSON content."""
        with patch("src.graph.nodes.extract_agents._llm.Mistral") as MockMistral:
            mock_client = MagicMock()
            mock_client.chat.complete.return_value = make_mock_mistral_response(
                "I cannot process this document."
            )
            MockMistral.return_value = mock_client

            with pytest.raises(ValueError, match="No valid JSON"):
                await _call_mistral_json(
                    system="You are a parser.",
                    user="Extract from: test text",
                )

    @pytest.mark.asyncio
    async def test_parses_json_wrapped_in_markdown_code_block(self):
        """Handles JSON wrapped in ```json ... ``` markdown block."""
        payload = {"total": "1230.00"}
        markdown_response = f"```json\n{json.dumps(payload)}\n```"

        with patch("src.graph.nodes.extract_agents._llm.Mistral") as MockMistral:
            mock_client = MagicMock()
            mock_client.chat.complete.return_value = make_mock_mistral_response(
                markdown_response
            )
            MockMistral.return_value = mock_client

            result = await _call_mistral_json(
                system="You are a parser.",
                user="Extract totals.",
            )

        assert result["total"] == "1230.00"
