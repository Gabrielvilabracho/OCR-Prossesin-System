"""LangGraph state for invoice processing.

CRITICAL: This MUST be TypedDict — never Pydantic BaseModel.
LangGraph merges partial state returns — dict semantics required.
Nodes return ONLY the keys they modify.
"""

from typing import Annotated, TypedDict

from .._operators import add_list
from ..models.document import DocumentFormat


class InvoiceState(TypedDict, total=False):
    """Invoice processing state — all fields optional (TypedDict total=False).

    Accumulators (errors, audit_log) use Annotated[list, add_list] to merge
    partial state updates from each node. Never use plain list for accumulators.
    """

    # ─── Input ────────────────────────────────────────────────────────────
    storage_key: str
    client_id: str
    dry_run: bool

    # ─── Pipeline data ────────────────────────────────────────────────────
    document_bytes: bytes
    document_format: DocumentFormat
    mime_type: str
    raw_ocr_text: str
    extracted_fields: dict  # type: ignore[type-arg] — InvoiceFields.model_dump() in E3

    # ─── Validation ───────────────────────────────────────────────────────
    math_valid: bool
    validation_errors: list[str]

    # ─── Output ───────────────────────────────────────────────────────────
    invoice_id: str | None
    status: str  # success | failed | dry_run | stub

    # ─── Accumulators (MUST use Annotated + reducer) ──────────────────────
    errors: Annotated[list[str], add_list]
    audit_log: Annotated[list[dict], add_list]  # type: ignore[type-arg]
