"""Tests for the extract node — Mistral LLM structured extraction.

Covers:
- SS5 compatibility: extract_node public contract unchanged after sub-agent refactor
- Tests patch run_extract_agents (the new delegation point after T13 refactor)
- Also tests the no-ocr-text error paths (no mocking needed)
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.graph.nodes.extract import extract_node
from src.graph.state import InvoiceState


# ─── Fixtures ────────────────────────────────────────────────────────────────

SAMPLE_OCR_TEXT = (
    "FATURA\n"
    "Fornecedor: TechSolutions Lda\n"
    "NIF: 100000002\n"
    "Número: FT 2026/001\n"
    "Data: 2026-05-01\n"
    "Subtotal: 1000.00\n"
    "IVA 23%: 230.00\n"
    "Total: 1230.00\n"
    "Moeda: EUR"
)

# NIF 100000002 is a valid PT NIF (passes mod-11 checksum)
SAMPLE_EXTRACTED = {
    "supplier_name": "TechSolutions Lda",
    "supplier_nif": "100000002",
    "invoice_number": "FT 2026/001",
    "invoice_date": "2026-05-01",
    "subtotal": "1000.00",
    "vat_amount": "230.00",
    "total": "1230.00",
    "vat_rate": 23,
    "currency": "EUR",
    "line_items": [],
}

SAMPLE_AUDIT = [
    {"node": "extract", "agent": "agente-header", "fields_extracted": 4, "warnings_count": 0, "errors_count": 0},
    {"node": "extract", "agent": "agente-lineas", "fields_extracted": 0, "warnings_count": 0, "errors_count": 0},
    {"node": "extract", "agent": "agente-totales", "fields_extracted": 5, "warnings_count": 0, "errors_count": 0},
    {"node": "extract", "agent": "agente-validador", "fields_extracted": 7, "reconciliation_warnings": 0, "errors_count": 0},
]


class TestExtractNode:
    """Unit tests for extract_node — mocked run_extract_agents."""

    @pytest.mark.asyncio
    async def test_returns_extracted_fields(self):
        """extract_node must return extracted_fields dict."""
        state: InvoiceState = {
            "raw_ocr_text": SAMPLE_OCR_TEXT,
            "storage_key": "invoices/sample-accounting/2026/05/test.pdf",
        }

        with patch(
            "src.graph.nodes.extract.run_extract_agents",
            new=AsyncMock(return_value=(SAMPLE_EXTRACTED, SAMPLE_AUDIT, [])),
        ):
            result = await extract_node(state)

        assert "extracted_fields" in result
        fields = result["extracted_fields"]
        assert fields["supplier_name"] == "TechSolutions Lda"
        assert fields["supplier_nif"] == "100000002"
        assert fields["invoice_number"] == "FT 2026/001"

    @pytest.mark.asyncio
    async def test_extracted_fields_has_decimal_monetary_values(self):
        """extract_node must produce string monetary values (Decimal-ready)."""
        state: InvoiceState = {
            "raw_ocr_text": SAMPLE_OCR_TEXT,
        }

        with patch(
            "src.graph.nodes.extract.run_extract_agents",
            new=AsyncMock(return_value=(SAMPLE_EXTRACTED, SAMPLE_AUDIT, [])),
        ):
            result = await extract_node(state)

        fields = result["extracted_fields"]
        assert isinstance(fields.get("subtotal"), str), "subtotal must be string (Decimal)"
        assert isinstance(fields.get("vat_amount"), str), "vat_amount must be string (Decimal)"
        assert isinstance(fields.get("total"), str), "total must be string (Decimal)"

    @pytest.mark.asyncio
    async def test_adds_audit_log_entry(self):
        """extract_node must include an audit_log entry with node='extract'."""
        state: InvoiceState = {
            "raw_ocr_text": SAMPLE_OCR_TEXT,
        }

        with patch(
            "src.graph.nodes.extract.run_extract_agents",
            new=AsyncMock(return_value=(SAMPLE_EXTRACTED, SAMPLE_AUDIT, [])),
        ):
            result = await extract_node(state)

        assert "audit_log" in result
        assert any(e.get("node") == "extract" for e in result["audit_log"])

    @pytest.mark.asyncio
    async def test_empty_raw_text_adds_error(self):
        """extract_node with empty raw_ocr_text must add an error."""
        state: InvoiceState = {
            "raw_ocr_text": "",
        }

        result = await extract_node(state)

        assert result.get("extracted_fields") == {}
        assert "errors" in result
        assert len(result["errors"]) > 0

    @pytest.mark.asyncio
    async def test_missing_raw_text_adds_error(self):
        """extract_node with no raw_ocr_text must add an error."""
        state: InvoiceState = {}

        result = await extract_node(state)

        assert result.get("extracted_fields") == {}
        assert "errors" in result

    @pytest.mark.asyncio
    async def test_run_extract_agents_exception_adds_error(self):
        """If run_extract_agents raises, extract_node must return errors and empty fields."""
        state: InvoiceState = {
            "raw_ocr_text": SAMPLE_OCR_TEXT,
        }

        with patch(
            "src.graph.nodes.extract.run_extract_agents",
            new=AsyncMock(side_effect=RuntimeError("unexpected failure")),
        ):
            result = await extract_node(state)

        assert result.get("extracted_fields") == {}
        assert "errors" in result

    @pytest.mark.asyncio
    async def test_sub_agent_errors_appear_in_result(self):
        """Sub-agent errors returned by run_extract_agents appear in result errors."""
        state: InvoiceState = {
            "raw_ocr_text": SAMPLE_OCR_TEXT,
        }

        with patch(
            "src.graph.nodes.extract.run_extract_agents",
            new=AsyncMock(return_value=(
                SAMPLE_EXTRACTED,
                SAMPLE_AUDIT,
                ["agente-lineas: LLM call failed"],
            )),
        ):
            result = await extract_node(state)

        assert "errors" in result
        assert any("agente-lineas" in e for e in result["errors"])

    @pytest.mark.asyncio
    async def test_partial_extraction_is_allowed(self):
        """extract_node must handle partial extraction (some fields None)."""
        partial = {
            "supplier_name": "Unknown Supplier",
            "supplier_nif": None,
            "invoice_number": None,
            "invoice_date": None,
            "subtotal": None,
            "vat_amount": None,
            "total": None,
            "vat_rate": None,
            "currency": "EUR",
            "line_items": [],
        }

        state: InvoiceState = {
            "raw_ocr_text": "very unclear document text",
        }

        with patch(
            "src.graph.nodes.extract.run_extract_agents",
            new=AsyncMock(return_value=(partial, SAMPLE_AUDIT, [])),
        ):
            result = await extract_node(state)

        # Should succeed (partial is valid) — no errors
        assert result.get("extracted_fields") is not None
        assert "errors" not in result or len(result.get("errors", [])) == 0


# ─── SS5: Compatibility tests using mocked run_extract_agents ─────────────────


MOCK_EXTRACTED = {
    "supplier_name": "TechSolutions Lda",
    "supplier_nif": "100000002",
    "invoice_number": "FT 2026/001",
    "invoice_date": "2026-05-01",
    "subtotal": "1000.00",
    "vat_amount": "230.00",
    "total": "1230.00",
    "vat_rate": 23,
    "currency": "EUR",
    "line_items": [],
}


class TestExtractNodeSS5Compatibility:
    """SS5: extract_node public contract unchanged after sub-agent refactor.

    These tests patch run_extract_agents at the module level.
    """

    @pytest.mark.asyncio
    async def test_extracted_fields_contains_invoice_fields_keys(self):
        """SS5: extracted_fields keys must be subset of InvoiceFields fields."""
        from src.models.invoice import InvoiceFields

        state: InvoiceState = {"raw_ocr_text": SAMPLE_OCR_TEXT}

        with patch(
            "src.graph.nodes.extract.run_extract_agents",
            new=AsyncMock(return_value=(MOCK_EXTRACTED, [{"node": "extract", "status": "success"}], [])),
        ):
            result = await extract_node(state)

        fields = result.get("extracted_fields", {})
        invoice_keys = set(InvoiceFields.model_fields.keys())
        result_keys = set(fields.keys())
        extra_keys = result_keys - invoice_keys
        assert extra_keys == set(), (
            f"extracted_fields has keys not in InvoiceFields: {extra_keys}"
        )

    @pytest.mark.asyncio
    async def test_audit_log_entry_present_with_node_extract(self):
        """SS5: audit_log must have at least one entry with node='extract'."""
        state: InvoiceState = {"raw_ocr_text": SAMPLE_OCR_TEXT}

        with patch(
            "src.graph.nodes.extract.run_extract_agents",
            new=AsyncMock(return_value=(MOCK_EXTRACTED, [{"node": "extract", "status": "success"}], [])),
        ):
            result = await extract_node(state)

        assert "audit_log" in result
        assert any(e.get("node") == "extract" for e in result["audit_log"])

    @pytest.mark.asyncio
    async def test_errors_from_subagents_surfaced_in_result(self):
        """SS5: errors returned by run_extract_agents appear in result errors."""
        state: InvoiceState = {"raw_ocr_text": SAMPLE_OCR_TEXT}

        with patch(
            "src.graph.nodes.extract.run_extract_agents",
            new=AsyncMock(return_value=(
                MOCK_EXTRACTED,
                [{"node": "extract", "status": "partial"}],
                ["agente-lineas: LLM call failed"],
            )),
        ):
            result = await extract_node(state)

        assert "errors" in result
        assert any("agente-lineas" in e for e in result["errors"])
