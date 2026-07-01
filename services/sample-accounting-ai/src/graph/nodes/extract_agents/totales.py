"""extract_agents/totales.py — agente-totales extraction sub-agent.

Extracts: subtotal, vat_amount, total, discount, currency, vat_rate.
Monetary values MUST be strings (Decimal-ready) — coerced from float/int.
VAT rate validation: not in {0,6,13,23} → None + warning.
Currency: defaults to "EUR" if absent.

SS0: returns SectionResult with {agent, fields, warnings, errors}.
SS3: string monetary values, EUR default, VAT rate guard.
"""

from decimal import Decimal, InvalidOperation

from ._llm import _call_mistral_json
from .prompts import TOTALES_SYSTEM, USER_TEMPLATE
from .types import SectionResult

_AGENT = "agente-totales"

_VALID_VAT_RATES = {0, 6, 13, 23}
_MONEY_FIELDS = ("subtotal", "vat_amount", "total", "discount")


def _coerce_to_string(value: object) -> str | None:
    """Coerce float/int to Decimal string. None passthrough."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, float):
        try:
            return str(Decimal(str(value)))
        except InvalidOperation:
            return str(value)
    if isinstance(value, int):
        return str(Decimal(value))
    return str(value)


async def run(ocr_text: str) -> SectionResult:
    """Run agente-totales: extract summary totals from OCR text.

    Args:
        ocr_text: Full invoice OCR text.

    Returns:
        SectionResult with agent="agente-totales", totals as strings,
        warnings for invalid VAT rate, and errors on LLM failure.
    """
    warnings: list[str] = []

    try:
        raw = await _call_mistral_json(
            system=TOTALES_SYSTEM,
            user=USER_TEMPLATE.format(ocr_text=ocr_text),
            name="extract_totales",
        )
    except Exception as exc:
        return SectionResult(
            agent=_AGENT,
            fields={},
            warnings=[],
            errors=[f"{_AGENT}: LLM call failed — {exc}"],
        )

    fields: dict = {}  # type: ignore[type-arg]

    # Coerce monetary fields to strings
    for mfield in _MONEY_FIELDS:
        fields[mfield] = _coerce_to_string(raw.get(mfield))

    # Currency defaults to EUR
    fields["currency"] = raw.get("currency") or "EUR"

    # VAT rate: validate against allowed set
    vat_rate = raw.get("vat_rate")
    if vat_rate is not None and vat_rate not in _VALID_VAT_RATES:
        warnings.append(
            f"{_AGENT}: invalid VAT rate {vat_rate!r} — "
            f"expected one of {sorted(_VALID_VAT_RATES)}. Setting vat_rate=None."
        )
        vat_rate = None
    fields["vat_rate"] = vat_rate

    return SectionResult(
        agent=_AGENT,
        fields=fields,
        warnings=warnings,
        errors=[],
    )
