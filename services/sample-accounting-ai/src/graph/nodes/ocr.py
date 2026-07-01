"""ocr node — run OCR on document bytes using Mistral OCR.

Uses mistral-ocr-latest model. Document bytes come from InvoiceState.document_bytes.
The MIME type for the data URL comes from InvoiceState.mime_type (supports
application/pdf, image/jpeg, image/png, image/svg+xml).
All pages are concatenated with newline separator into raw_ocr_text.

Errors are accumulated in state (never raise from LangGraph node).
"""

import base64

from src.services.mistral_client import Mistral

from ..state import InvoiceState


async def ocr_node(state: InvoiceState) -> dict:  # type: ignore[type-arg]
    """Run Mistral OCR on document bytes from state.

    Input state keys consumed:
      - document_bytes: bytes — raw document content (from fetch_document node)
      - mime_type: str — detected MIME type (e.g. application/pdf, image/jpeg)

    Output keys produced:
      - raw_ocr_text: str — concatenated OCR text from all pages
      - audit_log: list — one entry with node name + char_count
      - errors: list — populated only on failure
    """
    document_bytes: bytes | None = state.get("document_bytes")
    mime_type: str = state.get("mime_type", "application/pdf")

    if not document_bytes:
        return {
            "raw_ocr_text": "",
            "errors": ["ocr: document_bytes is empty or missing — cannot run OCR"],
            "audit_log": [{"node": "ocr", "status": "error", "reason": "no document_bytes", "char_count": 0}],
        }

    try:
        client = Mistral()

        # Encode document as base64 for Mistral OCR API
        doc_b64 = base64.b64encode(document_bytes).decode("utf-8")

        response = client.ocr.process(
            model="mistral-ocr-latest",
            document={
                "type": "document_url",
                "document_url": f"data:{mime_type};base64,{doc_b64}",
            },
        )

        # Concatenate all page texts
        pages = getattr(response, "pages", [])
        raw_text = "\n".join(
            getattr(page, "markdown", "") for page in pages
        )

        return {
            "raw_ocr_text": raw_text,
            "audit_log": [{
                "node": "ocr",
                "status": "success",
                "page_count": len(pages),
                "char_count": len(raw_text),
            }],
        }

    except Exception as exc:
        error_msg = f"ocr: Mistral OCR failed: {exc}"
        return {
            "raw_ocr_text": "",
            "errors": [error_msg],
            "audit_log": [{
                "node": "ocr",
                "status": "error",
                "reason": str(exc),
                "char_count": 0,
            }],
        }
