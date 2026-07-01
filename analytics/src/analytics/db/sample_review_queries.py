"""Sample Accounting Review Queue — queries para el schema facturas."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from supabase import Client


def get_pending_review_queue(client: Client) -> list[dict[str, Any]]:
    """Retorna todos los items pendientes del review_queue con datos de la factura."""
    response = (
        client.schema("facturas")
        .table("review_queue")
        .select(
            "id, invoice_id, reason_code, priority, status, created_at, "
            "invoices(id, file_name, issuer_name, invoice_number, issue_date, "
            "total_with_vat, llm_confidence, processing_status, issuer_nif, "
            "total_without_vat, vat_total, review_reason, "
            "ocr_documents(mime_type))"
        )
        .eq("status", "pending")
        .order("priority", desc=False)
        .order("created_at", desc=True)
        .execute()
    )
    return response.data or []


def get_review_queue_stats(client: Client) -> dict[str, Any]:
    """Retorna conteos por reason_code para items pendientes."""
    response = (
        client.schema("facturas")
        .table("review_queue")
        .select("reason_code, status")
        .execute()
    )
    rows = response.data or []

    pending = [r for r in rows if r.get("status") == "pending"]
    resolved = [r for r in rows if r.get("status") == "resolved"]

    reason_counts: dict[str, int] = {}
    for row in pending:
        code = row.get("reason_code", "unknown")
        reason_counts[code] = reason_counts.get(code, 0) + 1

    return {
        "total_pending": len(pending),
        "total_resolved": len(resolved),
        "by_reason": reason_counts,
    }


def group_queue_by_invoice(
    queue_items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Agrupa items del queue por invoice_id.

    Una factura puede tener múltiples entradas (ej: low_confidence + first_time_supplier).
    Retorna una lista de dicts con invoice data + todos los queue_ids + todos los reason_codes.
    """
    grouped: dict[str, dict[str, Any]] = {}
    for item in queue_items:
        inv_id = item["invoice_id"]
        if inv_id not in grouped:
            invoice_data = item.get("invoices") or {}
            grouped[inv_id] = {
                "invoice_id": inv_id,
                "invoice": invoice_data,
                "queue_ids": [],
                "reason_codes": [],
                "priority": item.get("priority", 2),
            }
        grouped[inv_id]["queue_ids"].append(item["id"])
        grouped[inv_id]["reason_codes"].append(item.get("reason_code", ""))

    return list(grouped.values())


def resolve_invoice(
    client: Client,
    invoice_id: str,
    queue_ids: list[str],
    decision: str,
    reason: str,
    reviewed_by: str,
) -> bool:
    """Resuelve una factura: inserta review + resuelve queue + actualiza status.

    decision: "approved" → processing_status="ok"
              "rejected" → processing_status="failed"
    """
    status_map = {"approved": "ok", "rejected": "failed"}
    new_status = status_map.get(decision, "ok")
    now = datetime.now(timezone.utc).isoformat()

    try:
        client.schema("facturas").table("invoice_reviews").insert(
            {
                "invoice_id": invoice_id,
                "decision": decision,
                "reason": reason or "",
                "reviewed_by": reviewed_by,
            }
        ).execute()

        for qid in queue_ids:
            client.schema("facturas").table("review_queue").update(
                {
                    "status": "resolved",
                    "resolved_at": now,
                    "resolution_notes": reason or "",
                    "assigned_to": reviewed_by,
                }
            ).eq("id", qid).execute()

        client.schema("facturas").table("invoices").update(
            {"processing_status": new_status}
        ).eq("id", invoice_id).execute()

        return True
    except Exception:  # noqa: BLE001
        return False
