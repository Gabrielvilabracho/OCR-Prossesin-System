"""LLM extraction service stub — implements in E3."""

from ..models.invoice import InvoiceFields


async def extract_invoice_fields(ocr_text: str, client_id: str) -> InvoiceFields:
    """Extract structured fields from OCR text using mistral-small-latest.

    E3+ will implement actual LLM call.
    """
    raise NotImplementedError("LLM service not implemented yet — Etapa 3")
