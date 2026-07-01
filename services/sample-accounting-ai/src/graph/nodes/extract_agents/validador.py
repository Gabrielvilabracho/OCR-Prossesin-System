"""extract_agents/validador.py — agente-validador merge and reconciliation.

Merges header, lineas, totales SectionResult outputs into an InvoiceFields-
compatible dict. Reconciles discrepancies between line sums and explicit totals.

SS4: explicit totals win over line sums; discrepancy warning emitted.
SS6: section errors accumulated and prefixed; best-effort output on partial failure.
SS5: always calls InvoiceFields(**merged).model_dump(mode="json") to guarantee
     pipeline-compatible key shape.
"""

from decimal import Decimal, InvalidOperation
from typing import Any

from src.models.invoice import InvoiceFields

from .types import SectionResult

_VALID_VAT_RATES = {0, 6, 13, 23}
_MONETARY_FIELDS = ("subtotal", "vat_amount", "total")


def _to_decimal(value: object) -> Decimal | None:
    """Safely convert string/int/float to Decimal. Returns None on failure."""
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError):
        return None


def _coerce_monetary(value: object) -> str | None:
    """Coerce float/int monetary to Decimal string. None passthrough."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, (float, int)):
        try:
            return str(Decimal(str(value)))
        except InvalidOperation:
            return str(value)
    return str(value)


def reconcile(
    header: SectionResult,
    lineas: SectionResult,
    totales: SectionResult,
) -> tuple[dict[str, Any], list[str], list[str]]:
    """Reconcile section results into InvoiceFields-compatible dict.

    Args:
        header: Result from agente-header.
        lineas: Result from agente-lineas.
        totales: Result from agente-totales.

    Returns:
        Tuple of (extracted_fields, warnings, errors).
        - extracted_fields: InvoiceFields-compatible dict (model_dump keys).
        - warnings: Non-fatal issues including reconciliation discrepancies.
        - errors: Fatal section errors, prefixed by agent name.
    """
    warnings: list[str] = []
    errors: list[str] = []

    # Collect all section errors
    errors.extend(header["errors"])
    errors.extend(lineas["errors"])
    errors.extend(totales["errors"])

    all_sections_failed = bool(header["errors"]) and bool(lineas["errors"]) and bool(totales["errors"])

    # If all sections failed, return empty
    if all_sections_failed:
        return {}, warnings, errors

    # Merge fields from each section (best-effort)
    header_fields = header.get("fields") or {}
    lineas_fields = lineas.get("fields") or {}
    totales_fields = totales.get("fields") or {}

    merged: dict[str, Any] = {}

    # Header fields
    merged["supplier_name"] = header_fields.get("supplier_name")
    merged["supplier_nif"] = header_fields.get("supplier_nif")
    merged["invoice_number"] = header_fields.get("invoice_number")
    merged["invoice_date"] = header_fields.get("invoice_date")

    # Totals fields (coerce to string for Decimal safety)
    for mfield in _MONETARY_FIELDS:
        merged[mfield] = _coerce_monetary(totales_fields.get(mfield))
    merged["currency"] = totales_fields.get("currency") or "EUR"
    merged["vat_rate"] = totales_fields.get("vat_rate")

    # Line items
    merged["line_items"] = lineas_fields.get("line_items", [])

    # Reconcile: compare line sum vs explicit total
    line_items = merged["line_items"]
    if line_items and merged.get("total") is not None:
        try:
            line_sum = sum(
                _to_decimal(item.get("subtotal")) or Decimal(0)
                for item in line_items
            )
            explicit_total = _to_decimal(merged["total"])
            if explicit_total is not None and line_sum != Decimal(0) and line_sum != explicit_total:
                warnings.append(
                    f"agente-validador: line sum {line_sum} disagrees with explicit total "
                    f"{explicit_total}. expected={explicit_total}, actual={line_sum}. "
                    "Keeping explicit total."
                )
                # Explicit total already in merged — no override needed
        except Exception:
            pass  # reconciliation is non-fatal

    # Coerce via InvoiceFields to guarantee SS5 key shape
    try:
        invoice = InvoiceFields(**merged)
        extracted = invoice.model_dump(mode="json")
    except Exception as exc:
        # Fallback: best-effort merged dict + error
        errors.append(f"agente-validador: InvoiceFields coercion failed — {exc}")
        extracted = merged

    return extracted, warnings, errors
