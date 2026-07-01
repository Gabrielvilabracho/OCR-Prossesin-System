"""Tests for the parse_xml node — XML invoice parsing.

TDD RED phase — tests describe expected behavior before implementation.
Covers XML bypass (SM3) and malformed XML error handling (SM6).
"""

import pytest

from src.graph.nodes.parse_xml import parse_xml_node
from src.graph.state import InvoiceState
from src.models.document import DocumentFormat


class TestParseXmlNode:
    """Unit tests for parse_xml_node — stdlib ElementTree parsing."""

    # ─── Happy path — valid XML (SM3) ────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_valid_xml_produces_nonempty_raw_ocr_text(self):
        """Valid XML document must produce non-empty raw_ocr_text."""
        xml_bytes = b"""<?xml version="1.0" encoding="UTF-8"?>
<Invoice>
    <Supplier>TechSolutions Lda</Supplier>
    <Total>1230.00</Total>
</Invoice>"""

        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/invoice.xml",
            "client_id": "sample-client-001",
            "document_format": DocumentFormat.XML,
            "mime_type": "application/xml",
            "document_bytes": xml_bytes,
        }

        result = await parse_xml_node(state)

        assert "raw_ocr_text" in result
        assert len(result["raw_ocr_text"]) > 0

    @pytest.mark.asyncio
    async def test_valid_xml_contains_tag_and_text_content(self):
        """Parsed XML raw_ocr_text must include tag names and their text content."""
        xml_bytes = b"""<?xml version="1.0"?>
<Invoice>
    <Supplier>TechSolutions Lda</Supplier>
    <Total>1230.00</Total>
</Invoice>"""

        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/invoice.xml",
            "client_id": "sample-client-001",
            "document_format": DocumentFormat.XML,
            "mime_type": "application/xml",
            "document_bytes": xml_bytes,
        }

        result = await parse_xml_node(state)

        text = result["raw_ocr_text"]
        assert "TechSolutions Lda" in text
        assert "1230.00" in text

    @pytest.mark.asyncio
    async def test_valid_xml_has_audit_log_entry(self):
        """parse_xml_node must produce an audit_log entry on success."""
        xml_bytes = b"<root><item>value</item></root>"

        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/simple.xml",
            "client_id": "sample-client-001",
            "document_format": DocumentFormat.XML,
            "mime_type": "application/xml",
            "document_bytes": xml_bytes,
        }

        result = await parse_xml_node(state)

        assert "audit_log" in result
        assert len(result["audit_log"]) >= 1
        entry = result["audit_log"][0]
        assert entry["node"] == "parse_xml"
        assert entry["status"] == "success"

    @pytest.mark.asyncio
    async def test_valid_xml_produces_no_errors(self):
        """parse_xml_node with valid XML must not add any errors."""
        xml_bytes = b"<Invoice><Supplier>Test</Supplier></Invoice>"

        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/ok.xml",
            "client_id": "sample-client-001",
            "document_format": DocumentFormat.XML,
            "mime_type": "application/xml",
            "document_bytes": xml_bytes,
        }

        result = await parse_xml_node(state)

        assert result.get("errors", []) == [] or "errors" not in result

    @pytest.mark.asyncio
    async def test_namespaced_xml_includes_tag_text(self):
        """Namespaced XML (SAF-T PT style) must include element text in raw_ocr_text."""
        xml_bytes = b"""<?xml version="1.0" encoding="UTF-8"?>
<n2:AuditFile xmlns:n2="urn:OECD:StandardAuditFile-Tax:PT_2.04">
    <n2:Header>
        <n2:CompanyName>Empresa SA</n2:CompanyName>
        <n2:TaxRegistrationNumber>500123456</n2:TaxRegistrationNumber>
    </n2:Header>
</n2:AuditFile>"""

        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/saft.xml",
            "client_id": "sample-client-001",
            "document_format": DocumentFormat.XML,
            "mime_type": "application/xml",
            "document_bytes": xml_bytes,
        }

        result = await parse_xml_node(state)

        text = result["raw_ocr_text"]
        assert "Empresa SA" in text
        assert "500123456" in text

    # ─── Error path — malformed XML (SM6) ────────────────────────────────────

    @pytest.mark.asyncio
    async def test_malformed_xml_adds_error(self):
        """Malformed XML must add an error to the errors list."""
        bad_xml = b"<Invoice><Broken>"  # unclosed tag

        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/bad.xml",
            "client_id": "sample-client-001",
            "document_format": DocumentFormat.XML,
            "mime_type": "application/xml",
            "document_bytes": bad_xml,
        }

        result = await parse_xml_node(state)

        assert "errors" in result
        assert len(result["errors"]) > 0

    @pytest.mark.asyncio
    async def test_malformed_xml_does_not_raise(self):
        """Malformed XML must NOT raise an exception — errors accumulated, not raised."""
        bad_xml = b"THIS IS NOT XML AT ALL <<<>>>"

        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/corrupt.xml",
            "client_id": "sample-client-001",
            "document_format": DocumentFormat.XML,
            "mime_type": "application/xml",
            "document_bytes": bad_xml,
        }

        # Must not raise
        result = await parse_xml_node(state)
        assert "errors" in result

    @pytest.mark.asyncio
    async def test_malformed_xml_has_error_audit_log(self):
        """Malformed XML must produce an audit_log error entry."""
        bad_xml = b"<root><unclosed>"

        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/bad2.xml",
            "client_id": "sample-client-001",
            "document_format": DocumentFormat.XML,
            "mime_type": "application/xml",
            "document_bytes": bad_xml,
        }

        result = await parse_xml_node(state)

        assert "audit_log" in result
        entry = result["audit_log"][0]
        assert entry["node"] == "parse_xml"
        assert entry["status"] == "error"

    @pytest.mark.asyncio
    async def test_empty_document_bytes_adds_error(self):
        """Empty document_bytes must add an error."""
        state: InvoiceState = {
            "storage_key": "invoices/sample-accounting/2026/05/empty.xml",
            "client_id": "sample-client-001",
            "document_format": DocumentFormat.XML,
            "mime_type": "application/xml",
            "document_bytes": b"",
        }

        result = await parse_xml_node(state)

        assert "errors" in result
        assert len(result["errors"]) > 0
