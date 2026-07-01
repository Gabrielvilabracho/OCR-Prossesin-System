"""Tests for DocumentFormat and detect_format — format detection module.

TDD RED phase — tests describe the expected behavior before implementation.
"""

import pytest

from src.models.document import DocumentFormat, detect_format


class TestDocumentFormat:
    """Tests for the DocumentFormat StrEnum."""

    def test_pdf_value(self):
        """DocumentFormat.PDF must have value 'pdf'."""
        assert DocumentFormat.PDF == "pdf"

    def test_image_value(self):
        """DocumentFormat.IMAGE must have value 'image'."""
        assert DocumentFormat.IMAGE == "image"

    def test_xml_value(self):
        """DocumentFormat.XML must have value 'xml'."""
        assert DocumentFormat.XML == "xml"


class TestDetectFormat:
    """Tests for detect_format(storage_key, mime_type) -> (DocumentFormat, str)."""

    # ─── Happy paths ─────────────────────────────────────────────────────────

    def test_pdf_extension_no_mime(self):
        """PDF extension with no MIME → (PDF, application/pdf)."""
        fmt, mime = detect_format("invoices/a.pdf", None)
        assert fmt == DocumentFormat.PDF
        assert mime == "application/pdf"

    def test_png_extension_no_mime(self):
        """PNG extension with no MIME → (IMAGE, image/png)."""
        fmt, mime = detect_format("invoices/a.png", None)
        assert fmt == DocumentFormat.IMAGE
        assert mime == "image/png"

    def test_jpg_extension_no_mime(self):
        """JPG extension with no MIME → (IMAGE, image/jpeg)."""
        fmt, mime = detect_format("invoices/a.jpg", None)
        assert fmt == DocumentFormat.IMAGE
        assert mime == "image/jpeg"

    def test_jpeg_extension_no_mime(self):
        """JPEG extension with no MIME → (IMAGE, image/jpeg)."""
        fmt, mime = detect_format("invoices/a.jpeg", None)
        assert fmt == DocumentFormat.IMAGE
        assert mime == "image/jpeg"

    def test_svg_extension_no_mime(self):
        """SVG extension with no MIME → (IMAGE, image/svg+xml)."""
        fmt, mime = detect_format("invoices/a.svg", None)
        assert fmt == DocumentFormat.IMAGE
        assert mime == "image/svg+xml"

    def test_xml_extension_no_mime(self):
        """XML extension with no MIME → (XML, application/xml)."""
        fmt, mime = detect_format("invoices/a.xml", None)
        assert fmt == DocumentFormat.XML
        assert mime == "application/xml"

    def test_valid_png_with_matching_mime(self):
        """PNG extension with matching image/png MIME → accepted."""
        fmt, mime = detect_format("invoices/a.png", "image/png")
        assert fmt == DocumentFormat.IMAGE
        assert mime == "image/png"

    def test_valid_pdf_with_matching_mime(self):
        """PDF extension with matching application/pdf MIME → accepted."""
        fmt, mime = detect_format("invoices/a.pdf", "application/pdf")
        assert fmt == DocumentFormat.PDF
        assert mime == "application/pdf"

    def test_xml_with_text_xml_mime(self):
        """XML extension with text/xml MIME → accepted (both map to XML)."""
        fmt, mime = detect_format("invoices/a.xml", "text/xml")
        assert fmt == DocumentFormat.XML

    def test_case_insensitive_extension(self):
        """Extensions are case-insensitive — .PDF must work."""
        fmt, mime = detect_format("invoices/a.PDF", None)
        assert fmt == DocumentFormat.PDF

    # ─── Error paths ─────────────────────────────────────────────────────────

    def test_unsupported_extension_raises_value_error(self):
        """Unsupported extension (.xlsx) must raise ValueError."""
        with pytest.raises(ValueError):
            detect_format("invoices/a.xlsx", None)

    def test_mime_extension_conflict_raises_value_error(self):
        """XML extension with PDF MIME must raise ValueError."""
        with pytest.raises(ValueError):
            detect_format("invoices/a.xml", "application/pdf")

    def test_png_extension_with_pdf_mime_raises(self):
        """PNG extension with application/pdf MIME must raise ValueError."""
        with pytest.raises(ValueError):
            detect_format("invoices/a.png", "application/pdf")

    def test_missing_extension_raises_value_error(self):
        """Storage key with no extension must raise ValueError."""
        with pytest.raises(ValueError):
            detect_format("invoices/noextension", None)

    def test_unknown_extension_no_mime_raises(self):
        """Unknown extension (.docx) must raise ValueError."""
        with pytest.raises(ValueError):
            detect_format("invoices/a.docx", None)
