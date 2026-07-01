"""Tests for the fetch_document node — Supabase Storage download.

TDD RED phase — all tests fail until fetch_document is implemented.
Uses mocks — NO real Supabase calls.
Covers PDF regression (SM1), image download parity (SM2),
and inaccessible document error handling (SM6).
"""

from unittest.mock import MagicMock, patch

import pytest

from src.graph.nodes.fetch_document import fetch_document_node
from src.graph.state import InvoiceState
from src.models.document import DocumentFormat


class TestFetchDocumentNode:
    """Unit tests for fetch_document_node — mocked Supabase."""

    # ─── PDF regression (SM1) ────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_returns_document_bytes_for_pdf(self):
        """fetch_document_node must return document_bytes from Supabase Storage for PDF."""
        fake_pdf = b"%PDF-1.4 fake content"

        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/abc123.pdf",
            "client_id": "sample-client-001",
            "dry_run": False,
            "document_format": DocumentFormat.PDF,
            "mime_type": "application/pdf",
        }

        with patch("src.graph.nodes.fetch_document.get_supabase_client") as mock_get_client:
            mock_storage = MagicMock()
            mock_storage.from_.return_value.download.return_value = fake_pdf
            mock_client = MagicMock()
            mock_client.storage = mock_storage
            mock_get_client.return_value = mock_client

            result = await fetch_document_node(state)

        assert "document_bytes" in result
        assert result["document_bytes"] == fake_pdf

    @pytest.mark.asyncio
    async def test_pdf_no_pdf_bytes_key(self):
        """fetch_document_node must NOT produce a pdf_bytes key (renamed to document_bytes)."""
        fake_pdf = b"%PDF-1.4"

        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/abc123.pdf",
            "client_id": "sample-client-001",
            "document_format": DocumentFormat.PDF,
            "mime_type": "application/pdf",
        }

        with patch("src.graph.nodes.fetch_document.get_supabase_client") as mock_get_client:
            mock_storage = MagicMock()
            mock_storage.from_.return_value.download.return_value = fake_pdf
            mock_client = MagicMock()
            mock_client.storage = mock_storage
            mock_get_client.return_value = mock_client

            result = await fetch_document_node(state)

        assert "pdf_bytes" not in result, "pdf_bytes key must not appear — use document_bytes"

    # ─── Image parity (SM2) ──────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_returns_document_bytes_for_jpeg(self):
        """fetch_document_node must return document_bytes for a JPEG image."""
        fake_jpeg = b"\xff\xd8\xff fake jpeg"

        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/invoice.jpg",
            "client_id": "sample-client-001",
            "document_format": DocumentFormat.IMAGE,
            "mime_type": "image/jpeg",
        }

        with patch("src.graph.nodes.fetch_document.get_supabase_client") as mock_get_client:
            mock_storage = MagicMock()
            mock_storage.from_.return_value.download.return_value = fake_jpeg
            mock_client = MagicMock()
            mock_client.storage = mock_storage
            mock_get_client.return_value = mock_client

            result = await fetch_document_node(state)

        assert result["document_bytes"] == fake_jpeg

    @pytest.mark.asyncio
    async def test_returns_document_bytes_for_png(self):
        """fetch_document_node must return document_bytes for a PNG image."""
        fake_png = b"\x89PNG\r\n fake png"

        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/invoice.png",
            "client_id": "sample-client-001",
            "document_format": DocumentFormat.IMAGE,
            "mime_type": "image/png",
        }

        with patch("src.graph.nodes.fetch_document.get_supabase_client") as mock_get_client:
            mock_storage = MagicMock()
            mock_storage.from_.return_value.download.return_value = fake_png
            mock_client = MagicMock()
            mock_client.storage = mock_storage
            mock_get_client.return_value = mock_client

            result = await fetch_document_node(state)

        assert result["document_bytes"] == fake_png

    # ─── XML download ────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_returns_document_bytes_for_xml(self):
        """fetch_document_node must return document_bytes for an XML file."""
        fake_xml = b"<?xml version='1.0'?><Invoice></Invoice>"

        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/invoice.xml",
            "client_id": "sample-client-001",
            "document_format": DocumentFormat.XML,
            "mime_type": "application/xml",
        }

        with patch("src.graph.nodes.fetch_document.get_supabase_client") as mock_get_client:
            mock_storage = MagicMock()
            mock_storage.from_.return_value.download.return_value = fake_xml
            mock_client = MagicMock()
            mock_client.storage = mock_storage
            mock_get_client.return_value = mock_client

            result = await fetch_document_node(state)

        assert result["document_bytes"] == fake_xml

    # ─── Audit log ───────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_returns_audit_log_entry(self):
        """fetch_document_node must include an audit_log entry."""
        fake_pdf = b"%PDF-1.4 test"

        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/abc123.pdf",
            "client_id": "sample-client-001",
            "document_format": DocumentFormat.PDF,
            "mime_type": "application/pdf",
        }

        with patch("src.graph.nodes.fetch_document.get_supabase_client") as mock_get_client:
            mock_storage = MagicMock()
            mock_storage.from_.return_value.download.return_value = fake_pdf
            mock_client = MagicMock()
            mock_client.storage = mock_storage
            mock_get_client.return_value = mock_client

            result = await fetch_document_node(state)

        assert "audit_log" in result
        assert len(result["audit_log"]) >= 1
        entry = result["audit_log"][0]
        assert entry["node"] == "fetch_document"
        assert "size_bytes" in entry

    @pytest.mark.asyncio
    async def test_audit_log_records_storage_key(self):
        """fetch_document_node audit log must record the storage key."""
        fake_pdf = b"content"
        storage_key = "invoices/sample-accounting/2026/05/xyz789.pdf"

        state: InvoiceState = {
            "storage_key": storage_key,
            "client_id": "sample-client-001",
            "document_format": DocumentFormat.PDF,
            "mime_type": "application/pdf",
        }

        with patch("src.graph.nodes.fetch_document.get_supabase_client") as mock_get_client:
            mock_storage = MagicMock()
            mock_storage.from_.return_value.download.return_value = fake_pdf
            mock_client = MagicMock()
            mock_client.storage = mock_storage
            mock_get_client.return_value = mock_client

            result = await fetch_document_node(state)

        entry = result["audit_log"][0]
        assert entry.get("storage_key") == storage_key

    @pytest.mark.asyncio
    async def test_audit_log_correct_size(self):
        """audit_log entry must report actual size of downloaded document."""
        fake_pdf = b"A" * 1024  # 1 KB

        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/sized.pdf",
            "client_id": "sample-client-001",
            "document_format": DocumentFormat.PDF,
            "mime_type": "application/pdf",
        }

        with patch("src.graph.nodes.fetch_document.get_supabase_client") as mock_get_client:
            mock_storage = MagicMock()
            mock_storage.from_.return_value.download.return_value = fake_pdf
            mock_client = MagicMock()
            mock_client.storage = mock_storage
            mock_get_client.return_value = mock_client

            result = await fetch_document_node(state)

        entry = result["audit_log"][0]
        assert entry["size_bytes"] == 1024

    # ─── Error handling (SM6 — inaccessible document) ────────────────────────

    @pytest.mark.asyncio
    async def test_missing_storage_key_adds_error(self):
        """fetch_document_node with no storage_key must add an error and empty bytes."""
        state: InvoiceState = {
            "client_id": "sample-client-001",
            "document_format": DocumentFormat.PDF,
            "mime_type": "application/pdf",
        }

        result = await fetch_document_node(state)

        assert result.get("document_bytes") == b""
        assert "errors" in result
        assert len(result["errors"]) > 0

    @pytest.mark.asyncio
    async def test_supabase_error_adds_to_errors(self):
        """If Supabase raises an exception, errors must be populated."""
        storage_key = "invoices/sample-accounting/2026/05/missing.pdf"

        state: InvoiceState = {
            "storage_key": storage_key,
            "client_id": "sample-client-001",
            "document_format": DocumentFormat.PDF,
            "mime_type": "application/pdf",
        }

        with patch("src.graph.nodes.fetch_document.get_supabase_client") as mock_get_client:
            mock_storage = MagicMock()
            mock_storage.from_.return_value.download.side_effect = RuntimeError("Storage error")
            mock_client = MagicMock()
            mock_client.storage = mock_storage
            mock_get_client.return_value = mock_client

            result = await fetch_document_node(state)

        assert result.get("document_bytes") == b""
        assert "errors" in result
        assert any("Storage error" in e or "storage" in e.lower() for e in result["errors"])

    @pytest.mark.asyncio
    async def test_calls_correct_bucket(self):
        """fetch_document_node must call storage.from_('noxx-invoices').download(storage_key)."""
        fake_pdf = b"pdf bytes"
        storage_key = "invoices/sample-accounting/2026/05/test.pdf"

        state: InvoiceState = {
            "storage_key": storage_key,
            "client_id": "sample-client-001",
            "document_format": DocumentFormat.PDF,
            "mime_type": "application/pdf",
        }

        with patch("src.graph.nodes.fetch_document.get_supabase_client") as mock_get_client:
            mock_download = MagicMock(return_value=fake_pdf)
            mock_bucket = MagicMock()
            mock_bucket.download = mock_download
            mock_storage = MagicMock()
            mock_storage.from_.return_value = mock_bucket
            mock_client = MagicMock()
            mock_client.storage = mock_storage
            mock_get_client.return_value = mock_client

            await fetch_document_node(state)

        mock_storage.from_.assert_called_once_with("noxx-invoices")
        mock_download.assert_called_once_with(storage_key)
