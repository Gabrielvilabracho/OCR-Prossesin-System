"""Tests for ingest_docile.py — map_docile_fields pure function."""

import pytest

from analytics.dataset.docile import map_docile_fields


class TestMapDocileFields:
    def _make_item(self, **overrides) -> dict:
        """Minimal DocILE item fixture."""
        base = {
            "document_id": "docile-0001",
            "total": 1230.00,
            "net_total": 1000.00,
            "tax_total": 230.00,
            "document_date": "2021-03-15",
            "vendor_name": "Dodavatel s.r.o.",
            "customer_name": "Odběratel a.s.",
            "document_type": "invoice",
            "currency": "EUR",
        }
        return {**base, **overrides}

    def test_maps_complete_item_to_expected_schema(self):
        item = self._make_item()
        result = map_docile_fields(item)

        assert result is not None
        assert result["total_with_vat"] == 1230.00
        assert result["total_without_vat"] == 1000.00
        assert result["vat_total"] == 230.00
        assert result["issue_date"] == "2021-03-15"
        assert result["issuer_name"] == "Dodavatel s.r.o."
        assert result["currency"] == "EUR"

    def test_maps_document_type_invoice(self):
        item = self._make_item(document_type="invoice")
        result = map_docile_fields(item)
        assert result is not None
        assert result["document_type"] == "fatura"

    def test_returns_none_when_total_missing(self):
        item = self._make_item()
        del item["total"]
        assert map_docile_fields(item) is None

    def test_returns_none_when_net_total_missing(self):
        item = self._make_item()
        del item["net_total"]
        assert map_docile_fields(item) is None

    def test_returns_none_when_total_is_none(self):
        item = self._make_item(total=None)
        assert map_docile_fields(item) is None

    def test_handles_missing_optional_fields_gracefully(self):
        item = self._make_item()
        del item["vendor_name"]
        del item["customer_name"]
        result = map_docile_fields(item)
        assert result is not None
        assert result["issuer_name"] is None
        assert result["receiver_name"] is None

    def test_invoice_number_uses_document_id(self):
        item = self._make_item(document_id="docile-9999")
        result = map_docile_fields(item)
        assert result is not None
        assert "docile-9999" in result["invoice_number"]
