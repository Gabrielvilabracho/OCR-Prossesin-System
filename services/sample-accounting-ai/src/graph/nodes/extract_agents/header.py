"""extract_agents/header.py — agente-header extraction sub-agent.

Extracts: supplier NIF, receiver NIF, invoice date, invoice number, invoice series.
NIF validation: invalid/missing → None + warning.

SS0: returns SectionResult with {agent, fields, warnings, errors}.
SS1: normalizes and validates NIF fields.
"""

from src.models.invoice import validate_pt_nif

from ._llm import _call_mistral_json
from .prompts import HEADER_SYSTEM, USER_TEMPLATE
from .types import SectionResult

_AGENT = "agente-header"

_NIF_FIELDS = ("supplier_nif", "receiver_nif")


def _validate_nif_field(value: str | None, field_name: str) -> tuple[str | None, list[str]]:
    """Validate a NIF field. Returns (normalized_value, warnings).

    If NIF is None → emit warning.
    If NIF is invalid → set None + emit warning.
    """
    warnings: list[str] = []
    if value is None:
        warnings.append(f"{_AGENT}: {field_name} is missing or null")
        return None, warnings
    try:
        return validate_pt_nif(value), []
    except ValueError as exc:
        warnings.append(f"{_AGENT}: {field_name} invalid — {exc}")
        return None, warnings


async def run(ocr_text: str) -> SectionResult:
    """Run agente-header: extract header identification fields from OCR text.

    Args:
        ocr_text: Full invoice OCR text.

    Returns:
        SectionResult with agent="agente-header", extracted fields,
        warnings for invalid/missing NIFs, and errors on LLM failure.
    """
    warnings: list[str] = []

    try:
        raw = await _call_mistral_json(
            system=HEADER_SYSTEM,
            user=USER_TEMPLATE.format(ocr_text=ocr_text),
            name="extract_header",
        )
    except Exception as exc:
        return SectionResult(
            agent=_AGENT,
            fields={},
            warnings=[],
            errors=[f"{_AGENT}: LLM call failed — {exc}"],
        )

    fields: dict[str, object] = {}

    # Passthrough string fields
    for key in ("supplier_name", "invoice_number", "invoice_series", "invoice_date"):
        fields[key] = raw.get(key)

    # Validated NIF fields
    for nif_field in _NIF_FIELDS:
        nif_val = raw.get(nif_field)
        nif_str: str | None = nif_val if isinstance(nif_val, str) else None
        validated, nif_warnings = _validate_nif_field(nif_str, nif_field)
        fields[nif_field] = validated
        warnings.extend(nif_warnings)

    return SectionResult(
        agent=_AGENT,
        fields=fields,
        warnings=warnings,
        errors=[],
    )
