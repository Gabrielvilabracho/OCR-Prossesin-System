"""Tests for the persist node — Supabase write-back.

TDD RED phase — all tests fail until persist_node is implemented.
Uses mocks — NO real Supabase calls.
"""

from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from src.graph.nodes.persist import persist_node
from src.graph.state import InvoiceState


class TestPersistNode:
    """Unit tests for persist_node — mocked Supabase."""

    # ─── Happy path ─────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_returns_status_success_on_happy_path(self):
        """persist_node must return status='success' when no errors in state."""
        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/abc.pdf",
            "client_id": "sample-client-001",
            "dry_run": False,
            "invoice_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            "extracted_fields": {
                "supplier_name": "TechSolutions Lda",
                "supplier_nif": "500123456",
                "subtotal": "1000.00",
                "vat_amount": "230.00",
                "total": "1230.00",
                "vat_rate": 23,
            },
            "math_valid": True,
            "validation_errors": [],
            "errors": [],
            "audit_log": [],
        }

        with patch("src.graph.nodes.persist.get_supabase_client") as mock_get_client:
            mock_table = MagicMock()
            mock_table.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[{"id": state["invoice_id"]}])
            mock_client = MagicMock()
            mock_client.schema.return_value.from_.return_value = mock_table
            mock_get_client.return_value = mock_client

            result = await persist_node(state)

        assert result["status"] == "success"

    @pytest.mark.asyncio
    async def test_calls_supabase_table_invoices(self):
        """persist_node must write to facturas.invoices table."""
        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/abc.pdf",
            "client_id": "sample-client-001",
            "dry_run": False,
            "invoice_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            "extracted_fields": {"subtotal": "100.00", "total": "123.00"},
            "math_valid": True,
            "validation_errors": [],
            "errors": [],
            "audit_log": [],
        }

        with patch("src.graph.nodes.persist.get_supabase_client") as mock_get_client:
            mock_table = MagicMock()
            mock_table.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[{}])
            mock_client = MagicMock()
            mock_client.schema.return_value.from_.return_value = mock_table
            mock_get_client.return_value = mock_client

            await persist_node(state)

        mock_client.schema.assert_called_once_with("facturas")
        mock_client.schema.return_value.from_.assert_called_once_with("invoices")

    @pytest.mark.asyncio
    async def test_updates_by_invoice_id(self):
        """persist_node must filter the UPDATE by invoice_id."""
        invoice_id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/abc.pdf",
            "client_id": "sample-client-001",
            "dry_run": False,
            "invoice_id": invoice_id,
            "extracted_fields": {},
            "math_valid": True,
            "validation_errors": [],
            "errors": [],
            "audit_log": [],
        }

        with patch("src.graph.nodes.persist.get_supabase_client") as mock_get_client:
            mock_eq = MagicMock()
            mock_eq.execute.return_value = MagicMock(data=[{}])
            mock_update = MagicMock()
            mock_update.eq.return_value = mock_eq
            mock_table = MagicMock()
            mock_table.update.return_value = mock_update
            mock_client = MagicMock()
            mock_client.schema.return_value.from_.return_value = mock_table
            mock_get_client.return_value = mock_client

            await persist_node(state)

        mock_update.eq.assert_called_once_with("id", invoice_id)

    @pytest.mark.asyncio
    async def test_status_field_in_update_payload_is_validated(self):
        """persist_node must include status='validated' when math_valid=True."""
        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/abc.pdf",
            "client_id": "sample-client-001",
            "dry_run": False,
            "invoice_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            "extracted_fields": {"subtotal": "100.00"},
            "math_valid": True,
            "validation_errors": [],
            "errors": [],
            "audit_log": [],
        }

        with patch("src.graph.nodes.persist.get_supabase_client") as mock_get_client:
            mock_eq = MagicMock()
            mock_eq.execute.return_value = MagicMock(data=[{}])
            mock_update = MagicMock()
            mock_update.eq.return_value = mock_eq
            mock_table = MagicMock()
            mock_table.update.return_value = mock_update
            mock_client = MagicMock()
            mock_client.schema.return_value.from_.return_value = mock_table
            mock_get_client.return_value = mock_client

            await persist_node(state)

        update_payload = mock_table.update.call_args[0][0]
        assert update_payload.get("processing_status") == "validated"

    # ─── Error / failed paths ────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_status_failed_when_state_has_errors(self):
        """persist_node must set status='failed' when state.errors is non-empty."""
        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/abc.pdf",
            "client_id": "sample-client-001",
            "dry_run": False,
            "invoice_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            "extracted_fields": {},
            "math_valid": False,
            "validation_errors": ["Math validation failed"],
            "errors": ["Math validation failed"],
            "audit_log": [],
        }

        with patch("src.graph.nodes.persist.get_supabase_client") as mock_get_client:
            mock_table = MagicMock()
            mock_table.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[{}])
            mock_client = MagicMock()
            mock_client.schema.return_value.from_.return_value = mock_table
            mock_get_client.return_value = mock_client

            result = await persist_node(state)

        assert result["status"] == "failed"

    @pytest.mark.asyncio
    async def test_status_field_in_update_payload_is_failed_on_errors(self):
        """persist_node must include status='failed' in Supabase update when errors exist."""
        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/abc.pdf",
            "client_id": "sample-client-001",
            "dry_run": False,
            "invoice_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            "extracted_fields": {},
            "math_valid": False,
            "validation_errors": ["oops"],
            "errors": ["oops"],
            "audit_log": [],
        }

        with patch("src.graph.nodes.persist.get_supabase_client") as mock_get_client:
            mock_eq = MagicMock()
            mock_eq.execute.return_value = MagicMock(data=[{}])
            mock_update = MagicMock()
            mock_update.eq.return_value = mock_eq
            mock_table = MagicMock()
            mock_table.update.return_value = mock_update
            mock_client = MagicMock()
            mock_client.schema.return_value.from_.return_value = mock_table
            mock_get_client.return_value = mock_client

            await persist_node(state)

        update_payload = mock_table.update.call_args[0][0]
        assert update_payload.get("processing_status") == "failed"

    @pytest.mark.asyncio
    async def test_dry_run_skips_supabase_write(self):
        """In dry_run mode, persist_node must NOT call Supabase."""
        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/abc.pdf",
            "client_id": "sample-client-001",
            "dry_run": True,
            "invoice_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            "extracted_fields": {"subtotal": "100.00"},
            "math_valid": True,
            "validation_errors": [],
            "errors": [],
            "audit_log": [],
        }

        with patch("src.graph.nodes.persist.get_supabase_client") as mock_get_client:
            result = await persist_node(state)

        mock_get_client.assert_not_called()
        assert result["status"] == "dry_run"

    @pytest.mark.asyncio
    async def test_missing_invoice_id_adds_error(self):
        """If invoice_id is missing from state, persist_node must add an error."""
        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/abc.pdf",
            "client_id": "sample-client-001",
            "dry_run": False,
            "extracted_fields": {},
            "math_valid": True,
            "validation_errors": [],
            "errors": [],
            "audit_log": [],
        }

        result = await persist_node(state)

        assert result.get("status") == "failed"
        assert "errors" in result
        assert len(result["errors"]) > 0

    @pytest.mark.asyncio
    async def test_supabase_exception_adds_to_errors(self):
        """If Supabase raises, persist_node must add an error and set status=failed."""
        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/abc.pdf",
            "client_id": "sample-client-001",
            "dry_run": False,
            "invoice_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            "extracted_fields": {},
            "math_valid": True,
            "validation_errors": [],
            "errors": [],
            "audit_log": [],
        }

        with patch("src.graph.nodes.persist.get_supabase_client") as mock_get_client:
            mock_table = MagicMock()
            mock_table.update.return_value.eq.return_value.execute.side_effect = RuntimeError("DB error")
            mock_client = MagicMock()
            mock_client.schema.return_value.from_.return_value = mock_table
            mock_get_client.return_value = mock_client

            result = await persist_node(state)

        assert result["status"] == "failed"
        assert "errors" in result

    @pytest.mark.asyncio
    async def test_audit_log_entry_recorded(self):
        """persist_node must always add an audit_log entry."""
        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/abc.pdf",
            "client_id": "sample-client-001",
            "dry_run": False,
            "invoice_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            "extracted_fields": {},
            "math_valid": True,
            "validation_errors": [],
            "errors": [],
            "audit_log": [],
        }

        with patch("src.graph.nodes.persist.get_supabase_client") as mock_get_client:
            mock_table = MagicMock()
            mock_table.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[{}])
            mock_client = MagicMock()
            mock_client.schema.return_value.from_.return_value = mock_table
            mock_get_client.return_value = mock_client

            result = await persist_node(state)

        assert "audit_log" in result
        assert len(result["audit_log"]) >= 1
        assert result["audit_log"][0]["node"] == "persist"
