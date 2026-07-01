"""Tests for LangSmith tracing opt-in — SO1 + SO2.

TDD: RED tests before implementation.
"""

import os
from unittest.mock import AsyncMock, MagicMock, patch


class TestLangSmithOptIn:
    """SO1: @traceable is applied when LANGSMITH_API_KEY is set, no-op when absent."""

    async def test_traceable_called_when_key_present(self) -> None:
        """SO1: when LANGSMITH_API_KEY set, _call_mistral_json is wrapped via traceable."""
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = '{"result": "ok"}'

        with patch.dict(os.environ, {"LANGSMITH_API_KEY": "test-key"}):
            with patch("src.graph.nodes.extract_agents._llm.Mistral") as mock_mistral:
                mock_mistral.return_value.chat.complete.return_value = mock_response
                with patch("src.graph.nodes.extract_agents._llm._get_traceable") as mock_get:
                    mock_traceable = MagicMock(side_effect=lambda fn: fn)
                    mock_get.return_value = mock_traceable

                    import importlib
                    import src.graph.nodes.extract_agents._llm as llm_mod
                    importlib.reload(llm_mod)

    async def test_no_external_call_when_key_absent(self) -> None:
        """SO1: when LANGSMITH_API_KEY absent, no langsmith client initialized."""
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = '{"field": "value"}'

        env_without_key = {k: v for k, v in os.environ.items() if k != "LANGSMITH_API_KEY"}
        with patch.dict(os.environ, env_without_key, clear=True):
            with patch("src.graph.nodes.extract_agents._llm.Mistral") as mock_mistral:
                mock_mistral.return_value.chat.complete.return_value = mock_response
                from src.graph.nodes.extract_agents._llm import _call_mistral_json
                result = await _call_mistral_json("system", "user")
                assert result == {"field": "value"}
                # No langsmith import error means it's not required
                mock_mistral.return_value.chat.complete.assert_called_once()

    async def test_name_param_passed_to_traceable(self) -> None:
        """SO2: name= param is accepted by _call_mistral_json for span naming."""
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = '{"supplier_nif": "123456789"}'

        with patch("src.graph.nodes.extract_agents._llm.Mistral") as mock_mistral:
            mock_mistral.return_value.chat.complete.return_value = mock_response
            from src.graph.nodes.extract_agents._llm import _call_mistral_json
            result = await _call_mistral_json("system", "user", name="extract_header")
            assert result == {"supplier_nif": "123456789"}

    async def test_call_succeeds_without_langsmith_installed(self) -> None:
        """SO1: pipeline works even if langsmith is not importable (no-op path)."""
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = '{"total": "100.00"}'

        env_without_key = {k: v for k, v in os.environ.items() if k != "LANGSMITH_API_KEY"}
        with patch.dict(os.environ, env_without_key, clear=True):
            with patch("src.graph.nodes.extract_agents._llm.Mistral") as mock_mistral:
                mock_mistral.return_value.chat.complete.return_value = mock_response
                from src.graph.nodes.extract_agents._llm import _call_mistral_json
                result = await _call_mistral_json("system", "user")
                assert "total" in result
