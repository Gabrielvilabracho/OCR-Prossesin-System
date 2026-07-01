"""FastAPI routes for sample-accounting-ai service.

Routes:
  GET  /health                      — liveness check
  POST /invoices/{id}/process       — canonical endpoint (FR-001 post-verify update)
  POST /process-invoice             — alias for /invoices/{id}/process (uses storage_key as invoice_id)
"""

import os

import sentry_sdk
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from src.models.document import detect_format

router = APIRouter()


# ─── Request / response models ────────────────────────────────────────────────

from src.api.schemas import ProcessInvoiceRequest, ProcessInvoiceResponse


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str


# ─── Pipeline runner (injectable for testing) ─────────────────────────────────

async def run_invoice_pipeline(
    invoice_id: str,
    storage_key: str,
    client_id: str,
    dry_run: bool,
    request: Request,
    document_format: str | None = None,
    mime_type: str | None = None,
) -> dict:  # type: ignore[type-arg]
    """Run the LangGraph invoice pipeline for a given invoice_id.

    Uses the compiled graph cached at app startup (app.state.invoice_graph).
    Returns the final InvoiceState dict.
    """
    from src.graph.state import InvoiceState

    graph = request.app.state.invoice_graph

    initial_state: InvoiceState = {
        "storage_key": storage_key,
        "client_id": client_id,
        "dry_run": dry_run,
        "invoice_id": invoice_id,
        "errors": [],
        "audit_log": [],
    }

    if document_format is not None:
        initial_state["document_format"] = document_format  # type: ignore[typeddict-item]
    if mime_type is not None:
        initial_state["mime_type"] = mime_type

    result: dict = await graph.ainvoke(initial_state)  # type: ignore[type-arg]
    return result


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="sample-accounting-ai",
        version=os.environ.get("APP_VERSION", "0.1.0"),
    )


@router.post("/invoices/{invoice_id}/process", response_model=ProcessInvoiceResponse)
async def process_invoice_by_id(
    invoice_id: str,
    body: ProcessInvoiceRequest,
    request: Request,
) -> ProcessInvoiceResponse:
    """Run the invoice processing pipeline for a pre-created invoice record.

    The invoice record must already exist in facturas.invoices (created by
    the collect step). This endpoint:
    1. Detects document format from storage_key extension + optional mime_type
    2. Returns 422 if format is unsupported or MIME/extension conflict
    3. Downloads document from Supabase Storage (via storage_key)
    4. Runs OCR or XML parse → extraction → validation → persist
    5. Returns the final status and any errors

    Args:
        invoice_id: UUID of the invoice row in facturas.invoices
        body: { storage_key, client_id, dry_run, mime_type? }
    """
    try:
        fmt, resolved_mime = detect_format(body.storage_key, body.mime_type)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        result = await run_invoice_pipeline(
            invoice_id=invoice_id,
            storage_key=body.storage_key,
            client_id=body.client_id,
            dry_run=body.dry_run,
            request=request,
            document_format=fmt,
            mime_type=resolved_mime,
        )

        return ProcessInvoiceResponse(
            invoice_id=result.get("invoice_id", invoice_id),
            status=result.get("status", "failed"),
            errors=result.get("errors", []),
        )

    except Exception as exc:
        with sentry_sdk.push_scope() as scope:
            scope.set_tag("invoice_id", invoice_id)
            scope.set_tag("storage_key", body.storage_key)
            sentry_sdk.capture_exception(exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/process-invoice", response_model=ProcessInvoiceResponse)
async def process_invoice_alias(
    body: ProcessInvoiceRequest,
    request: Request,
) -> ProcessInvoiceResponse:
    """Alias endpoint — backward compat with original FR-001 spec path.

    Uses storage_key as the invoice_id (the record is looked up via storage_key
    in fetch_document node). For direct invoice_id targeting use /invoices/{id}/process.
    """
    try:
        fmt, resolved_mime = detect_format(body.storage_key, body.mime_type)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        result = await run_invoice_pipeline(
            invoice_id=body.storage_key,  # storage_key used as invoice_id for alias path
            storage_key=body.storage_key,
            client_id=body.client_id,
            dry_run=body.dry_run,
            request=request,
            document_format=fmt,
            mime_type=resolved_mime,
        )

        return ProcessInvoiceResponse(
            invoice_id=result.get("invoice_id"),
            status=result.get("status", "failed"),
            errors=result.get("errors", []),
        )

    except Exception as exc:
        with sentry_sdk.push_scope() as scope:
            scope.set_tag("invoice_id", body.storage_key)
            scope.set_tag("storage_key", body.storage_key)
            sentry_sdk.capture_exception(exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
