"""Tests for the ocr node — Mistral OCR.

Updated for sample-multiformat: uses document_bytes + mime_type instead of pdf_bytes.
Mocks Mistral client, no real API calls.
Covers PDF (SM1), image MIME assertion (SM2), and error paths (SM6).
"""

from unittest.mock import MagicMock, patch

import pytest

from src.graph.nodes.ocr import ocr_node
from src.graph.state import InvoiceState


class TestOcrNode:
    """Unit tests for ocr_node — mocked Mistral OCR."""

    @pytest.mark.asyncio
    async def test_returns_raw_ocr_text(self):
        """ocr_node must return raw_ocr_text from Mistral OCR response."""
        expected_text = "FATURA\nFornecedor: TechSolutions Lda\nSubtotal: 1000.00"

        state: InvoiceState = {
            "document_bytes": b"%PDF-1.4 fake pdf content",
            "mime_type": "application/pdf",
            "storage_key": "invoices/sample-accounting/2026/05/test.pdf",
        }

        with patch("src.graph.nodes.ocr.Mistral") as MockMistral:
            mock_response = MagicMock()
            mock_response.pages = [MagicMock(markdown=expected_text)]
            mock_instance = MagicMock()
            mock_instance.ocr.process.return_value = mock_response
            MockMistral.return_value = mock_instance

            result = await ocr_node(state)

        assert "raw_ocr_text" in result
        assert result["raw_ocr_text"] == expected_text

    @pytest.mark.asyncio
    async def test_concatenates_multiple_pages(self):
        """ocr_node must concatenate text from all pages with newline separator."""
        page1_text = "FATURA\nFornecedor: Empresa X"
        page2_text = "Subtotal: 1000.00\nTotal: 1230.00"

        state: InvoiceState = {
            "document_bytes": b"%PDF-1.4 multi-page",
            "mime_type": "application/pdf",
            "storage_key": "invoices/sample-accounting/2026/05/multi.pdf",
        }

        with patch("src.graph.nodes.ocr.Mistral") as MockMistral:
            mock_response = MagicMock()
            mock_response.pages = [
                MagicMock(markdown=page1_text),
                MagicMock(markdown=page2_text),
            ]
            mock_instance = MagicMock()
            mock_instance.ocr.process.return_value = mock_response
            MockMistral.return_value = mock_instance

            result = await ocr_node(state)

        assert result["raw_ocr_text"] == f"{page1_text}\n{page2_text}"

    @pytest.mark.asyncio
    async def test_adds_audit_log_entry(self):
        """ocr_node must return an audit_log entry."""
        state: InvoiceState = {
            "document_bytes": b"%PDF-1.4",
            "mime_type": "application/pdf",
            "storage_key": "invoices/sample-accounting/2026/05/test.pdf",
        }

        with patch("src.graph.nodes.ocr.Mistral") as MockMistral:
            mock_response = MagicMock()
            mock_response.pages = [MagicMock(markdown="some text")]
            mock_instance = MagicMock()
            mock_instance.ocr.process.return_value = mock_response
            MockMistral.return_value = mock_instance

            result = await ocr_node(state)

        assert "audit_log" in result
        assert len(result["audit_log"]) >= 1
        entry = result["audit_log"][0]
        assert entry["node"] == "ocr"
        assert "char_count" in entry

    @pytest.mark.asyncio
    async def test_calls_mistral_with_correct_model(self):
        """ocr_node must use mistral-ocr-latest model."""
        state: InvoiceState = {
            "document_bytes": b"%PDF-1.4",
            "mime_type": "application/pdf",
            "storage_key": "invoices/sample-accounting/2026/05/test.pdf",
        }

        with patch("src.graph.nodes.ocr.Mistral") as MockMistral:
            mock_response = MagicMock()
            mock_response.pages = [MagicMock(markdown="text")]
            mock_instance = MagicMock()
            mock_instance.ocr.process.return_value = mock_response
            MockMistral.return_value = mock_instance

            await ocr_node(state)

        call_kwargs = mock_instance.ocr.process.call_args
        assert call_kwargs is not None
        kwargs = call_kwargs.kwargs if call_kwargs.kwargs else {}
        args = call_kwargs.args if call_kwargs.args else ()
        model_used = kwargs.get("model") or (args[0] if args else None)
        assert model_used == "mistral-ocr-latest", f"Expected mistral-ocr-latest, got: {model_used}"

    @pytest.mark.asyncio
    async def test_empty_document_bytes_adds_error(self):
        """ocr_node with empty document_bytes must add an error."""
        state: InvoiceState = {
            "document_bytes": b"",
            "mime_type": "application/pdf",
            "storage_key": "invoices/sample-accounting/2026/05/empty.pdf",
        }

        result = await ocr_node(state)

        assert result.get("raw_ocr_text") == ""
        assert "errors" in result
        assert len(result["errors"]) > 0

    @pytest.mark.asyncio
    async def test_missing_document_bytes_adds_error(self):
        """ocr_node with no document_bytes in state must add an error."""
        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/no-pdf.pdf",
            "mime_type": "application/pdf",
        }

        result = await ocr_node(state)

        assert result.get("raw_ocr_text") == ""
        assert "errors" in result

    @pytest.mark.asyncio
    async def test_mistral_exception_adds_error(self):
        """If Mistral raises, ocr_node must return errors and empty text."""
        state: InvoiceState = {
            "document_bytes": b"%PDF-1.4 content",
            "mime_type": "application/pdf",
            "storage_key": "invoices/sample-accounting/2026/05/fail.pdf",
        }

        with patch("src.graph.nodes.ocr.Mistral") as MockMistral:
            mock_instance = MagicMock()
            mock_instance.ocr.process.side_effect = RuntimeError("API quota exceeded")
            MockMistral.return_value = mock_instance

            result = await ocr_node(state)

        assert result.get("raw_ocr_text") == ""
        assert "errors" in result
        assert any("quota" in e.lower() or "api" in e.lower() or "mistral" in e.lower()
                   for e in result["errors"])

    @pytest.mark.asyncio
    async def test_char_count_in_audit_matches_text_length(self):
        """audit_log char_count must match actual text length."""
        ocr_text = "FATURA text here"

        state: InvoiceState = {
            "document_bytes": b"%PDF-1.4",
            "mime_type": "application/pdf",
            "storage_key": "invoices/sample-accounting/2026/05/audit.pdf",
        }

        with patch("src.graph.nodes.ocr.Mistral") as MockMistral:
            mock_response = MagicMock()
            mock_response.pages = [MagicMock(markdown=ocr_text)]
            mock_instance = MagicMock()
            mock_instance.ocr.process.return_value = mock_response
            MockMistral.return_value = mock_instance

            result = await ocr_node(state)

        entry = result["audit_log"][0]
        assert entry["char_count"] == len(ocr_text)

    # ─── Image MIME tests (SM2) ───────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_image_jpeg_data_url_prefix(self):
        """ocr_node must build data URL with image/jpeg MIME for JPEG images."""
        state: InvoiceState = {
            "document_bytes": b"\xff\xd8\xff fake jpeg",
            "mime_type": "image/jpeg",
            "storage_key": "invoices/sample-accounting/2026/05/invoice.jpg",
        }

        with patch("src.graph.nodes.ocr.Mistral") as MockMistral:
            mock_response = MagicMock()
            mock_response.pages = [MagicMock(markdown="invoice text")]
            mock_instance = MagicMock()
            mock_instance.ocr.process.return_value = mock_response
            MockMistral.return_value = mock_instance

            await ocr_node(state)

        call_kwargs = mock_instance.ocr.process.call_args
        assert call_kwargs is not None
        kwargs = call_kwargs.kwargs if call_kwargs.kwargs else {}
        document_arg = kwargs.get("document", {})
        data_url = document_arg.get("document_url", "")
        assert data_url.startswith("data:image/jpeg;base64,"), (
            f"Expected data URL starting with 'data:image/jpeg;base64,', got: {data_url[:50]!r}"
        )

    @pytest.mark.asyncio
    async def test_image_png_data_url_prefix(self):
        """ocr_node must build data URL with image/png MIME for PNG images."""
        state: InvoiceState = {
            "document_bytes": b"\x89PNG fake png",
            "mime_type": "image/png",
            "storage_key": "invoices/sample-accounting/2026/05/invoice.png",
        }

        with patch("src.graph.nodes.ocr.Mistral") as MockMistral:
            mock_response = MagicMock()
            mock_response.pages = [MagicMock(markdown="png invoice text")]
            mock_instance = MagicMock()
            mock_instance.ocr.process.return_value = mock_response
            MockMistral.return_value = mock_instance

            await ocr_node(state)

        call_kwargs = mock_instance.ocr.process.call_args
        kwargs = call_kwargs.kwargs if call_kwargs.kwargs else {}
        document_arg = kwargs.get("document", {})
        data_url = document_arg.get("document_url", "")
        assert data_url.startswith("data:image/png;base64,"), (
            f"Expected PNG data URL prefix, got: {data_url[:50]!r}"
        )

    @pytest.mark.asyncio
    async def test_pdf_data_url_prefix(self):
        """ocr_node must build data URL with application/pdf MIME for PDFs."""
        state: InvoiceState = {
            "document_bytes": b"%PDF-1.4 real pdf",
            "mime_type": "application/pdf",
            "storage_key": "invoices/sample-accounting/2026/05/invoice.pdf",
        }

        with patch("src.graph.nodes.ocr.Mistral") as MockMistral:
            mock_response = MagicMock()
            mock_response.pages = [MagicMock(markdown="pdf text")]
            mock_instance = MagicMock()
            mock_instance.ocr.process.return_value = mock_response
            MockMistral.return_value = mock_instance

            await ocr_node(state)

        call_kwargs = mock_instance.ocr.process.call_args
        kwargs = call_kwargs.kwargs if call_kwargs.kwargs else {}
        document_arg = kwargs.get("document", {})
        data_url = document_arg.get("document_url", "")
        assert data_url.startswith("data:application/pdf;base64,"), (
            f"Expected PDF data URL prefix, got: {data_url[:60]!r}"
        )
