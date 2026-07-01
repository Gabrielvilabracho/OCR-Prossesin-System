"""Validate node — math validation with Decimal-exact tolerance.

CRITICAL: Tolerance is ZERO. No float arithmetic. No 0.02€ tolerance.
subtotal + vat_amount must equal total exactly in Decimal arithmetic.
"""

from decimal import Decimal

from ..state import InvoiceState


def _validate_math(extracted_fields: dict) -> tuple[bool, list[str], dict]:  # type: ignore[type-arg]
    """Validate invoice math with Decimal-exact arithmetic.

    Pure function — no I/O. Returns (is_valid, errors, audit_detail).

    Math invariant: subtotal + vat_amount == total
    Tolerance: 0 (exact Decimal comparison)
    """
    errors: list[str] = []

    subtotal_raw = extracted_fields.get("subtotal")
    vat_raw = extracted_fields.get("vat_amount")
    total_raw = extracted_fields.get("total")

    if subtotal_raw is None or vat_raw is None or total_raw is None:
        return True, [], {"skipped": "missing totals — validation skipped"}

    # Parse as Decimal — reject any float path
    try:
        subtotal = Decimal(str(subtotal_raw)) if not isinstance(subtotal_raw, Decimal) else subtotal_raw
        vat = Decimal(str(vat_raw)) if not isinstance(vat_raw, Decimal) else vat_raw
        total = Decimal(str(total_raw)) if not isinstance(total_raw, Decimal) else total_raw
    except Exception as e:
        errors.append(f"Could not parse monetary values as Decimal: {e}")
        return False, errors, {}

    expected = subtotal + vat

    if expected != total:
        discrepancy = abs(expected - total)
        errors.append(
            f"Math validation failed: {subtotal} + {vat} = {expected}, but total is {total}. "
            f"Discrepancy: {discrepancy}"
        )
        return False, errors, {
            "expected_total": str(expected),
            "actual_total": str(total),
            "discrepancy": str(discrepancy),
        }

    return True, [], {"expected_total": str(expected), "discrepancy": "0"}


async def validate_node(state: InvoiceState) -> dict:  # type: ignore[type-arg]
    """Validate extracted fields with Decimal-exact math validation.

    Returns only the keys this node modifies.
    Full implementation in E4 (accounting classification, NIF validation, etc.)
    """
    extracted = state.get("extracted_fields", {})

    is_valid, errors, audit_detail = _validate_math(extracted)

    return {
        "math_valid": is_valid,
        "validation_errors": errors,
        "audit_log": [{
            "node": "validate",
            "math_valid": is_valid,
            "errors_count": len(errors),
            **audit_detail,
        }],
        **({"errors": errors} if errors else {}),
    }
