import json
from pathlib import Path

import pytest

from src.api.schemas import ProcessInvoiceRequest, ProcessInvoiceResponse

# ─── Helpers ──────────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parents[4]
CONTRACTS_DIR = PROJECT_ROOT / "contracts" / "sample-accounting"


def normalize_schema(schema: dict) -> dict:
    """Strip metadata and canonicalize nullable types for structural comparison."""
    if isinstance(schema, list):
        return [normalize_schema(item) for item in schema]
    if not isinstance(schema, dict):
        return schema

    # Canonicalize anyOf nullable -> type array
    if "anyOf" in schema and len(schema["anyOf"]) == 2:
        types = [s.get("type") for s in schema["anyOf"]]
        if "null" in types:
            non_null_type = next(t for t in types if t != "null")
            return {"type": [non_null_type, "null"]}

    result = {}
    for key, value in schema.items():
        if key in ("$id", "$schema", "title", "description", "default"):
            continue
        result[key] = normalize_schema(value)
    return result


def read_committed_schema(name: str) -> dict:
    path = CONTRACTS_DIR / name
    with open(path, "r", encoding="utf-8") as f:
        return normalize_schema(json.load(f))


# ─── Drift tests ──────────────────────────────────────────────────────────────

def test_request_schema_drift():
    generated = normalize_schema(ProcessInvoiceRequest.model_json_schema())
    committed = read_committed_schema("process-invoice-request.schema.json")
    assert generated == committed


def test_response_schema_drift():
    generated = normalize_schema(ProcessInvoiceResponse.model_json_schema())
    committed = read_committed_schema("process-invoice-response.schema.json")
    assert generated == committed


def test_request_rejects_unknown_fields():
    with pytest.raises(Exception):
        ProcessInvoiceRequest(
            storage_key="x.pdf",
            client_id="uuid",
            unknown_field=123,
        )


def test_response_literal_status_rejects_invalid():
    with pytest.raises(Exception):
        ProcessInvoiceResponse(
            status="invalid",
            invoice_id=None,
            errors=[],
        )


def test_request_accepts_valid_data():
    req = ProcessInvoiceRequest(
        storage_key="invoices/sample-accounting/2026/05/uuid.pdf",
        client_id="550e8400-e29b-41d4-a716-446655440000",
        dry_run=True,
        mime_type="application/pdf",
    )
    assert req.storage_key == "invoices/sample-accounting/2026/05/uuid.pdf"
    assert req.mime_type == "application/pdf"


def test_response_accepts_valid_data():
    resp = ProcessInvoiceResponse(
        status="success",
        invoice_id="550e8400-e29b-41d4-a716-446655440000",
        errors=[],
    )
    assert resp.status == "success"
    assert resp.errors == []
