"""fetch_document node — download any supported document from Supabase Storage.

Downloads a document from the 'noxx-invoices' bucket using the storage_key
stored in InvoiceState. Supports PDF, image (JPG/JPEG/PNG/SVG), and XML.
Errors are accumulated in the errors accumulator
(never raise from a LangGraph node — return errors instead).
"""

from src.services.supabase_service import get_supabase_client

from ..state import InvoiceState

BUCKET_NAME = "noxx-invoices"


async def fetch_document_node(state: InvoiceState) -> dict:  # type: ignore[type-arg]
    """Download document bytes from Supabase Storage.

    Input state keys consumed:
      - storage_key: str — path in Supabase Storage (e.g. invoices/sample-accounting/2026/05/uuid.pdf)
      - document_format: DocumentFormat — resolved format (from API layer)
      - mime_type: str — resolved MIME type (from API layer)

    Output keys produced:
      - document_bytes: bytes — raw document content
      - audit_log: list — one entry with node name + size_bytes
      - errors: list — populated only on failure
    """
    storage_key: str | None = state.get("storage_key")

    if not storage_key:
        return {
            "document_bytes": b"",
            "errors": ["fetch_document: storage_key is missing from state"],
            "audit_log": [{"node": "fetch_document", "status": "error", "reason": "missing storage_key", "size_bytes": 0}],
        }

    try:
        client = get_supabase_client()
        document_bytes: bytes = client.storage.from_(BUCKET_NAME).download(storage_key)

        return {
            "document_bytes": document_bytes,
            "audit_log": [{
                "node": "fetch_document",
                "status": "success",
                "storage_key": storage_key,
                "size_bytes": len(document_bytes),
            }],
        }

    except Exception as exc:
        error_msg = f"fetch_document: Supabase Storage download failed for '{storage_key}': {exc}"
        return {
            "document_bytes": b"",
            "errors": [error_msg],
            "audit_log": [{
                "node": "fetch_document",
                "status": "error",
                "storage_key": storage_key,
                "size_bytes": 0,
                "reason": str(exc),
            }],
        }
