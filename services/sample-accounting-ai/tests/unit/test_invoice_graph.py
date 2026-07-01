"""Tests for the invoice_graph builder — LangGraph StateGraph compilation.

Updated for sample-multiformat: verifies conditional routing (fetch_document →
parse_xml|ocr), and that XML never visits ocr and PDF/image never visits parse_xml.
"""

import json
from unittest.mock import MagicMock, patch

import pytest


class TestBuildInvoiceGraph:
    """Tests for build_invoice_graph() function."""

    def test_graph_compiles_without_error(self):
        """build_invoice_graph() must return a compiled graph without raising."""
        from src.graph.invoice_graph import build_invoice_graph
        graph = build_invoice_graph()
        assert graph is not None

    def test_compiled_graph_has_invoke_method(self):
        """Compiled graph must have ainvoke (LangGraph compiled graph interface)."""
        from src.graph.invoice_graph import build_invoice_graph
        graph = build_invoice_graph()
        assert hasattr(graph, "ainvoke"), "Compiled graph must expose ainvoke"

    def test_compiled_graph_has_all_nodes(self):
        """Compiled graph must contain all pipeline nodes including parse_xml."""
        from src.graph.invoice_graph import build_invoice_graph
        graph = build_invoice_graph()
        node_names = set(graph.nodes.keys())
        expected_nodes = {"fetch_document", "parse_xml", "ocr", "extract", "validate", "persist"}
        assert expected_nodes <= node_names, (
            f"Missing nodes: {expected_nodes - node_names}. Got: {node_names}"
        )

    def test_no_fetch_pdf_node(self):
        """Graph must NOT have a fetch_pdf node (replaced by fetch_document)."""
        from src.graph.invoice_graph import build_invoice_graph
        graph = build_invoice_graph()
        assert "fetch_pdf" not in graph.nodes

    # ─── Conditional routing tests ────────────────────────────────────────────

    def test_route_after_fetch_xml_returns_parse_xml(self):
        """route_after_fetch must return 'parse_xml' for XML document_format."""
        from src.graph.invoice_graph import route_after_fetch
        from src.models.document import DocumentFormat

        state = {
            "document_format": DocumentFormat.XML,
            "document_bytes": b"<x/>",
            "errors": [],
        }
        assert route_after_fetch(state) == "parse_xml"  # type: ignore[arg-type]

    def test_route_after_fetch_pdf_returns_ocr(self):
        """route_after_fetch must return 'ocr' for PDF document_format."""
        from src.graph.invoice_graph import route_after_fetch
        from src.models.document import DocumentFormat

        state = {
            "document_format": DocumentFormat.PDF,
            "document_bytes": b"%PDF",
            "errors": [],
        }
        assert route_after_fetch(state) == "ocr"  # type: ignore[arg-type]

    def test_route_after_fetch_image_returns_ocr(self):
        """route_after_fetch must return 'ocr' for IMAGE document_format."""
        from src.graph.invoice_graph import route_after_fetch
        from src.models.document import DocumentFormat

        state = {
            "document_format": DocumentFormat.IMAGE,
            "document_bytes": b"\xff\xd8",
            "errors": [],
        }
        assert route_after_fetch(state) == "ocr"  # type: ignore[arg-type]

    def test_route_after_fetch_with_errors_returns_extract(self):
        """route_after_fetch must short-circuit to 'extract' when errors present."""
        from src.graph.invoice_graph import route_after_fetch
        from src.models.document import DocumentFormat

        state = {
            "document_format": DocumentFormat.PDF,
            "errors": ["fetch_document: Supabase Storage download failed"],
        }
        assert route_after_fetch(state) == "extract"  # type: ignore[arg-type]

    # ─── End-to-end routing: XML never visits ocr ────────────────────────────

    @pytest.mark.asyncio
    async def test_xml_path_never_calls_ocr(self):
        """XML document_format must route to parse_xml and NOT call Mistral OCR."""
        from src.graph.invoice_graph import build_invoice_graph
        from src.graph.state import InvoiceState
        from src.models.document import DocumentFormat

        graph = build_invoice_graph()

        xml_bytes = b"<Invoice><Total>1230.00</Total></Invoice>"

        with (
            patch("src.graph.nodes.fetch_document.get_supabase_client") as mock_supa,
            patch("src.graph.nodes.persist.get_supabase_client") as mock_supa_db,
            patch("src.graph.nodes.ocr.Mistral") as MockOcr,
            patch("src.graph.nodes.extract_agents._llm.Mistral") as MockExtract,
        ):
            # fetch_document returns XML bytes
            mock_supa.return_value.storage.from_.return_value.download.return_value = xml_bytes

            # persist mock
            mock_eq = MagicMock()
            mock_eq.execute.return_value = MagicMock(data=[{"id": "test-id"}])
            mock_supa_db.return_value.table.return_value.update.return_value.eq.return_value = mock_eq

            # extract mock — minimal valid response
            mock_extract_resp = MagicMock()
            mock_extract_resp.choices = [MagicMock(message=MagicMock(content=json.dumps({
                "supplier_name": None, "supplier_nif": None, "receiver_nif": None,
                "invoice_number": None, "invoice_series": None, "invoice_date": None,
            })))]
            MockExtract.return_value.chat.complete.return_value = mock_extract_resp

            initial_state: InvoiceState = {
                "storage_key": "invoices/sample-accounting/2026/05/test.xml",
                "client_id": "sample-client-001",
                "dry_run": True,
                "invoice_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "document_format": DocumentFormat.XML,
                "mime_type": "application/xml",
                "errors": [],
                "audit_log": [],
            }

            result = await graph.ainvoke(initial_state)

        # OCR must NOT have been called for XML path
        MockOcr.assert_not_called()
        # But result should exist
        assert result is not None

    @pytest.mark.asyncio
    async def test_pdf_path_never_calls_parse_xml(self):
        """PDF document_format must route to OCR and NOT call parse_xml."""
        from src.graph.invoice_graph import build_invoice_graph
        from src.graph.state import InvoiceState
        from src.models.document import DocumentFormat

        graph = build_invoice_graph()

        with (
            patch("src.graph.nodes.fetch_document.get_supabase_client") as mock_supa,
            patch("src.graph.nodes.persist.get_supabase_client") as mock_supa_db,
            patch("src.graph.nodes.ocr.Mistral") as MockOcr,
            patch("src.graph.nodes.parse_xml.ET") as MockET,
            patch("src.graph.nodes.extract_agents._llm.Mistral") as MockExtract,
        ):
            # fetch_document returns PDF bytes
            mock_supa.return_value.storage.from_.return_value.download.return_value = b"%PDF-1.4"

            # persist mock
            mock_eq = MagicMock()
            mock_eq.execute.return_value = MagicMock(data=[{"id": "test-id"}])
            mock_supa_db.return_value.table.return_value.update.return_value.eq.return_value = mock_eq

            # ocr mock
            mock_ocr_resp = MagicMock()
            mock_ocr_resp.pages = [MagicMock(markdown="FATURA text")]
            MockOcr.return_value.ocr.process.return_value = mock_ocr_resp

            # extract mock
            mock_extract_resp = MagicMock()
            mock_extract_resp.choices = [MagicMock(message=MagicMock(content=json.dumps({
                "supplier_name": None, "supplier_nif": None, "receiver_nif": None,
                "invoice_number": None, "invoice_series": None, "invoice_date": None,
            })))]
            MockExtract.return_value.chat.complete.return_value = mock_extract_resp

            initial_state: InvoiceState = {
                "storage_key": "invoices/sample-accounting/2026/05/test.pdf",
                "client_id": "sample-client-001",
                "dry_run": True,
                "invoice_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "document_format": DocumentFormat.PDF,
                "mime_type": "application/pdf",
                "errors": [],
                "audit_log": [],
            }

            result = await graph.ainvoke(initial_state)

        # parse_xml's ET must NOT have been called for PDF path
        MockET.fromstring.assert_not_called()
        assert result is not None

    @pytest.mark.asyncio
    async def test_graph_executes_dry_run_with_mocked_nodes(self):
        """Graph must execute end-to-end when all external calls are mocked (PDF path)."""
        from src.graph.invoice_graph import build_invoice_graph
        from src.graph.state import InvoiceState
        from src.models.document import DocumentFormat

        graph = build_invoice_graph()

        import json

        header_json = json.dumps({
            "supplier_name": "TechSolutions Lda",
            "supplier_nif": None,
            "receiver_nif": None,
            "invoice_number": None,
            "invoice_series": None,
            "invoice_date": None,
        })
        lineas_json = json.dumps({"line_items": []})
        totales_json = json.dumps({
            "subtotal": "1000.00",
            "vat_amount": "230.00",
            "total": "1230.00",
            "discount": None,
            "currency": "EUR",
            "vat_rate": 23,
        })
        call_count = {"n": 0}
        responses_cycle = [header_json, lineas_json, totales_json]

        def make_extract_resp(content: str) -> MagicMock:
            resp = MagicMock()
            resp.choices = [MagicMock(message=MagicMock(content=content))]
            return resp

        with (
            patch("src.graph.nodes.fetch_document.get_supabase_client") as mock_supa_fetch,
            patch("src.graph.nodes.persist.get_supabase_client") as mock_supa_persist,
            patch("src.graph.nodes.ocr.Mistral") as MockOcr,
            patch("src.graph.nodes.extract_agents._llm.Mistral") as MockExtract,
        ):
            # fetch_document mock
            mock_storage = MagicMock()
            mock_storage.from_.return_value.download.return_value = b"%PDF-1.4 test"
            mock_supa_fetch.return_value.storage = mock_storage

            # ocr mock
            mock_ocr_resp = MagicMock()
            mock_ocr_resp.pages = [MagicMock(markdown="FATURA TechSolutions Lda 1000 EUR")]
            MockOcr.return_value.ocr.process.return_value = mock_ocr_resp

            # extract mock — cycles through header/lineas/totales responses
            def side_effect(**kwargs):  # type: ignore[no-untyped-def]
                idx = call_count["n"] % 3
                call_count["n"] += 1
                return make_extract_resp(responses_cycle[idx])

            MockExtract.return_value.chat.complete.side_effect = side_effect

            initial_state: InvoiceState = {
                "storage_key": "invoices/sample-accounting/2026/05/test.pdf",
                "client_id": "sample-client-001",
                "dry_run": True,
                "invoice_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "document_format": DocumentFormat.PDF,
                "mime_type": "application/pdf",
                "errors": [],
                "audit_log": [],
            }

            result = await graph.ainvoke(initial_state)

        assert result is not None
        assert result.get("status") in {"dry_run", "success", "failed"}

    @pytest.mark.asyncio
    async def test_graph_populates_raw_ocr_text(self):
        """After graph run with PDF, raw_ocr_text must be populated."""
        from src.graph.invoice_graph import build_invoice_graph
        from src.graph.state import InvoiceState
        from src.models.document import DocumentFormat

        graph = build_invoice_graph()

        import json

        call_count2 = {"n": 0}
        simple_responses = [
            json.dumps({"supplier_name": None, "supplier_nif": None, "receiver_nif": None,
                        "invoice_number": None, "invoice_series": None, "invoice_date": None}),
            json.dumps({"line_items": []}),
            json.dumps({"subtotal": None, "vat_amount": None, "total": None,
                        "discount": None, "currency": "EUR", "vat_rate": None}),
        ]

        def make_simple_resp(content: str) -> MagicMock:
            r = MagicMock()
            r.choices = [MagicMock(message=MagicMock(content=content))]
            return r

        with (
            patch("src.graph.nodes.fetch_document.get_supabase_client") as mock_supa,
            patch("src.graph.nodes.ocr.Mistral") as MockOcr,
            patch("src.graph.nodes.extract_agents._llm.Mistral") as MockExtract,
        ):
            mock_supa.return_value.storage.from_.return_value.download.return_value = b"%PDF"
            mock_ocr_resp = MagicMock()
            mock_ocr_resp.pages = [MagicMock(markdown="OCR TEXT HERE")]
            MockOcr.return_value.ocr.process.return_value = mock_ocr_resp

            def side_effect2(**kwargs):  # type: ignore[no-untyped-def]
                idx = call_count2["n"] % 3
                call_count2["n"] += 1
                return make_simple_resp(simple_responses[idx])

            MockExtract.return_value.chat.complete.side_effect = side_effect2

            result = await graph.ainvoke({
                "storage_key": "invoices/sample-accounting/2026/05/test.pdf",
                "client_id": "sample-client-001",
                "dry_run": True,
                "invoice_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "document_format": DocumentFormat.PDF,
                "mime_type": "application/pdf",
                "errors": [],
                "audit_log": [],
            })

        assert result.get("raw_ocr_text") == "OCR TEXT HERE"
