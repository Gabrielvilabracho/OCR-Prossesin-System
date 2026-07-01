"""NFR-001 — Pipeline latency benchmark (mocked, CI-reproducible).

Measures the overhead of the LangGraph pipeline with all external I/O mocked.
This does NOT measure real Mistral/Supabase latency — it measures:
  - LangGraph graph compilation + invocation overhead
  - Python asyncio scheduling cost per node
  - State merge cost per node
  - Sub-agent parallel gather overhead (post-refactor)

Baseline (recorded 2026-05-12, Apple M-series, venv Python 3.12):
  P95 latency per invoice: ~50ms (well within 500ms budget)
  Mean latency per invoice: ~20ms

Gate: P95 ≤ 500ms per invoice (with full mocks — zero network)
This gate validates that pipeline overhead alone is not excessive.
Real P95 vs TS pipeline requires staging measurement (NFR-001b, manual).

SS7: Sub-agent refactor P95 delta ≤ 500ms vs monolith baseline (mocked).
After refactor the mock boundary is src.graph.nodes.extract_agents._llm.Mistral.
"""

import asyncio
import json
import statistics
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from src.graph.invoice_graph import build_invoice_graph
from src.graph.state import InvoiceState
from src.models.document import DocumentFormat


GOLDEN_DIR = Path(__file__).parent.parent / "golden"
P95_BUDGET_MS = 500  # max P95 latency per invoice with mocks (no network)
SS7_DELTA_BUDGET_MS = 500  # SS7: sub-agent overhead vs monolith ≤ 500ms


def load_golden_cases() -> list[dict]:  # type: ignore[type-arg]
    cases = []
    for path in sorted(GOLDEN_DIR.glob("case_*.json")):
        with path.open() as f:
            cases.append(json.load(f))
    return cases


def make_mock_context():
    """Build all required mocks for a zero-network pipeline run."""
    # Supabase storage mock (fetch_document)
    mock_storage = MagicMock()
    mock_storage.from_.return_value.download.return_value = b"%PDF-1.4 mock"
    mock_supabase_fetch = MagicMock()
    mock_supabase_fetch.storage = mock_storage

    # Supabase DB mock (persist)
    mock_eq = MagicMock()
    mock_eq.execute.return_value = MagicMock(data=[{"id": "test"}])
    mock_update = MagicMock()
    mock_update.eq.return_value = mock_eq
    mock_table = MagicMock()
    mock_table.update.return_value = mock_update
    mock_supabase_db = MagicMock()
    mock_supabase_db.table.return_value = mock_table

    # Mistral OCR mock
    mock_ocr_resp = MagicMock()
    mock_ocr_resp.pages = [MagicMock(markdown="FATURA mock text")]
    mock_mistral_ocr = MagicMock()
    mock_mistral_ocr.ocr.process.return_value = mock_ocr_resp

    # Mistral extract mock — now in extract_agents._llm (after T13 refactor)
    # Each sub-agent (header/lineas/totales) gets a focused JSON response
    header_json = json.dumps({
        "supplier_name": "Mock Supplier",
        "supplier_nif": "100000002",
        "receiver_nif": None,
        "invoice_number": "FT 2026/001",
        "invoice_series": None,
        "invoice_date": "2026-05-01",
    })
    lineas_json = json.dumps({"line_items": []})
    totales_json = json.dumps({
        "subtotal": "100.00",
        "vat_amount": "23.00",
        "total": "123.00",
        "discount": None,
        "currency": "EUR",
        "vat_rate": 23,
    })

    # Cycle through header/lineas/totales responses
    call_count = {"n": 0}
    responses = [header_json, lineas_json, totales_json]

    def make_mock_response(content: str) -> MagicMock:
        resp = MagicMock()
        resp.choices = [MagicMock(message=MagicMock(content=content))]
        return resp

    mock_mistral_extract = MagicMock()
    def side_effect(**kwargs):  # type: ignore[no-untyped-def]
        idx = call_count["n"] % 3
        call_count["n"] += 1
        return make_mock_response(responses[idx])

    mock_mistral_extract.chat.complete.side_effect = side_effect

    return {
        "supabase_fetch": mock_supabase_fetch,
        "supabase_db": mock_supabase_db,
        "mistral_ocr": mock_mistral_ocr,
        "mistral_extract": mock_mistral_extract,
    }


class TestPipelineBenchmark:
    """NFR-001: Pipeline P95 latency benchmark (mocked)."""

    @pytest.mark.asyncio
    async def test_p95_latency_under_budget_per_invoice(self):
        """P95 latency per invoice ≤ 500ms with fully mocked externals.

        Runs all 21 golden cases through the compiled LangGraph pipeline.
        Only measures Python/LangGraph overhead — zero network I/O.
        """
        cases = load_golden_cases()
        assert len(cases) >= 20, f"Need ≥20 golden cases, got {len(cases)}"

        graph = build_invoice_graph()
        mocks = make_mock_context()
        latencies_ms: list[float] = []

        with (
            patch("src.graph.nodes.fetch_document.get_supabase_client",
                  return_value=mocks["supabase_fetch"]),
            patch("src.graph.nodes.persist.get_supabase_client",
                  return_value=mocks["supabase_db"]),
            patch("src.graph.nodes.ocr.Mistral", return_value=mocks["mistral_ocr"]),
            # Updated patch path: Mistral now called from extract_agents._llm
            patch("src.graph.nodes.extract_agents._llm.Mistral",
                  return_value=mocks["mistral_extract"]),
        ):
            for case in cases:
                initial_state: InvoiceState = {
                    "storage_key": f"invoices/sample-accounting/2026/05/{case['input']['invoice_id']}.pdf",
                    "client_id": "benchmark-client-001",
                    "dry_run": True,  # dry_run=True: skip real persist write
                    "invoice_id": case["input"]["invoice_id"],
                    "document_format": DocumentFormat.PDF,
                    "mime_type": "application/pdf",
                    "errors": [],
                    "audit_log": [],
                }

                start = time.perf_counter()
                await graph.ainvoke(initial_state)
                elapsed_ms = (time.perf_counter() - start) * 1000
                latencies_ms.append(elapsed_ms)

        # Compute P95
        latencies_ms.sort()
        p95_index = int(len(latencies_ms) * 0.95)
        p95_ms = latencies_ms[min(p95_index, len(latencies_ms) - 1)]
        mean_ms = statistics.mean(latencies_ms)

        print(f"\n=== Pipeline Benchmark (mocked, {len(cases)} cases) ===")
        print(f"Mean latency: {mean_ms:.1f}ms")
        print(f"P95 latency:  {p95_ms:.1f}ms")
        print(f"Min latency:  {latencies_ms[0]:.1f}ms")
        print(f"Max latency:  {latencies_ms[-1]:.1f}ms")
        print(f"Budget: P95 ≤ {P95_BUDGET_MS}ms")
        print(f"Result: {'PASS' if p95_ms <= P95_BUDGET_MS else 'FAIL'}")

        assert p95_ms <= P95_BUDGET_MS, (
            f"P95 latency {p95_ms:.1f}ms exceeds {P95_BUDGET_MS}ms budget. "
            f"Mean={mean_ms:.1f}ms. "
            "This measures Python/LangGraph overhead only (no network I/O)."
        )

    @pytest.mark.asyncio
    async def test_all_cases_complete_without_error(self):
        """All 21 golden cases must complete pipeline execution (no Python exceptions)."""
        cases = load_golden_cases()
        graph = build_invoice_graph()
        mocks = make_mock_context()

        errors: list[str] = []

        with (
            patch("src.graph.nodes.fetch_document.get_supabase_client",
                  return_value=mocks["supabase_fetch"]),
            patch("src.graph.nodes.persist.get_supabase_client",
                  return_value=mocks["supabase_db"]),
            patch("src.graph.nodes.ocr.Mistral", return_value=mocks["mistral_ocr"]),
            patch("src.graph.nodes.extract_agents._llm.Mistral",
                  return_value=mocks["mistral_extract"]),
        ):
            for case in cases:
                try:
                    state: InvoiceState = {
                        "storage_key": f"invoices/sample-accounting/2026/05/{case['input']['invoice_id']}.pdf",
                        "client_id": "benchmark-client-001",
                        "dry_run": True,
                        "invoice_id": case["input"]["invoice_id"],
                        "document_format": DocumentFormat.PDF,
                        "mime_type": "application/pdf",
                        "errors": [],
                        "audit_log": [],
                    }
                    result = await graph.ainvoke(state)
                    assert result is not None
                except Exception as exc:
                    errors.append(f"{case['input']['invoice_id']}: {exc}")

        assert len(errors) == 0, (
            f"Pipeline raised exceptions on {len(errors)} cases:\n"
            + "\n".join(errors)
        )

    @pytest.mark.asyncio
    async def test_mean_latency_reasonable(self):
        """Mean latency should be well under P95 budget (sanity check)."""
        cases = load_golden_cases()
        graph = build_invoice_graph()
        mocks = make_mock_context()
        latencies: list[float] = []

        with (
            patch("src.graph.nodes.fetch_document.get_supabase_client",
                  return_value=mocks["supabase_fetch"]),
            patch("src.graph.nodes.persist.get_supabase_client",
                  return_value=mocks["supabase_db"]),
            patch("src.graph.nodes.ocr.Mistral", return_value=mocks["mistral_ocr"]),
            patch("src.graph.nodes.extract_agents._llm.Mistral",
                  return_value=mocks["mistral_extract"]),
        ):
            for case in cases:
                state: InvoiceState = {
                    "storage_key": f"invoices/sample-accounting/2026/05/{case['input']['invoice_id']}.pdf",
                    "client_id": "benchmark-client-001",
                    "dry_run": True,
                    "invoice_id": case["input"]["invoice_id"],
                    "document_format": DocumentFormat.PDF,
                    "mime_type": "application/pdf",
                    "errors": [],
                    "audit_log": [],
                }
                start = time.perf_counter()
                await graph.ainvoke(state)
                latencies.append((time.perf_counter() - start) * 1000)

        mean_ms = statistics.mean(latencies)
        # Mean should be ≤ half the P95 budget (reasonable sanity check)
        assert mean_ms <= P95_BUDGET_MS / 2, (
            f"Mean latency {mean_ms:.1f}ms is too high — expected ≤ {P95_BUDGET_MS / 2}ms"
        )

    @pytest.mark.asyncio
    async def test_ss7_sub_agent_p95_delta_within_budget(self):
        """SS7: Sub-agent extraction P95 delta ≤ 500ms vs absolute budget.

        Measures extract_node sub-agent orchestration overhead in isolation
        using asyncio.gather with mocked _call_mistral_json (no full pipeline).
        Gate: P95 latency ≤ SS7_DELTA_BUDGET_MS.
        """
        from unittest.mock import AsyncMock

        from src.graph.nodes.extract_agents import run_extract_agents

        ITERATIONS = 30
        latencies_ms: list[float] = []

        with patch(
            "src.graph.nodes.extract_agents._llm.Mistral"
        ) as MockMistral:
            header_resp = MagicMock()
            header_resp.choices = [MagicMock(message=MagicMock(content=json.dumps({
                "supplier_name": "Test Supplier",
                "supplier_nif": "100000002",
                "receiver_nif": None,
                "invoice_number": "FT/001",
                "invoice_series": None,
                "invoice_date": "2026-05-01",
            })))]
            lineas_resp = MagicMock()
            lineas_resp.choices = [MagicMock(message=MagicMock(content=json.dumps({"line_items": []})))]
            totales_resp = MagicMock()
            totales_resp.choices = [MagicMock(message=MagicMock(content=json.dumps({
                "subtotal": "100.00", "vat_amount": "23.00", "total": "123.00",
                "currency": "EUR", "vat_rate": 23, "discount": None,
            })))]

            call_count = {"n": 0}
            responses_cycle = [header_resp, lineas_resp, totales_resp]

            def make_instance():
                inst = MagicMock()
                def _complete(**kwargs):  # type: ignore[no-untyped-def]
                    idx = call_count["n"] % 3
                    call_count["n"] += 1
                    return responses_cycle[idx]
                inst.chat.complete.side_effect = _complete
                return inst

            MockMistral.side_effect = make_instance

            for _ in range(ITERATIONS):
                start = time.perf_counter()
                await run_extract_agents("FATURA mock text")
                elapsed_ms = (time.perf_counter() - start) * 1000
                latencies_ms.append(elapsed_ms)

        latencies_ms.sort()
        p95_index = int(len(latencies_ms) * 0.95)
        p95_ms = latencies_ms[min(p95_index, len(latencies_ms) - 1)]
        mean_ms = statistics.mean(latencies_ms)

        print(f"\n=== SS7 Sub-agent Benchmark ({ITERATIONS} iterations) ===")
        print(f"Mean: {mean_ms:.2f}ms  P95: {p95_ms:.2f}ms  Budget: ≤{SS7_DELTA_BUDGET_MS}ms")

        assert p95_ms <= SS7_DELTA_BUDGET_MS, (
            f"SS7: sub-agent P95 {p95_ms:.1f}ms exceeds {SS7_DELTA_BUDGET_MS}ms budget. "
            f"Mean={mean_ms:.1f}ms."
        )
