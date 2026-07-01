"""T4 RED — agente-header tests: SS0 contract shape + SS1 field extraction.

Mock boundary: src.graph.nodes.extract_agents._llm._call_mistral_json
"""

import json
from unittest.mock import AsyncMock, patch

import pytest

from src.graph.nodes.extract_agents.header import run as run_header


OCR_WITH_HEADER = (
    "FATURA\n"
    "Fornecedor: TechSolutions Lda\n"
    "NIF Fornecedor: 100000002\n"
    "NIF Cliente: 500000000\n"
    "Número: FT 2026/001\n"
    "Série: A\n"
    "Data: 2026-05-01\n"
    "Total: 1230.00 EUR"
)

OCR_INVALID_NIF = (
    "FATURA\n"
    "NIF Fornecedor: 99999999\n"  # only 8 digits, invalid
    "Número: FT 2026/002\n"
    "Data: 2026-05-02\n"
)

OCR_MISSING_RECEIVER = (
    "FATURA\n"
    "NIF Fornecedor: 100000002\n"
    "Número: FT 2026/003\n"
    "Data: 2026-05-03\n"
    # no receiver NIF
)


class TestHeaderAgentContractShape:
    """SS0: result must have {agent, fields, warnings, errors}."""

    @pytest.mark.asyncio
    async def test_result_has_all_required_keys(self):
        llm_response = {
            "supplier_name": "TechSolutions Lda",
            "supplier_nif": "100000002",
            "receiver_nif": "500000000",
            "invoice_number": "FT 2026/001",
            "invoice_series": "A",
            "invoice_date": "2026-05-01",
        }
        with patch(
            "src.graph.nodes.extract_agents.header._call_mistral_json",
            new=AsyncMock(return_value=llm_response),
        ):
            result = await run_header(OCR_WITH_HEADER)

        assert "agent" in result
        assert "fields" in result
        assert "warnings" in result
        assert "errors" in result

    @pytest.mark.asyncio
    async def test_agent_name_is_agente_header(self):
        with patch(
            "src.graph.nodes.extract_agents.header._call_mistral_json",
            new=AsyncMock(return_value={}),
        ):
            result = await run_header("some text")

        assert result["agent"] == "agente-header"


class TestHeaderAgentSS1Fields:
    """SS1: header fields extracted when present."""

    @pytest.mark.asyncio
    async def test_extracts_supplier_nif_and_date_and_number(self):
        """SS1: fields present → returned as strings."""
        llm_response = {
            "supplier_name": "TechSolutions Lda",
            "supplier_nif": "100000002",
            "receiver_nif": "500000000",
            "invoice_number": "FT 2026/001",
            "invoice_series": "A",
            "invoice_date": "2026-05-01",
        }
        with patch(
            "src.graph.nodes.extract_agents.header._call_mistral_json",
            new=AsyncMock(return_value=llm_response),
        ):
            result = await run_header(OCR_WITH_HEADER)

        fields = result["fields"]
        assert fields["supplier_nif"] == "100000002"
        assert fields["receiver_nif"] == "500000000"
        assert fields["invoice_date"] == "2026-05-01"
        assert fields["invoice_number"] == "FT 2026/001"
        assert fields["invoice_series"] == "A"
        assert result["errors"] == []

    @pytest.mark.asyncio
    async def test_invalid_nif_becomes_none_and_emits_warning(self):
        """SS1: invalid/missing NIF → None + warning identifies agente-header."""
        llm_response = {
            "supplier_nif": "99999999",   # invalid (8 digits)
            "receiver_nif": None,
            "invoice_number": "FT 2026/002",
            "invoice_date": "2026-05-02",
        }
        with patch(
            "src.graph.nodes.extract_agents.header._call_mistral_json",
            new=AsyncMock(return_value=llm_response),
        ):
            result = await run_header(OCR_INVALID_NIF)

        assert result["fields"].get("supplier_nif") is None
        assert any("agente-header" in w for w in result["warnings"])

    @pytest.mark.asyncio
    async def test_missing_receiver_nif_emits_warning(self):
        """SS1: absent receiver NIF → None + warning."""
        llm_response = {
            "supplier_nif": "100000002",
            "receiver_nif": None,
            "invoice_number": "FT 2026/003",
            "invoice_date": "2026-05-03",
        }
        with patch(
            "src.graph.nodes.extract_agents.header._call_mistral_json",
            new=AsyncMock(return_value=llm_response),
        ):
            result = await run_header(OCR_MISSING_RECEIVER)

        assert result["fields"].get("receiver_nif") is None
        assert any("agente-header" in w for w in result["warnings"])

    @pytest.mark.asyncio
    async def test_llm_error_propagates_to_errors_list(self):
        """If LLM call raises, errors list contains agente-header prefix."""
        with patch(
            "src.graph.nodes.extract_agents.header._call_mistral_json",
            new=AsyncMock(side_effect=ValueError("No valid JSON")),
        ):
            result = await run_header("bad ocr text")

        assert any("agente-header" in e for e in result["errors"])
        assert result["fields"] == {}
