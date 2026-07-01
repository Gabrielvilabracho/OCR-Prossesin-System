"""T8 RED — agente-totales tests: SS0 contract shape + SS3 totals extraction.

Mock boundary: src.graph.nodes.extract_agents._llm._call_mistral_json
"""

from unittest.mock import AsyncMock, patch

import pytest

from src.graph.nodes.extract_agents.totales import run as run_totales


OCR_WITH_TOTALS = (
    "FATURA\n"
    "Subtotal: 1000.00\n"
    "Desconto: 50.00\n"
    "IVA 23%: 219.50\n"
    "Total: 1169.50 EUR"
)

OCR_BAD_VAT = (
    "FATURA\n"
    "Subtotal: 1000.00\n"
    "IVA 15%: 150.00\n"  # 15 is not a valid PT VAT rate
    "Total: 1150.00 EUR"
)


class TestTotalesAgentContractShape:
    """SS0: result must have {agent, fields, warnings, errors}."""

    @pytest.mark.asyncio
    async def test_result_has_all_required_keys(self):
        with patch(
            "src.graph.nodes.extract_agents.totales._call_mistral_json",
            new=AsyncMock(return_value={}),
        ):
            result = await run_totales("text")

        assert "agent" in result
        assert "fields" in result
        assert "warnings" in result
        assert "errors" in result

    @pytest.mark.asyncio
    async def test_agent_name_is_agente_totales(self):
        with patch(
            "src.graph.nodes.extract_agents.totales._call_mistral_json",
            new=AsyncMock(return_value={}),
        ):
            result = await run_totales("text")

        assert result["agent"] == "agente-totales"


class TestTotalesAgentSS3:
    """SS3: totals extracted as strings, EUR default, VAT rate guard."""

    @pytest.mark.asyncio
    async def test_extracts_totals_as_strings_with_eur_default(self):
        """SS3: subtotal/IVA/total returned as strings, currency defaults to EUR."""
        llm_response = {
            "subtotal": "1000.00",
            "vat_amount": "219.50",
            "total": "1169.50",
            "discount": "50.00",
            "currency": "EUR",
            "vat_rate": 23,
        }
        with patch(
            "src.graph.nodes.extract_agents.totales._call_mistral_json",
            new=AsyncMock(return_value=llm_response),
        ):
            result = await run_totales(OCR_WITH_TOTALS)

        fields = result["fields"]
        assert fields["subtotal"] == "1000.00"
        assert fields["vat_amount"] == "219.50"
        assert fields["total"] == "1169.50"
        assert fields["discount"] == "50.00"
        assert fields["currency"] == "EUR"
        assert fields["vat_rate"] == 23
        assert result["errors"] == []
        assert result["warnings"] == []

    @pytest.mark.asyncio
    async def test_missing_currency_defaults_to_eur(self):
        """SS3: when LLM omits currency, default to EUR."""
        llm_response = {
            "subtotal": "500.00",
            "vat_amount": "115.00",
            "total": "615.00",
            "vat_rate": 23,
            # no "currency" key
        }
        with patch(
            "src.graph.nodes.extract_agents.totales._call_mistral_json",
            new=AsyncMock(return_value=llm_response),
        ):
            result = await run_totales("some text")

        assert result["fields"]["currency"] == "EUR"

    @pytest.mark.asyncio
    async def test_unsupported_vat_rate_becomes_none_with_warning(self):
        """SS3: VAT rate not in {0,6,13,23} → None + warning with agente-totales."""
        llm_response = {
            "subtotal": "1000.00",
            "vat_amount": "150.00",
            "total": "1150.00",
            "currency": "EUR",
            "vat_rate": 15,   # unsupported
        }
        with patch(
            "src.graph.nodes.extract_agents.totales._call_mistral_json",
            new=AsyncMock(return_value=llm_response),
        ):
            result = await run_totales(OCR_BAD_VAT)

        assert result["fields"]["vat_rate"] is None
        assert any("agente-totales" in w for w in result["warnings"])

    @pytest.mark.asyncio
    async def test_float_monetary_values_coerced_to_string(self):
        """If LLM returns floats for monetary fields, coerce to string."""
        llm_response = {
            "subtotal": 1000.0,   # float
            "vat_amount": 230.0,  # float
            "total": 1230.0,      # float
            "currency": "EUR",
            "vat_rate": 23,
        }
        with patch(
            "src.graph.nodes.extract_agents.totales._call_mistral_json",
            new=AsyncMock(return_value=llm_response),
        ):
            result = await run_totales("text")

        fields = result["fields"]
        assert isinstance(fields["subtotal"], str)
        assert isinstance(fields["vat_amount"], str)
        assert isinstance(fields["total"], str)

    @pytest.mark.asyncio
    async def test_llm_error_propagates_to_errors_list(self):
        with patch(
            "src.graph.nodes.extract_agents.totales._call_mistral_json",
            new=AsyncMock(side_effect=ValueError("No valid JSON")),
        ):
            result = await run_totales("bad text")

        assert any("agente-totales" in e for e in result["errors"])
        assert result["fields"] == {}
