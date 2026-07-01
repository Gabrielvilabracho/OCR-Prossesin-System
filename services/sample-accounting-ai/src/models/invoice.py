"""Fiscal domain models for Sample Accounting invoice processing.

CRITICAL RULES (enforced via type system):
- All monetary values MUST be Decimal — never float
- JSON serialization outputs Decimal as string — never JSON number
- Fiscal validators use exact Decimal equality — no tolerance
- PT NIF must pass 9-digit checksum
- PT VAT rates: 0, 6, 13, 23 only
"""

from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, field_validator


# ─── Type aliases ────────────────────────────────────────────────────────────

MoneyDecimal = Annotated[
    Decimal,
    PlainSerializer(lambda x: str(x), return_type=str),
]

PtVatRate = Literal[0, 6, 13, 23]


# ─── NIF validator ───────────────────────────────────────────────────────────

def validate_pt_nif(nif: str) -> str:
    """Validate a Portuguese NIF (Número de Identificação Fiscal).

    Rules:
    - Must be exactly 9 digits
    - First digit must be in (1, 2, 5, 6, 7, 8, 9)
    - Check digit (last) must satisfy mod 11 checksum
    """
    if not nif.isdigit() or len(nif) != 9:
        raise ValueError(f"NIF must be exactly 9 digits, got: {nif!r}")

    valid_first = {1, 2, 5, 6, 7, 8, 9}
    if int(nif[0]) not in valid_first:
        raise ValueError(f"NIF first digit must be in {valid_first}, got: {nif[0]}")

    # Mod 11 checksum
    weights = [9, 8, 7, 6, 5, 4, 3, 2]
    total = sum(int(nif[i]) * weights[i] for i in range(8))
    remainder = total % 11
    check = 0 if remainder < 2 else 11 - remainder

    if int(nif[8]) != check:
        raise ValueError(f"NIF checksum failed for: {nif!r}")

    return nif


# ─── Fiscal models ────────────────────────────────────────────────────────────

class SupplierInfo(BaseModel):
    """Supplier identification info extracted from invoice."""

    model_config = ConfigDict(strict=True, frozen=True)

    name: str
    nif: str | None = None

    @field_validator("nif", mode="before")
    @classmethod
    def validate_nif(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return validate_pt_nif(v)


class InvoiceTotals(BaseModel):
    """Invoice monetary totals — all Decimal, all exact.

    Math invariant: subtotal + vat_amount == total (tolerance: 0, exact Decimal)
    This is enforced at validation time in the validate node (E4).
    """

    model_config = ConfigDict(strict=True, frozen=True)

    subtotal: MoneyDecimal
    vat_amount: MoneyDecimal
    total: MoneyDecimal
    vat_rate: PtVatRate
    currency: Literal["EUR"] = "EUR"

    @field_validator("subtotal", "vat_amount", "total", mode="before")
    @classmethod
    def parse_decimal(cls, v: str | Decimal | int) -> Decimal:
        """Accept string, Decimal, or int. Reject float."""
        if isinstance(v, float):
            raise TypeError(
                f"Monetary values must not be float — use Decimal(str(v)) or string. Got: {v!r}"
            )
        if isinstance(v, (str, int)):
            return Decimal(str(v))
        return v


class InvoiceFields(BaseModel):
    """Complete extracted invoice fields from LLM.

    All monetary values are Decimal. JSON serialization uses string representation.
    Partial extraction is allowed — fields can be None.
    """

    model_config = ConfigDict(frozen=True)

    # Supplier identification
    supplier_name: str | None = None
    supplier_nif: str | None = None

    # Document identification
    invoice_number: str | None = None
    invoice_date: str | None = None  # ISO 8601: "2026-05-12"

    # Monetary totals
    subtotal: MoneyDecimal | None = None
    vat_amount: MoneyDecimal | None = None
    total: MoneyDecimal | None = None
    vat_rate: PtVatRate | None = None
    currency: str = "EUR"

    # Line items (future)
    line_items: list[dict] = Field(default_factory=list)  # type: ignore[type-arg]

    @field_validator("supplier_nif", mode="before")
    @classmethod
    def validate_supplier_nif(cls, v: str | None) -> str | None:
        if v is None:
            return None
        try:
            return validate_pt_nif(v)
        except ValueError:
            # Invalid NIF — log warning in E3, return None
            return None

    @field_validator("subtotal", "vat_amount", "total", mode="before")
    @classmethod
    def parse_money(cls, v: str | Decimal | int | None) -> Decimal | None:
        if v is None:
            return None
        if isinstance(v, float):
            raise TypeError(
                f"Monetary values must not be float. Got: {v!r}. Use string or Decimal."
            )
        if isinstance(v, (str, int)):
            return Decimal(str(v))
        return v


class MathValidationResult(BaseModel):
    """Result of mathematical validation of invoice totals.

    Tolerance is ZERO (Decimal exact) — no float tolerance allowed.
    """

    model_config = ConfigDict(strict=True, frozen=True)

    is_valid: bool
    errors: list[str] = Field(default_factory=list)

    # Computed values for audit trail
    expected_total: MoneyDecimal | None = None
    actual_total: MoneyDecimal | None = None
    discrepancy: MoneyDecimal | None = None


class ProcessedInvoice(BaseModel):
    """Final processing result."""

    model_config = ConfigDict(frozen=True)

    storage_key: str
    client_id: str
    status: Literal["success", "failed", "dry_run"]
    invoice_id: str | None = None
    fields: InvoiceFields | None = None
    math_validation: MathValidationResult | None = None
    errors: list[str] = Field(default_factory=list)
