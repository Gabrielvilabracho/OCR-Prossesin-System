"""T10 RED — agente-validador tests: SS4 reconciliation + SS6 error isolation.

Validator receives SectionResult fixtures directly (no LLM mock needed).
"""

import pytest

from src.graph.nodes.extract_agents.types import SectionResult
from src.graph.nodes.extract_agents.validador import reconcile


def make_header(
    *,
    supplier_nif: str | None = "100000002",
    receiver_nif: str | None = "500000000",
    invoice_number: str | None = "FT 2026/001",
    invoice_date: str | None = "2026-05-01",
    supplier_name: str | None = "TechSolutions Lda",
    errors: list[str] | None = None,
) -> SectionResult:
    return SectionResult(
        agent="agente-header",
        fields={
            "supplier_nif": supplier_nif,
            "receiver_nif": receiver_nif,
            "invoice_number": invoice_number,
            "invoice_date": invoice_date,
            "supplier_name": supplier_name,
        },
        warnings=[],
        errors=errors or [],
    )


def make_lineas(
    *,
    line_items: list | None = None,
    errors: list[str] | None = None,
) -> SectionResult:
    return SectionResult(
        agent="agente-lineas",
        fields={"line_items": line_items or []},
        warnings=[],
        errors=errors or [],
    )


def make_totales(
    *,
    subtotal: str | None = "1000.00",
    vat_amount: str | None = "230.00",
    total: str | None = "1230.00",
    vat_rate: int | None = 23,
    currency: str = "EUR",
    errors: list[str] | None = None,
) -> SectionResult:
    return SectionResult(
        agent="agente-totales",
        fields={
            "subtotal": subtotal,
            "vat_amount": vat_amount,
            "total": total,
            "vat_rate": vat_rate,
            "currency": currency,
            "discount": None,
        },
        warnings=[],
        errors=errors or [],
    )


class TestReconcileSS4:
    """SS4: reconcile merges sections into InvoiceFields-compatible shape."""

    def test_consistent_sections_produce_invoice_fields(self):
        """SS4: consistent header/lineas/totales → extracted_fields passes InvoiceFields."""
        header = make_header()
        lineas = make_lineas()
        totales = make_totales()

        extracted_fields, warnings, errors = reconcile(header, lineas, totales)

        assert extracted_fields["supplier_nif"] == "100000002"
        assert extracted_fields["total"] == "1230.00"
        assert extracted_fields["currency"] == "EUR"
        assert errors == []

    def test_extracted_fields_has_invoice_fields_compatible_keys(self):
        """SS5 via SS4: output dict must be InvoiceFields.model_dump() compatible."""
        from src.models.invoice import InvoiceFields

        header = make_header()
        lineas = make_lineas()
        totales = make_totales()

        extracted_fields, _, _ = reconcile(header, lineas, totales)

        # Must be able to construct InvoiceFields without error
        invoice = InvoiceFields(**extracted_fields)
        dumped = invoice.model_dump(mode="json")
        assert "supplier_nif" in dumped
        assert "total" in dumped

    def test_line_sum_disagrees_with_total_explicit_total_wins(self):
        """SS4: explicit total preserved, warning emitted with expected/actual."""
        # Line sum: 500.00, but totales says total=1230.00
        lineas = make_lineas(line_items=[
            {"description": "Item", "quantity": "1", "unit_price": "500.00",
             "subtotal": "500.00", "vat_rate": 23, "vat_amount": "115.00"}
        ])
        totales = make_totales(total="1230.00", subtotal="1000.00", vat_amount="230.00")
        header = make_header()

        extracted_fields, warnings, errors = reconcile(header, lineas, totales)

        # Explicit total preserved
        assert extracted_fields["total"] == "1230.00"
        # Warning must mention the discrepancy
        assert any("expected" in w.lower() or "actual" in w.lower() or "discrepan" in w.lower()
                   for w in warnings)


class TestReconcileSS6:
    """SS6: error isolation — one section failing doesn't block others."""

    def test_lineas_fails_header_and_totales_preserved(self):
        """SS6: agente-lineas error → header/totals data preserved in output."""
        header = make_header()
        lineas = SectionResult(
            agent="agente-lineas",
            fields={},
            warnings=[],
            errors=["agente-lineas: LLM call failed — connection error"],
        )
        totales = make_totales()

        extracted_fields, warnings, errors = reconcile(header, lineas, totales)

        # Header data present
        assert extracted_fields.get("supplier_nif") == "100000002"
        # Totals data present
        assert extracted_fields.get("total") == "1230.00"
        # Errors attribute includes agente-lineas
        assert any("agente-lineas" in e for e in errors)

    def test_all_sections_fail_returns_empty_fields(self):
        """SS6: all agents fail → extracted_fields is empty + all errors surfaced."""
        header = SectionResult(
            agent="agente-header", fields={}, warnings=[],
            errors=["agente-header: LLM call failed"]
        )
        lineas = SectionResult(
            agent="agente-lineas", fields={}, warnings=[],
            errors=["agente-lineas: LLM call failed"]
        )
        totales = SectionResult(
            agent="agente-totales", fields={}, warnings=[],
            errors=["agente-totales: LLM call failed"]
        )

        extracted_fields, warnings, errors = reconcile(header, lineas, totales)

        assert extracted_fields == {} or all(v is None for v in extracted_fields.values()
                                             if v is not None and isinstance(v, list) is False)
        assert any("agente-header" in e for e in errors)
        assert any("agente-lineas" in e for e in errors)
        assert any("agente-totales" in e for e in errors)

    def test_header_fails_still_returns_totals(self):
        """SS6: header failure → totals data still in output."""
        header = SectionResult(
            agent="agente-header", fields={}, warnings=[],
            errors=["agente-header: LLM call failed"]
        )
        lineas = make_lineas()
        totales = make_totales(total="500.00", subtotal="406.50", vat_amount="93.50")

        extracted_fields, warnings, errors = reconcile(header, lineas, totales)

        assert extracted_fields.get("total") == "500.00"
        assert any("agente-header" in e for e in errors)
