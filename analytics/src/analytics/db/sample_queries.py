"""Sample Accounting prototype — Supabase queries."""

from __future__ import annotations

from typing import Any

from supabase import Client


def get_invoices_summary(client: Client) -> list[dict[str, Any]]:
    """Return a summary list of all processed invoices, newest first."""
    response = (
        client.table("prototype_invoices")
        .select(
            "id, source_type, file_name, processing_status, invoice_number, "
            "issuer_name, issue_date, total_with_vat, llm_confidence, created_at"
        )
        .order("created_at", desc=True)
        .execute()
    )
    return response.data or []


def get_invoice_detail(client: Client, invoice_id: str) -> dict[str, Any] | None:
    """Return full detail for a single invoice, including raw extraction and eFactura mock."""
    response = (
        client.table("prototype_invoices")
        .select("*")
        .eq("id", invoice_id)
        .limit(1)
        .execute()
    )
    data = response.data
    return data[0] if data else None


def get_invoices_by_status(client: Client, status: str) -> list[dict[str, Any]]:
    """Return invoices filtered by processing_status."""
    response = (
        client.table("prototype_invoices")
        .select(
            "id, source_type, file_name, processing_status, invoice_number, "
            "issuer_name, issue_date, total_with_vat, llm_confidence, created_at"
        )
        .eq("processing_status", status)
        .order("created_at", desc=True)
        .execute()
    )
    return response.data or []


def save_review(
    client: Client,
    invoice_id: str,
    decision: str,
    reason: str,
    reviewed_by: str,
) -> bool:
    """
    Save a human review decision and update the invoice status accordingly.

    decision → new processing_status:
      "approved" → "ok"
      "rejected" → "failed"
      "edited"   → "ok"
    """
    status_map = {"approved": "ok", "rejected": "failed", "edited": "ok"}
    new_status = status_map.get(decision, "ok")

    try:
        client.table("prototype_invoice_reviews").insert(
            {
                "invoice_id": invoice_id,
                "decision": decision,
                "reason": reason,
                "reviewed_by": reviewed_by,
            }
        ).execute()

        client.table("prototype_invoices").update(
            {"processing_status": new_status}
        ).eq("id", invoice_id).execute()

        return True
    except Exception:  # noqa: BLE001
        return False


def get_summary_stats(client: Client) -> dict[str, int]:
    """Return aggregate counts per status for the metrics row."""
    response = client.table("prototype_invoices").select("processing_status").execute()
    rows: list[dict[str, Any]] = response.data or []

    stats: dict[str, int] = {
        "total": len(rows),
        "ok": 0,
        "duplicado": 0,
        "requires_review": 0,
        "failed": 0,
        "processing": 0,
    }
    for row in rows:
        s = row.get("processing_status", "")
        if s in stats:
            stats[s] += 1

    return stats
