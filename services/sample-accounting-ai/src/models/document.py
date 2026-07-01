"""Document format detection for Sample Accounting multi-format invoice ingestion.

Supported formats: PDF, JPG/JPEG, PNG, SVG, XML.
Unsupported formats raise ValueError → caller maps to HTTP 422.
"""

from enum import StrEnum


class DocumentFormat(StrEnum):
    """Supported invoice document formats."""

    PDF = "pdf"
    IMAGE = "image"
    XML = "xml"


# Maps lowercase file extension → (DocumentFormat, canonical MIME type)
EXTENSION_TO_FORMAT: dict[str, tuple[DocumentFormat, str]] = {
    "pdf": (DocumentFormat.PDF, "application/pdf"),
    "jpg": (DocumentFormat.IMAGE, "image/jpeg"),
    "jpeg": (DocumentFormat.IMAGE, "image/jpeg"),
    "png": (DocumentFormat.IMAGE, "image/png"),
    "svg": (DocumentFormat.IMAGE, "image/svg+xml"),
    "xml": (DocumentFormat.XML, "application/xml"),
}

# MIMEs that are acceptable for XML documents (both are valid XML MIME types)
_XML_MIMES: frozenset[str] = frozenset({"application/xml", "text/xml"})

# Maps canonical MIME → DocumentFormat (used for conflict detection)
_MIME_TO_FORMAT: dict[str, DocumentFormat] = {
    "application/pdf": DocumentFormat.PDF,
    "image/jpeg": DocumentFormat.IMAGE,
    "image/png": DocumentFormat.IMAGE,
    "image/svg+xml": DocumentFormat.IMAGE,
    "application/xml": DocumentFormat.XML,
    "text/xml": DocumentFormat.XML,
}


def detect_format(
    storage_key: str,
    mime_type: str | None,
) -> tuple[DocumentFormat, str]:
    """Detect document format from storage_key extension and optional MIME type.

    Args:
        storage_key: Supabase Storage path (e.g. "invoices/sample-accounting/2026/05/a.pdf")
        mime_type: Optional MIME type provided by the caller

    Returns:
        (DocumentFormat, resolved_mime_type) tuple

    Raises:
        ValueError: Extension is unsupported, or MIME/extension conflict
    """
    # Extract and normalize extension
    dot_pos = storage_key.rfind(".")
    if dot_pos < 0 or dot_pos == len(storage_key) - 1:
        raise ValueError(
            f"detect_format: storage_key has no file extension: {storage_key!r}"
        )

    ext = storage_key[dot_pos + 1:].lower()

    entry = EXTENSION_TO_FORMAT.get(ext)
    if entry is None:
        raise ValueError(
            f"detect_format: unsupported extension '.{ext}' in {storage_key!r}. "
            f"Supported: {sorted(EXTENSION_TO_FORMAT.keys())}"
        )

    fmt, canonical_mime = entry

    # If caller provided a MIME, validate it doesn't conflict with the extension
    if mime_type is not None:
        caller_fmt = _MIME_TO_FORMAT.get(mime_type)
        if caller_fmt is None:
            raise ValueError(
                f"detect_format: unsupported MIME type {mime_type!r}. "
                f"Supported: {sorted(_MIME_TO_FORMAT.keys())}"
            )
        if caller_fmt != fmt:
            raise ValueError(
                f"detect_format: MIME/extension conflict — "
                f"extension '.{ext}' maps to {fmt!r} but MIME {mime_type!r} maps to {caller_fmt!r}"
            )
        # Caller MIME wins (preserves text/xml if that's what was sent)
        return fmt, mime_type

    return fmt, canonical_mime
