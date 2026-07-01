"""persist node — write validated invoice back to Supabase.

Updates the existing `facturas.invoices` row — record already exists from
the collect step. We never INSERT here; only UPDATE status + extracted fields.

Design decisions:
- dry_run=True: skip write, return status='dry_run'
- errors in state → status='failed', still writes (to record failure)
- missing invoice_id → status='failed', no DB call
- Supabase exception → status='failed', errors accumulated

Table: facturas.invoices (schema prefix handled by Supabase client config)
"""

from src.services.supabase_service import get_supabase_client

from ..state import InvoiceState

_SCHEMA = "facturas"
_TABLE = "invoices"


async def persist_node(state: InvoiceState) -> dict:  # type: ignore[type-arg]
    """Persist processed invoice to Supabase facturas.invoices.

    Input state keys consumed:
      - invoice_id: str | None — PK for the UPDATE
      - extracted_fields: dict — InvoiceFields.model_dump()
      - math_valid: bool
      - validation_errors: list[str]
      - errors: list[str] — accumulated pipeline errors
      - dry_run: bool — skip write if True

    Output keys produced:
      - status: str — 'success' | 'failed' | 'dry_run'
      - invoice_id: str | None
      - audit_log: list — one entry with node name + status
      - errors: list — only populated on failure
    """
    invoice_id: str | None = state.get("invoice_id")
    dry_run: bool = state.get("dry_run", False)
    pipeline_errors: list[str] = state.get("errors", [])
    extracted: dict = state.get("extracted_fields", {})  # type: ignore[type-arg]
    math_valid: bool = state.get("math_valid", True)

    # ── Guard: missing invoice_id ────────────────────────────────────────────
    if not invoice_id:
        error_msg = "persist: invoice_id is missing from state — cannot UPDATE record"
        return {
            "status": "failed",
            "errors": [error_msg],
            "audit_log": [{
                "node": "persist",
                "status": "error",
                "reason": "missing invoice_id",
            }],
        }

    # ── Dry run: skip write ───────────────────────────────────────────────────
    if dry_run:
        return {
            "status": "dry_run",
            "invoice_id": invoice_id,
            "audit_log": [{
                "node": "persist",
                "status": "dry_run",
                "invoice_id": invoice_id,
            }],
        }

    # ── Determine final status ────────────────────────────────────────────────
    has_errors = bool(pipeline_errors) or not math_valid
    final_status = "failed" if has_errors else "validated"

    # ── Build update payload ──────────────────────────────────────────────────
    payload: dict = {  # type: ignore[type-arg]
        "processing_status": final_status,
        "raw_extraction": extracted,
    }
    if has_errors:
        payload["review_reason"] = "; ".join(pipeline_errors)

    # ── Write to Supabase ─────────────────────────────────────────────────────
    try:
        client = get_supabase_client()
        client.schema(_SCHEMA).from_(_TABLE).update(payload).eq("id", invoice_id).execute()

        return {
            "status": "success" if not has_errors else "failed",
            "invoice_id": invoice_id,
            "audit_log": [{
                "node": "persist",
                "status": "success" if not has_errors else "failed",
                "invoice_id": invoice_id,
                "db_status": final_status,
            }],
        }

    except Exception as exc:
        error_msg = f"persist: Supabase write failed for invoice '{invoice_id}': {exc}"
        return {
            "status": "failed",
            "invoice_id": invoice_id,
            "errors": [error_msg],
            "audit_log": [{
                "node": "persist",
                "status": "error",
                "invoice_id": invoice_id,
                "reason": str(exc),
            }],
        }
