"""extract node — thin orchestrator for parallel invoice extraction sub-agents.

Delegates to extract_agents package which runs header/lineas/totales agents
concurrently with asyncio.gather (return_exceptions=True for SS6 isolation),
then feeds results to agente-validador for reconciliation.

Public contract (SS5): unchanged.
  Input:  raw_ocr_text (str)
  Output: extracted_fields, audit_log, errors (optional)

LangGraph topology and downstream validate/persist contract: unchanged.
"""

from .extract_agents import run_extract_agents
from ..state import InvoiceState


async def extract_node(state: InvoiceState) -> dict:  # type: ignore[type-arg]
    """Extract structured invoice fields from raw OCR text.

    Input state keys consumed:
      - raw_ocr_text: str — OCR text from ocr node

    Output keys produced:
      - extracted_fields: dict — InvoiceFields-compatible extraction result
      - audit_log: list — entries per agent + validator
      - errors: list — populated only on failure or warnings
    """
    raw_text: str | None = state.get("raw_ocr_text")

    if not raw_text:
        return {
            "extracted_fields": {},
            "errors": ["extract: raw_ocr_text is empty or missing — cannot run extraction"],
            "audit_log": [{"node": "extract", "status": "error", "reason": "no raw_ocr_text"}],
        }

    try:
        extracted_fields, audit_entries, errors = await run_extract_agents(raw_text)

        result: dict = {  # type: ignore[type-arg]
            "extracted_fields": extracted_fields,
            "audit_log": audit_entries,
        }
        if errors:
            result["errors"] = errors

        return result

    except Exception as exc:
        error_msg = f"extract: extraction failed unexpectedly: {exc}"
        return {
            "extracted_fields": {},
            "errors": [error_msg],
            "audit_log": [{
                "node": "extract",
                "status": "error",
                "reason": str(exc),
            }],
        }
