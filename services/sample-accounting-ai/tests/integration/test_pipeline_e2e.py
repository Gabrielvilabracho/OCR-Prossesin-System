"""E4 end-to-end integration tests — full pipeline with all externals mocked.

Updated for sample-multiformat: covers PDF regression (SM1), image OCR (SM2),
and XML bypass (SM3) alongside existing error/math paths.

All external I/O is mocked:
  - Supabase Storage (fetch_document)
  - Mistral OCR (ocr node)
  - Mistral LLM (extract node)
  - Supabase DB (persist node)

Tests verify the complete state after running all nodes.
"""

import json
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from src.graph.invoice_graph import build_invoice_graph
from src.graph.state import InvoiceState
from src.models.document import DocumentFormat


# ─── Shared mock builders ─────────────────────────────────────────────────────

def _make_ocr_mock(ocr_text: str) -> MagicMock:
    mock_resp = MagicMock()
    mock_resp.pages = [MagicMock(markdown=ocr_text)]
    mock_client = MagicMock()
    mock_client.ocr.process.return_value = mock_resp
    return mock_client


def _make_extract_mock(fields: dict) -> MagicMock:  # type: ignore[type-arg]
    content = json.dumps(fields)
    mock_resp = MagicMock()
    mock_resp.choices = [MagicMock(message=MagicMock(content=content))]
    mock_client = MagicMock()
    mock_client.chat.complete.return_value = mock_resp
    return mock_client


def _make_supabase_storage_mock(doc_bytes: bytes) -> MagicMock:
    mock_storage = MagicMock()
    mock_storage.from_.return_value.download.return_value = doc_bytes
    mock_client = MagicMock()
    mock_client.storage = mock_storage
    return mock_client


def _make_supabase_db_mock() -> MagicMock:
    mock_eq = MagicMock()
    mock_eq.execute.return_value = MagicMock(data=[{"id": "test-id"}])
    mock_update = MagicMock()
    mock_update.eq.return_value = mock_eq
    mock_table = MagicMock()
    mock_table.update.return_value = mock_update
    mock_client = MagicMock()
    mock_client.table.return_value = mock_table
    return mock_client


_HAPPY_FIELDS = {
    "supplier_name": "TechSolutions Lda",
    "supplier_nif": "500123456",
    "invoice_number": "FT 2026/001",
    "invoice_date": "2026-05-01",
    "subtotal": "1000.00",
    "vat_amount": "230.00",
    "total": "1230.00",
    "vat_rate": 23,
    "currency": "EUR",
}

_MATH_ERROR_FIELDS = {**_HAPPY_FIELDS, "total": "9999.00"}  # wrong total


def _base_pdf_state() -> InvoiceState:
    return {
        "storage_key": "invoices/sample-accounting/2026/05/test.pdf",
        "client_id": "sample-client-001",
        "dry_run": False,
        "invoice_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "document_format": DocumentFormat.PDF,
        "mime_type": "application/pdf",
        "errors": [],
        "audit_log": [],
    }


class TestPipelineE2E:
    """End-to-end pipeline tests with fully mocked externals."""

    # ─── PDF regression (SM1) ────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_happy_path_status_success(self):
        """Full PDF pipeline with valid invoice → status='success'."""
        graph = build_invoice_graph()

        with (
            patch("src.graph.nodes.fetch_document.get_supabase_client",
                  return_value=_make_supabase_storage_mock(b"%PDF-1.4")),
            patch("src.graph.nodes.persist.get_supabase_client",
                  return_value=_make_supabase_db_mock()),
            patch("src.graph.nodes.ocr.Mistral",
                  return_value=_make_ocr_mock("FATURA TechSolutions 1000")),
            patch("src.graph.nodes.extract_agents._llm.Mistral",
                  return_value=_make_extract_mock(_HAPPY_FIELDS)),
        ):
            result = await graph.ainvoke(_base_pdf_state())

        assert result["status"] == "success"

    @pytest.mark.asyncio
    async def test_happy_path_document_bytes_populated(self):
        """After fetch_document (PDF), document_bytes must be in state."""
        graph = build_invoice_graph()
        fake_pdf = b"%PDF-1.4 real content"

        with (
            patch("src.graph.nodes.fetch_document.get_supabase_client",
                  return_value=_make_supabase_storage_mock(fake_pdf)),
            patch("src.graph.nodes.persist.get_supabase_client",
                  return_value=_make_supabase_db_mock()),
            patch("src.graph.nodes.ocr.Mistral",
                  return_value=_make_ocr_mock("some text")),
            patch("src.graph.nodes.extract_agents._llm.Mistral",
                  return_value=_make_extract_mock(_HAPPY_FIELDS)),
        ):
            result = await graph.ainvoke(_base_pdf_state())

        assert result.get("document_bytes") == fake_pdf

    @pytest.mark.asyncio
    async def test_happy_path_extracted_fields_populated(self):
        """After extract node, extracted_fields must contain all invoice fields."""
        graph = build_invoice_graph()

        with (
            patch("src.graph.nodes.fetch_document.get_supabase_client",
                  return_value=_make_supabase_storage_mock(b"%PDF")),
            patch("src.graph.nodes.persist.get_supabase_client",
                  return_value=_make_supabase_db_mock()),
            patch("src.graph.nodes.ocr.Mistral",
                  return_value=_make_ocr_mock("FATURA 1000")),
            patch("src.graph.nodes.extract_agents._llm.Mistral",
                  return_value=_make_extract_mock(_HAPPY_FIELDS)),
        ):
            result = await graph.ainvoke(_base_pdf_state())

        fields = result.get("extracted_fields", {})
        assert fields.get("supplier_name") == "TechSolutions Lda"
        assert fields.get("vat_rate") == 23

    @pytest.mark.asyncio
    async def test_happy_path_math_valid_true(self):
        """Valid invoice with correct math → math_valid=True."""
        graph = build_invoice_graph()

        with (
            patch("src.graph.nodes.fetch_document.get_supabase_client",
                  return_value=_make_supabase_storage_mock(b"%PDF")),
            patch("src.graph.nodes.persist.get_supabase_client",
                  return_value=_make_supabase_db_mock()),
            patch("src.graph.nodes.ocr.Mistral",
                  return_value=_make_ocr_mock("text")),
            patch("src.graph.nodes.extract_agents._llm.Mistral",
                  return_value=_make_extract_mock(_HAPPY_FIELDS)),
        ):
            result = await graph.ainvoke(_base_pdf_state())

        assert result.get("math_valid") is True

    @pytest.mark.asyncio
    async def test_math_error_path_status_failed(self):
        """Invoice with wrong math → validate_node adds error → persist sets status='failed'."""
        graph = build_invoice_graph()

        state = {**_base_pdf_state(), "storage_key": "invoices/sample-accounting/2026/05/bad-math.pdf"}

        with (
            patch("src.graph.nodes.fetch_document.get_supabase_client",
                  return_value=_make_supabase_storage_mock(b"%PDF")),
            patch("src.graph.nodes.persist.get_supabase_client",
                  return_value=_make_supabase_db_mock()),
            patch("src.graph.nodes.ocr.Mistral",
                  return_value=_make_ocr_mock("text")),
            patch("src.graph.nodes.extract_agents._llm.Mistral",
                  return_value=_make_extract_mock(_MATH_ERROR_FIELDS)),
        ):
            result = await graph.ainvoke(state)

        assert result.get("math_valid") is False
        assert result.get("status") == "failed"

    @pytest.mark.asyncio
    async def test_math_error_path_errors_populated(self):
        """Math error must appear in the state errors accumulator."""
        graph = build_invoice_graph()

        state = {**_base_pdf_state(), "storage_key": "invoices/sample-accounting/2026/05/bad-math.pdf"}

        with (
            patch("src.graph.nodes.fetch_document.get_supabase_client",
                  return_value=_make_supabase_storage_mock(b"%PDF")),
            patch("src.graph.nodes.persist.get_supabase_client",
                  return_value=_make_supabase_db_mock()),
            patch("src.graph.nodes.ocr.Mistral",
                  return_value=_make_ocr_mock("text")),
            patch("src.graph.nodes.extract_agents._llm.Mistral",
                  return_value=_make_extract_mock(_MATH_ERROR_FIELDS)),
        ):
            result = await graph.ainvoke(state)

        errors = result.get("errors", [])
        assert len(errors) > 0
        assert any("Math" in e or "math" in e for e in errors)

    @pytest.mark.asyncio
    async def test_audit_log_has_entries_from_pipeline_nodes(self):
        """State must have audit_log entries from pipeline nodes."""
        graph = build_invoice_graph()

        with (
            patch("src.graph.nodes.fetch_document.get_supabase_client",
                  return_value=_make_supabase_storage_mock(b"%PDF")),
            patch("src.graph.nodes.persist.get_supabase_client",
                  return_value=_make_supabase_db_mock()),
            patch("src.graph.nodes.ocr.Mistral",
                  return_value=_make_ocr_mock("text")),
            patch("src.graph.nodes.extract_agents._llm.Mistral",
                  return_value=_make_extract_mock(_HAPPY_FIELDS)),
        ):
            result = await graph.ainvoke(_base_pdf_state())

        audit = result.get("audit_log", [])
        node_names = {entry.get("node") for entry in audit}
        # fetch_document replaces fetch_pdf in the audit trail
        expected = {"fetch_document", "ocr", "extract", "validate", "persist"}
        assert expected <= node_names, f"Missing audit entries for nodes: {expected - node_names}"

    @pytest.mark.asyncio
    async def test_dry_run_path_status_dry_run(self):
        """dry_run=True must produce status='dry_run' without writing to DB."""
        graph = build_invoice_graph()

        state = {**_base_pdf_state(), "dry_run": True}

        with (
            patch("src.graph.nodes.fetch_document.get_supabase_client",
                  return_value=_make_supabase_storage_mock(b"%PDF")),
            patch("src.graph.nodes.persist.get_supabase_client") as mock_supa_db,
            patch("src.graph.nodes.ocr.Mistral",
                  return_value=_make_ocr_mock("text")),
            patch("src.graph.nodes.extract_agents._llm.Mistral",
                  return_value=_make_extract_mock(_HAPPY_FIELDS)),
        ):
            result = await graph.ainvoke(state)

        assert result["status"] == "dry_run"
        mock_supa_db.assert_not_called()

    @pytest.mark.asyncio
    async def test_ocr_failure_propagates_to_failed_status(self):
        """If OCR raises, errors accumulate and final status is failed."""
        graph = build_invoice_graph()

        with (
            patch("src.graph.nodes.fetch_document.get_supabase_client",
                  return_value=_make_supabase_storage_mock(b"%PDF")),
            patch("src.graph.nodes.persist.get_supabase_client",
                  return_value=_make_supabase_db_mock()),
            patch("src.graph.nodes.ocr.Mistral") as MockOcr,
            patch("src.graph.nodes.extract_agents._llm.Mistral",
                  return_value=_make_extract_mock(_HAPPY_FIELDS)),
        ):
            MockOcr.return_value.ocr.process.side_effect = RuntimeError("OCR API down")

            result = await graph.ainvoke(_base_pdf_state())

        assert result.get("status") == "failed"
        errors = result.get("errors", [])
        assert len(errors) > 0

    # ─── Image OCR path (SM2) ────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_image_jpeg_path_status_success(self):
        """Full JPEG pipeline with valid invoice → status='success' (SM2)."""
        graph = build_invoice_graph()

        fake_jpeg = b"\xff\xd8\xff fake jpeg bytes"
        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/invoice.jpg",
            "client_id": "sample-client-001",
            "dry_run": False,
            "invoice_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            "document_format": DocumentFormat.IMAGE,
            "mime_type": "image/jpeg",
            "errors": [],
            "audit_log": [],
        }

        with (
            patch("src.graph.nodes.fetch_document.get_supabase_client",
                  return_value=_make_supabase_storage_mock(fake_jpeg)),
            patch("src.graph.nodes.persist.get_supabase_client",
                  return_value=_make_supabase_db_mock()),
            patch("src.graph.nodes.ocr.Mistral",
                  return_value=_make_ocr_mock("FATURA JPEG invoice text")),
            patch("src.graph.nodes.extract_agents._llm.Mistral",
                  return_value=_make_extract_mock(_HAPPY_FIELDS)),
        ):
            result = await graph.ainvoke(state)

        assert result["status"] == "success"
        assert result.get("raw_ocr_text") == "FATURA JPEG invoice text"

    @pytest.mark.asyncio
    async def test_image_ocr_uses_jpeg_mime_in_data_url(self):
        """For JPEG images, OCR must receive a data URL with image/jpeg MIME (SM2)."""
        graph = build_invoice_graph()

        fake_jpeg = b"\xff\xd8\xff fake jpeg"
        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/invoice.jpg",
            "client_id": "sample-client-001",
            "dry_run": True,
            "invoice_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            "document_format": DocumentFormat.IMAGE,
            "mime_type": "image/jpeg",
            "errors": [],
            "audit_log": [],
        }

        with (
            patch("src.graph.nodes.fetch_document.get_supabase_client",
                  return_value=_make_supabase_storage_mock(fake_jpeg)),
            patch("src.graph.nodes.ocr.Mistral") as MockOcr,
            patch("src.graph.nodes.extract_agents._llm.Mistral") as MockExtract,
        ):
            mock_ocr_resp = MagicMock()
            mock_ocr_resp.pages = [MagicMock(markdown="jpeg text")]
            MockOcr.return_value.ocr.process.return_value = mock_ocr_resp

            mock_extract_resp = MagicMock()
            mock_extract_resp.choices = [MagicMock(message=MagicMock(content=json.dumps({
                "supplier_name": None, "supplier_nif": None, "receiver_nif": None,
                "invoice_number": None, "invoice_series": None, "invoice_date": None,
            })))]
            MockExtract.return_value.chat.complete.return_value = mock_extract_resp

            await graph.ainvoke(state)

        call_kwargs = MockOcr.return_value.ocr.process.call_args
        assert call_kwargs is not None
        kwargs = call_kwargs.kwargs if call_kwargs.kwargs else {}
        document_arg = kwargs.get("document", {})
        data_url = document_arg.get("document_url", "")
        assert data_url.startswith("data:image/jpeg;base64,"), (
            f"Expected image/jpeg data URL, got: {data_url[:60]!r}"
        )

    @pytest.mark.asyncio
    async def test_image_png_path_produces_raw_ocr_text(self):
        """PNG image pipeline must produce raw_ocr_text via OCR (SM2)."""
        graph = build_invoice_graph()

        fake_png = b"\x89PNG fake png"
        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/invoice.png",
            "client_id": "sample-client-001",
            "dry_run": True,
            "invoice_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            "document_format": DocumentFormat.IMAGE,
            "mime_type": "image/png",
            "errors": [],
            "audit_log": [],
        }

        with (
            patch("src.graph.nodes.fetch_document.get_supabase_client",
                  return_value=_make_supabase_storage_mock(fake_png)),
            patch("src.graph.nodes.ocr.Mistral",
                  return_value=_make_ocr_mock("PNG invoice OCR text")),
            patch("src.graph.nodes.extract_agents._llm.Mistral") as MockExtract,
        ):
            mock_extract_resp = MagicMock()
            mock_extract_resp.choices = [MagicMock(message=MagicMock(content=json.dumps({
                "supplier_name": None, "supplier_nif": None, "receiver_nif": None,
                "invoice_number": None, "invoice_series": None, "invoice_date": None,
            })))]
            MockExtract.return_value.chat.complete.return_value = mock_extract_resp

            result = await graph.ainvoke(state)

        assert result.get("raw_ocr_text") == "PNG invoice OCR text"

    # ─── XML bypass path (SM3) ────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_xml_path_bypasses_ocr(self):
        """XML invoice must bypass OCR — Mistral OCR must NOT be called (SM3)."""
        graph = build_invoice_graph()

        xml_bytes = b"""<?xml version="1.0"?>
<Invoice>
    <Supplier>TechSolutions Lda</Supplier>
    <Total>1230.00</Total>
</Invoice>"""

        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/invoice.xml",
            "client_id": "sample-client-001",
            "dry_run": True,
            "invoice_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            "document_format": DocumentFormat.XML,
            "mime_type": "application/xml",
            "errors": [],
            "audit_log": [],
        }

        with (
            patch("src.graph.nodes.fetch_document.get_supabase_client",
                  return_value=_make_supabase_storage_mock(xml_bytes)),
            patch("src.graph.nodes.ocr.Mistral") as MockOcr,
            patch("src.graph.nodes.extract_agents._llm.Mistral") as MockExtract,
        ):
            mock_extract_resp = MagicMock()
            mock_extract_resp.choices = [MagicMock(message=MagicMock(content=json.dumps({
                "supplier_name": None, "supplier_nif": None, "receiver_nif": None,
                "invoice_number": None, "invoice_series": None, "invoice_date": None,
            })))]
            MockExtract.return_value.chat.complete.return_value = mock_extract_resp

            result = await graph.ainvoke(state)

        # Mistral OCR must never have been instantiated for XML path
        MockOcr.assert_not_called()

    @pytest.mark.asyncio
    async def test_xml_path_produces_nonempty_raw_ocr_text(self):
        """XML pipeline must produce non-empty raw_ocr_text from XML content (SM3)."""
        graph = build_invoice_graph()

        xml_bytes = b"""<?xml version="1.0"?>
<Invoice>
    <Supplier>TechSolutions Lda</Supplier>
    <Amount>1230.00</Amount>
</Invoice>"""

        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/invoice.xml",
            "client_id": "sample-client-001",
            "dry_run": True,
            "invoice_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            "document_format": DocumentFormat.XML,
            "mime_type": "application/xml",
            "errors": [],
            "audit_log": [],
        }

        with (
            patch("src.graph.nodes.fetch_document.get_supabase_client",
                  return_value=_make_supabase_storage_mock(xml_bytes)),
            patch("src.graph.nodes.ocr.Mistral"),
            patch("src.graph.nodes.extract_agents._llm.Mistral") as MockExtract,
        ):
            mock_extract_resp = MagicMock()
            mock_extract_resp.choices = [MagicMock(message=MagicMock(content=json.dumps({
                "supplier_name": None, "supplier_nif": None, "receiver_nif": None,
                "invoice_number": None, "invoice_series": None, "invoice_date": None,
            })))]
            MockExtract.return_value.chat.complete.return_value = mock_extract_resp

            result = await graph.ainvoke(state)

        raw_text = result.get("raw_ocr_text", "")
        assert len(raw_text) > 0
        assert "TechSolutions Lda" in raw_text

    @pytest.mark.asyncio
    async def test_xml_path_extract_receives_raw_ocr_text(self):
        """XML pipeline → extract receives non-empty raw_ocr_text contract (SM5)."""
        graph = build_invoice_graph()

        xml_bytes = b"<Invoice><Supplier>ACME Lda</Supplier><Total>500.00</Total></Invoice>"

        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/acme.xml",
            "client_id": "sample-client-001",
            "dry_run": True,
            "invoice_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
            "document_format": DocumentFormat.XML,
            "mime_type": "application/xml",
            "errors": [],
            "audit_log": [],
        }

        with (
            patch("src.graph.nodes.fetch_document.get_supabase_client",
                  return_value=_make_supabase_storage_mock(xml_bytes)),
            patch("src.graph.nodes.ocr.Mistral"),
            patch("src.graph.nodes.extract_agents._llm.Mistral",
                  return_value=_make_extract_mock({
                      "supplier_name": None, "supplier_nif": None, "receiver_nif": None,
                      "invoice_number": None, "invoice_series": None, "invoice_date": None,
                  })),
        ):
            result = await graph.ainvoke(state)

        # The result's raw_ocr_text must be the XML-derived text (non-empty)
        raw_text = result.get("raw_ocr_text", "")
        assert len(raw_text) > 0, "extract must receive non-empty raw_ocr_text from XML"
        assert "ACME Lda" in raw_text
