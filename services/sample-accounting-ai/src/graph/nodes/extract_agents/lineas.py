"""extract_agents/lineas.py — agente-lineas extraction sub-agent.

Extracts line items: description, quantity, unit_price, subtotal, vat_rate, vat_amount.
Monetary values MUST be strings (Decimal-ready) — never float.
Missing fields within a line → None + warning (line retained).

SS0: returns SectionResult with {agent, fields, warnings, errors}.
SS2: string monetary values, partial lines retained with warnings.
"""

from decimal import Decimal, InvalidOperation

from ._llm import _call_mistral_json
from .prompts import LINEAS_SYSTEM, USER_TEMPLATE
from .types import SectionResult

_AGENT = "agente-lineas"

_MONEY_FIELDS = ("unit_price", "subtotal", "vat_amount")
_REQUIRED_FIELDS = ("description", "quantity", "unit_price", "subtotal")


def _coerce_to_string(value: object) -> str | None:
    """Coerce a float or int monetary value to Decimal string. None passthrough."""
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


def _normalise_line(line: dict, idx: int) -> tuple[dict, list[str]]:  # type: ignore[type-arg]
    """Normalise a single line item dict.

    Coerces float monetary values to strings.
    Emits a warning for each None/missing required field.
    Always returns the line (never drops it).
    """
    warnings: list[str] = []
    normalised = dict(line)

    # Coerce monetary fields to string
    for field in _MONEY_FIELDS:
        normalised[field] = _coerce_to_string(line.get(field))

    # Warn on missing required fields
    for field in _REQUIRED_FIELDS:
        if normalised.get(field) is None:
            warnings.append(
                f"{_AGENT}: line {idx + 1} missing field '{field}'"
            )

    return normalised, warnings


async def run(ocr_text: str) -> SectionResult:
    """Run agente-lineas: extract line items from OCR text.

    Args:
        ocr_text: Full invoice OCR text.

    Returns:
        SectionResult with agent="agente-lineas", fields containing
        line_items list, per-line warnings, and errors on LLM failure.
    """
    warnings: list[str] = []

    try:
        raw = await _call_mistral_json(
            system=LINEAS_SYSTEM,
            user=USER_TEMPLATE.format(ocr_text=ocr_text),
            name="extract_lineas",
        )
    except Exception as exc:
        return SectionResult(
            agent=_AGENT,
            fields={},
            warnings=[],
            errors=[f"{_AGENT}: LLM call failed — {exc}"],
        )

    raw_lines_val = raw.get("line_items", [])
    raw_lines: list[object] = raw_lines_val if isinstance(raw_lines_val, list) else []
    normalised_lines = []

    for idx, line in enumerate(raw_lines):
        if not isinstance(line, dict):
            warnings.append(f"{_AGENT}: line {idx + 1} is not a dict, skipping")
            continue
        normalised, line_warnings = _normalise_line(line, idx)
        normalised_lines.append(normalised)
        warnings.extend(line_warnings)

    return SectionResult(
        agent=_AGENT,
        fields={"line_items": normalised_lines},
        warnings=warnings,
        errors=[],
    )
