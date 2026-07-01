"""Tests for Decimal validation in extract_node output.

After refactor to sub-agents, these tests use run_extract_agents mock.
The validation behaviors (float coercion, NIF → None, invalid VAT → error)
are now exercised in extract_agents tests; these tests verify the end-to-end
contract is preserved through extract_node (SS5).
"""

from unittest.mock import AsyncMock, patch

import pytest

from src.graph.nodes.extract import extract_node
from src.graph.state import InvoiceState

SAMPLE_AUDIT = [
    {"node": "extract", "agent": "agente-header", "fields_extracted": 3,
     "warnings_count": 0, "errors_count": 0},
    {"node": "extract", "agent": "agente-lineas", "fields_extracted": 0,
     "warnings_count": 0, "errors_count": 0},
    {"node": "extract", "agent": "agente-totales", "fields_extracted": 5,
     "warnings_count": 0, "errors_count": 0},
    {"node": "extract", "agent": "agente-validador", "fields_extracted": 6,
     "reconciliation_warnings": 0, "errors_count": 0},
]


class TestExtractDecimalValidation:
    """Tests that extract_node coerces and validates monetary fields from LLM output."""

    @pytest.mark.asyncio
    async def test_float_total_coerced_to_string(self):
        """LLM returning float total must be coerced to string (not kept as float).

        The coercion now happens in agente-totales and agente-lineas.
        run_extract_agents returns already-coerced values through reconcile.
        """
        state: InvoiceState = {
            "raw_ocr_text": "FATURA subtotal 1000 IVA 230 total 1230",
        }

        extracted = {
            "supplier_name": "Tech Lda",
            "supplier_nif": None,
            "invoice_number": None,
            "invoice_date": None,
            "subtotal": "1000.0",    # coerced by totales agent
            "vat_amount": "230.0",   # coerced by totales agent
            "total": "1230.0",       # coerced by totales agent
            "vat_rate": 23,
            "currency": "EUR",
            "line_items": [],
        }

        with patch(
            "src.graph.nodes.extract.run_extract_agents",
            new=AsyncMock(return_value=(extracted, SAMPLE_AUDIT, [])),
        ):
            result = await extract_node(state)

        fields = result.get("extracted_fields", {})
        assert fields is not None
        # After coercion, monetary fields must be strings
        for field in ("subtotal", "vat_amount", "total"):
            val = fields.get(field)
            if val is not None:
                assert isinstance(val, str), (
                    f"{field} must be string (Decimal-ready), got {type(val)}: {val!r}"
                )

    @pytest.mark.asyncio
    async def test_string_monetary_values_preserved(self):
        """String monetary values (correctly formatted) must pass through unchanged."""
        state: InvoiceState = {
            "raw_ocr_text": "FATURA subtotal 1000.00",
        }

        extracted = {
            "supplier_name": "Tech Lda",
            "supplier_nif": None,
            "invoice_number": None,
            "invoice_date": None,
            "subtotal": "1000.00",
            "vat_amount": "230.00",
            "total": "1230.00",
            "vat_rate": 23,
            "currency": "EUR",
            "line_items": [],
        }

        with patch(
            "src.graph.nodes.extract.run_extract_agents",
            new=AsyncMock(return_value=(extracted, SAMPLE_AUDIT, [])),
        ):
            result = await extract_node(state)

        fields = result.get("extracted_fields", {})
        assert fields.get("subtotal") == "1000.00"
        assert fields.get("vat_amount") == "230.00"
        assert fields.get("total") == "1230.00"

    @pytest.mark.asyncio
    async def test_invalid_vat_rate_adds_error_not_abort(self):
        """Invalid VAT rate (e.g. 21) must add an error but NOT abort pipeline.

        agente-totales sets vat_rate=None + error in its SectionResult.
        reconcile surfaces that error. extract_node propagates it.
        """
        state: InvoiceState = {
            "raw_ocr_text": "FATURA subtotal 1000",
        }

        extracted = {
            "supplier_name": "Tech Lda",
            "supplier_nif": None,
            "invoice_number": None,
            "invoice_date": None,
            "subtotal": "1000.00",
            "vat_amount": "210.00",
            "total": "1210.00",
            "vat_rate": None,   # invalid rate → set to None by totales agent
            "currency": "EUR",
            "line_items": [],
        }
        # Warning from agente-totales about invalid VAT rate
        errors = ["agente-totales: invalid VAT rate 21 — expected one of [0, 6, 13, 23]. Setting vat_rate=None."]

        with patch(
            "src.graph.nodes.extract.run_extract_agents",
            new=AsyncMock(return_value=(extracted, SAMPLE_AUDIT, errors)),
        ):
            result = await extract_node(state)

        # Pipeline must NOT be aborted — extracted_fields must still be returned
        assert result.get("extracted_fields") is not None
        # Error must be recorded
        assert "errors" in result
        assert len(result["errors"]) > 0

    @pytest.mark.asyncio
    async def test_valid_nif_preserved_in_extracted_fields(self):
        """Valid NIF must pass through unchanged in extracted_fields.

        NIF 100000002 is valid: passes mod-11 checksum.
        """
        state: InvoiceState = {
            "raw_ocr_text": "FATURA NIF 100000002",
        }

        extracted = {
            "supplier_name": "Tech Lda",
            "supplier_nif": "100000002",  # valid PT NIF — preserved by header agent
            "invoice_number": None,
            "invoice_date": None,
            "subtotal": "1000.00",
            "vat_amount": "230.00",
            "total": "1230.00",
            "vat_rate": 23,
            "currency": "EUR",
            "line_items": [],
        }

        with patch(
            "src.graph.nodes.extract.run_extract_agents",
            new=AsyncMock(return_value=(extracted, SAMPLE_AUDIT, [])),
        ):
            result = await extract_node(state)

        fields = result.get("extracted_fields", {})
        assert fields.get("supplier_nif") == "100000002"

    @pytest.mark.asyncio
    async def test_invalid_nif_becomes_none_in_extracted_fields(self):
        """Invalid NIF from LLM (bad checksum) must become None in extracted_fields.

        agente-header validates NIF and sets it to None if invalid.
        reconcile preserves the None. InvoiceFields coercion also ensures None.
        """
        state: InvoiceState = {
            "raw_ocr_text": "FATURA NIF 500123456",
        }

        extracted = {
            "supplier_name": "Tech Lda",
            "supplier_nif": None,   # invalid NIF → None by header agent
            "invoice_number": None,
            "invoice_date": None,
            "subtotal": "1000.00",
            "vat_amount": "230.00",
            "total": "1230.00",
            "vat_rate": 23,
            "currency": "EUR",
            "line_items": [],
        }

        with patch(
            "src.graph.nodes.extract.run_extract_agents",
            new=AsyncMock(return_value=(extracted, SAMPLE_AUDIT, [])),
        ):
            result = await extract_node(state)

        fields = result.get("extracted_fields", {})
        # Invalid NIF → None
        assert fields.get("supplier_nif") is None
