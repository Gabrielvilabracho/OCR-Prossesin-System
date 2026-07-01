"""parse_xml node — parse XML invoice bytes into raw_ocr_text.

Bypasses OCR for XML invoices. Parses XML with stdlib ElementTree and
produces deterministic raw_ocr_text by joining (tag, text) pairs.
Errors are accumulated (never raise from a LangGraph node).
"""

import xml.etree.ElementTree as ET

from ..state import InvoiceState


async def parse_xml_node(state: InvoiceState) -> dict:  # type: ignore[type-arg]
    """Parse XML document bytes into raw_ocr_text.

    Input state keys consumed:
      - document_bytes: bytes — raw XML content (from fetch_document node)
      - storage_key: str — for audit logging

    Output keys produced:
      - raw_ocr_text: str — deterministic newline-separated tag:text pairs
      - audit_log: list — one entry with node name
      - errors: list — populated only on failure (never raises)
    """
    storage_key: str = state.get("storage_key", "<unknown>")
    document_bytes: bytes = state.get("document_bytes", b"")

    if not document_bytes:
        return {
            "raw_ocr_text": "",
            "errors": ["parse_xml: document_bytes is empty — cannot parse XML"],
            "audit_log": [{
                "node": "parse_xml",
                "status": "error",
                "storage_key": storage_key,
                "reason": "empty document_bytes",
                "char_count": 0,
            }],
        }

    try:
        root = ET.fromstring(document_bytes.decode("utf-8", errors="replace"))

        # Walk tree and collect (tag, text) pairs — deterministic order
        lines: list[str] = []
        for element in root.iter():
            # Strip namespace prefix from tag (e.g. {urn:OECD:...}CompanyName → CompanyName)
            local_tag = element.tag.split("}")[-1] if "}" in element.tag else element.tag
            text = (element.text or "").strip()
            if text:
                lines.append(f"{local_tag}: {text}")

        raw_ocr_text = "\n".join(lines)

        return {
            "raw_ocr_text": raw_ocr_text,
            "audit_log": [{
                "node": "parse_xml",
                "status": "success",
                "storage_key": storage_key,
                "char_count": len(raw_ocr_text),
            }],
        }

    except ET.ParseError as exc:
        error_msg = f"parse_xml: XML parse error for '{storage_key}': {exc}"
        return {
            "raw_ocr_text": "",
            "errors": [error_msg],
            "audit_log": [{
                "node": "parse_xml",
                "status": "error",
                "storage_key": storage_key,
                "reason": str(exc),
                "char_count": 0,
            }],
        }

    except Exception as exc:
        error_msg = f"parse_xml: unexpected error for '{storage_key}': {exc}"
        return {
            "raw_ocr_text": "",
            "errors": [error_msg],
            "audit_log": [{
                "node": "parse_xml",
                "status": "error",
                "storage_key": storage_key,
                "reason": str(exc),
                "char_count": 0,
            }],
        }
