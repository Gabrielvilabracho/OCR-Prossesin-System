import pytest

from src.graph.invoice_graph import build_invoice_graph
from src.graph.state import InvoiceState
from src.models.document import DocumentFormat


@pytest.mark.asyncio
async def test_graph_stub_executes_without_crash() -> None:
    """The stub graph must execute all nodes without raising exceptions."""
    graph = build_invoice_graph()

    initial_state: InvoiceState = {
        "storage_key": "invoices/test/2026/05/test.pdf",
        "client_id": "sample-client-test",
        "dry_run": True,
        "document_format": DocumentFormat.PDF,
        "mime_type": "application/pdf",
        "errors": [],
        "audit_log": [],
    }

    result = await graph.ainvoke(initial_state)

    # Graph must complete (not crash)
    assert result is not None

    # All nodes must have logged their stub status
    # fetch_document replaces fetch_pdf (sample-multiformat)
    audit_nodes = [entry["node"] for entry in result.get("audit_log", [])]
    assert "fetch_document" in audit_nodes
    assert "extract" in audit_nodes
    assert "validate" in audit_nodes
    assert "persist" in audit_nodes
