"""
DocILE dataset field mapper.
map_docile_fields() is a pure function — no I/O, no HuggingFace calls.
The ingest_docile.py script uses this function to map each DocILE item.
"""

from __future__ import annotations

from typing import Any

_DOCUMENT_TYPE_MAP = {
    "invoice": "fatura",
    "receipt": "fatura_recibo",
    "credit_note": "nota_credito",
    "debit_note": "nota_debito",
    "proforma": "proforma",
}


def map_docile_fields(item: dict[str, Any]) -> dict[str, Any] | None:
    """
    Map a DocILE dataset item to the expected.json schema.

    Returns None if required fields (total, net_total) are missing or None —
    these cases are skipped during ingestion.
    """
    total = item.get("total")
    net_total = item.get("net_total")

    if total is None or net_total is None:
        return None

    tax_total = item.get("tax_total")
    if tax_total is None:
        tax_total = round(total - net_total, 2)

    doc_id = item.get("document_id", "unknown")
    raw_type = item.get("document_type", "invoice")
    doc_type = _DOCUMENT_TYPE_MAP.get(raw_type, "fatura")

    return {
        "invoice_number": f"DOCILE-{doc_id}",
        "issuer_nif": None,
        "receiver_nif": None,
        "issuer_name": item.get("vendor_name"),
        "receiver_name": item.get("customer_name"),
        "issue_date": item.get("document_date"),
        "due_date": None,
        "total_with_vat": float(total),
        "total_without_vat": float(net_total),
        "vat_total": float(tax_total),
        "vat_breakdown": None,
        "currency": item.get("currency", "EUR"),
        "document_type": doc_type,
        "origin_country": None,
        "atcud": None,
        "items": [],
        "missing_fields": [],
    }
