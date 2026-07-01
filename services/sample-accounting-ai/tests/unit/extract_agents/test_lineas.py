"""T6 RED — agente-lineas tests: SS0 contract shape + SS2 line item extraction.

Mock boundary: src.graph.nodes.extract_agents._llm._call_mistral_json
"""

from unittest.mock import AsyncMock, patch

import pytest

from src.graph.nodes.extract_agents.lineas import run as run_lineas


OCR_TWO_LINES = (
    "FATURA\n"
    "1. Consultoria 10h x 100.00 = 1000.00 IVA 23%\n"
    "2. Licença anual 1 x 500.00 = 500.00 IVA 23%\n"
    "Total: 1845.00 EUR"
)

OCR_PARTIAL_LINE = (
    "FATURA\n"
    "1. Software license 1 x (sem preço) = 250.00\n"
    "Total: 307.50 EUR"
)


class TestLineasAgentContractShape:
    """SS0: result must have {agent, fields, warnings, errors}."""

    @pytest.mark.asyncio
    async def test_result_has_all_required_keys(self):
        with patch(
            "src.graph.nodes.extract_agents.lineas._call_mistral_json",
            new=AsyncMock(return_value={"line_items": []}),
        ):
            result = await run_lineas("some text")

        assert "agent" in result
        assert "fields" in result
        assert "warnings" in result
        assert "errors" in result

    @pytest.mark.asyncio
    async def test_agent_name_is_agente_lineas(self):
        with patch(
            "src.graph.nodes.extract_agents.lineas._call_mistral_json",
            new=AsyncMock(return_value={"line_items": []}),
        ):
            result = await run_lineas("some text")

        assert result["agent"] == "agente-lineas"


class TestLineasAgentSS2:
    """SS2: line items extracted with Decimal-ready string money values."""

    @pytest.mark.asyncio
    async def test_extracts_two_line_items_as_strings(self):
        """SS2: two lines → two dicts with string monetary values."""
        llm_response = {
            "line_items": [
                {
                    "description": "Consultoria",
                    "quantity": "10",
                    "unit_price": "100.00",
                    "subtotal": "1000.00",
                    "vat_rate": 23,
                    "vat_amount": "230.00",
                },
                {
                    "description": "Licença anual",
                    "quantity": "1",
                    "unit_price": "500.00",
                    "subtotal": "500.00",
                    "vat_rate": 23,
                    "vat_amount": "115.00",
                },
            ]
        }
        with patch(
            "src.graph.nodes.extract_agents.lineas._call_mistral_json",
            new=AsyncMock(return_value=llm_response),
        ):
            result = await run_lineas(OCR_TWO_LINES)

        lines = result["fields"]["line_items"]
        assert len(lines) == 2
        # Monetary values must be strings (Decimal-ready), never float
        assert isinstance(lines[0]["unit_price"], str)
        assert isinstance(lines[0]["subtotal"], str)
        assert lines[0]["unit_price"] == "100.00"
        assert lines[1]["subtotal"] == "500.00"
        assert result["errors"] == []

    @pytest.mark.asyncio
    async def test_partial_line_retained_with_none_and_warning(self):
        """SS2: line with missing unit_price → None + line-level warning."""
        llm_response = {
            "line_items": [
                {
                    "description": "Software license",
                    "quantity": "1",
                    "unit_price": None,
                    "subtotal": "250.00",
                    "vat_rate": 23,
                    "vat_amount": None,
                }
            ]
        }
        with patch(
            "src.graph.nodes.extract_agents.lineas._call_mistral_json",
            new=AsyncMock(return_value=llm_response),
        ):
            result = await run_lineas(OCR_PARTIAL_LINE)

        lines = result["fields"]["line_items"]
        assert len(lines) == 1  # line retained despite missing field
        assert lines[0]["unit_price"] is None
        assert any("agente-lineas" in w for w in result["warnings"])

    @pytest.mark.asyncio
    async def test_float_monetary_values_coerced_to_string(self):
        """If LLM returns float instead of string, coerce to string."""
        llm_response = {
            "line_items": [
                {
                    "description": "Item",
                    "quantity": "1",
                    "unit_price": 50.0,   # float — should be coerced
                    "subtotal": 50.0,     # float — should be coerced
                    "vat_rate": 23,
                    "vat_amount": 11.5,   # float — should be coerced
                }
            ]
        }
        with patch(
            "src.graph.nodes.extract_agents.lineas._call_mistral_json",
            new=AsyncMock(return_value=llm_response),
        ):
            result = await run_lineas("text")

        line = result["fields"]["line_items"][0]
        assert isinstance(line["unit_price"], str)
        assert isinstance(line["subtotal"], str)
        assert isinstance(line["vat_amount"], str)

    @pytest.mark.asyncio
    async def test_llm_error_propagates_to_errors_list(self):
        with patch(
            "src.graph.nodes.extract_agents.lineas._call_mistral_json",
            new=AsyncMock(side_effect=ValueError("No valid JSON")),
        ):
            result = await run_lineas("bad text")

        assert any("agente-lineas" in e for e in result["errors"])
        assert result["fields"] == {}
