"""extract_agents package — parallel sub-agents for invoice extraction.

Public API:
    run_extract_agents(ocr_text) -> (extracted_fields, audit_entries, errors)
"""

import asyncio
from typing import Any

from .header import run as run_header
from .lineas import run as run_lineas
from .totales import run as run_totales
from .validador import reconcile
from .types import SectionResult


async def run_extract_agents(
    ocr_text: str,
) -> tuple[dict[str, Any], list[dict[str, Any]], list[str]]:
    """Run header, lineas, totales agents in parallel, then reconcile.

    Args:
        ocr_text: Full OCR text from the invoice.

    Returns:
        Tuple of (extracted_fields, audit_entries, errors).
        - extracted_fields: InvoiceFields.model_dump(mode="json") compatible dict.
        - audit_entries: List of per-agent audit dicts for audit_log.
        - errors: Collected errors from all sections + validator.
    """
    # Run three agents concurrently — return_exceptions=True for SS6 isolation
    results = await asyncio.gather(
        run_header(ocr_text),
        run_lineas(ocr_text),
        run_totales(ocr_text),
        return_exceptions=True,
    )

    def _to_section(result: object, agent_name: str) -> SectionResult:
        """Convert a result (or exception) to a SectionResult."""
        if isinstance(result, Exception):
            return SectionResult(
                agent=agent_name,
                fields={},
                warnings=[],
                errors=[f"{agent_name}: unexpected error — {result}"],
            )
        # Type narrowing: result should be SectionResult at this point
        return result  # type: ignore[return-value]

    header = _to_section(results[0], "agente-header")
    lineas = _to_section(results[1], "agente-lineas")
    totales = _to_section(results[2], "agente-totales")

    # Reconcile sections into final fields
    extracted_fields, val_warnings, errors = reconcile(header, lineas, totales)

    # Build audit entries
    audit_entries: list[dict[str, Any]] = []
    for section in (header, lineas, totales):
        audit_entries.append({
            "node": "extract",
            "agent": section["agent"],
            "fields_extracted": sum(
                1 for v in section["fields"].values() if v is not None
            ),
            "warnings_count": len(section["warnings"]),
            "errors_count": len(section["errors"]),
        })

    # Validator audit
    extracted_count = sum(
        1 for v in extracted_fields.values()
        if v is not None and v != []
    )
    audit_entries.append({
        "node": "extract",
        "agent": "agente-validador",
        "fields_extracted": extracted_count,
        "reconciliation_warnings": len(val_warnings),
        "errors_count": len(errors),
    })

    return extracted_fields, audit_entries, errors
