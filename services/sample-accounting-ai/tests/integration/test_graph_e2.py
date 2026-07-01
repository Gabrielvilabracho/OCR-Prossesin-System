"""E2 integration tests — graph with real types and validate node logic."""

import pytest

from decimal import Decimal

from src.graph.invoice_graph import build_invoice_graph
from src.graph.state import InvoiceState


@pytest.mark.asyncio
async def test_graph_executes_with_full_state() -> None:
    """Graph must execute with a fully populated initial state."""
    graph = build_invoice_graph()

    initial_state: InvoiceState = {
        "storage_key": "invoices/sample-accounting/2026/05/test.pdf",
        "client_id": "sample-client-test",
        "dry_run": True,
        "errors": [],
        "audit_log": [],
    }

    result = await graph.ainvoke(initial_state)
    assert result is not None
    # E4+: persist_node is real — no invoice_id in state → status='failed' (expected)
    # E2 test only checks the graph executes without crashing
    assert result.get("status") in {"stub", "failed", "dry_run", "success"}


@pytest.mark.asyncio
async def test_validate_node_propagates_math_errors() -> None:
    """When extracted_fields has wrong math, validate node adds to errors."""
    from src.graph.nodes.validate import validate_node

    state: InvoiceState = {
        "storage_key": "test.pdf",
        "client_id": "sample-client",
        "dry_run": False,
        "errors": [],
        "audit_log": [],
        "extracted_fields": {
            "subtotal": Decimal("100.00"),
            "vat_amount": Decimal("23.00"),
            "total": Decimal("124.00"),  # wrong
        },
    }

    result = await validate_node(state)
    assert result["math_valid"] is False
    assert len(result.get("errors", [])) > 0


@pytest.mark.asyncio
async def test_validate_node_passes_correct_math() -> None:
    """When math is correct, validate node marks it valid."""
    from src.graph.nodes.validate import validate_node

    state: InvoiceState = {
        "storage_key": "test.pdf",
        "client_id": "sample-client",
        "dry_run": False,
        "errors": [],
        "audit_log": [],
        "extracted_fields": {
            "subtotal": Decimal("100.00"),
            "vat_amount": Decimal("23.00"),
            "total": Decimal("123.00"),  # correct
        },
    }

    result = await validate_node(state)
    assert result["math_valid"] is True
    assert result.get("validation_errors", []) == []
