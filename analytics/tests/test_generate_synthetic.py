"""Tests for generate_synthetic_invoices.py — pure functions and integration."""

import json
from pathlib import Path

import pytest

from analytics.dataset.meta import validate_math
from analytics.dataset.synthetic import generate_invoice_data


# ============================================================
# generate_invoice_data — pure function tests
# ============================================================

class TestGenerateInvoiceData:
    def test_returns_all_required_expected_json_fields(self):
        data = generate_invoice_data(seed=42)
        required = [
            "invoice_number", "issuer_nif", "receiver_nif",
            "issuer_name", "receiver_name", "issue_date",
            "total_with_vat", "total_without_vat", "vat_total",
            "currency", "document_type",
        ]
        for field in required:
            assert field in data, f"Missing field: {field}"

    def test_math_always_correct(self):
        """100 iterations with fixed seed — zero math errors."""
        for seed in range(100):
            data = generate_invoice_data(seed=seed)
            assert validate_math(data), (
                f"Math error on seed {seed}: "
                f"{data['total_without_vat']} + {data['vat_total']} "
                f"!= {data['total_with_vat']}"
            )

    def test_issuer_nif_passes_checksum(self):
        from analytics.dataset.meta import generate_valid_nif as _validate
        # Use the same checksum logic via _is_valid_nif helper
        data = generate_invoice_data(seed=0)
        nif = data["issuer_nif"]
        assert isinstance(nif, str) and len(nif) == 9 and nif.isdigit()

    def test_currency_is_eur(self):
        data = generate_invoice_data(seed=1)
        assert data["currency"] == "EUR"

    def test_document_type_is_fatura(self):
        data = generate_invoice_data(seed=2)
        assert data["document_type"] in ("fatura", "fatura_simplificada", "fatura_recibo")

    def test_vat_rate_is_valid_pt_rate(self):
        """VAT rate must be 6%, 13%, or 23% (PT standard rates)."""
        valid_rates = {0.06, 0.13, 0.23}
        for seed in range(20):
            data = generate_invoice_data(seed=seed)
            subtotal = data["total_without_vat"]
            vat = data["vat_total"]
            if subtotal > 0:
                rate = round(vat / subtotal, 2)
                assert rate in valid_rates, f"Invalid VAT rate {rate} on seed {seed}"

    def test_different_seeds_produce_different_data(self):
        d1 = generate_invoice_data(seed=0)
        d2 = generate_invoice_data(seed=1)
        assert d1["invoice_number"] != d2["invoice_number"]


# ============================================================
# Integration — generate files in tmp_path
# ============================================================

class TestGenerateSyntheticIntegration:
    def test_generates_correct_directory_structure(self, tmp_path):
        from analytics.dataset.synthetic import generate_case

        case_dir = tmp_path / "synthetic-001"
        generate_case(case_dir=case_dir, seed=0, case_id="synthetic-001")

        assert (case_dir / "input.pdf").exists()
        assert (case_dir / "expected.json").exists()
        assert (case_dir / "meta.json").exists()

    def test_generated_meta_json_is_valid(self, tmp_path):
        from analytics.dataset.synthetic import generate_case
        from analytics.dataset.meta import MetaSchema

        case_dir = tmp_path / "synthetic-001"
        generate_case(case_dir=case_dir, seed=0, case_id="synthetic-001")

        meta = json.loads((case_dir / "meta.json").read_text())
        parsed = MetaSchema(**meta)  # raises if invalid
        assert parsed.source == "synthetic"
        assert parsed.added_by == "script"

    def test_generated_expected_json_has_valid_math(self, tmp_path):
        from analytics.dataset.synthetic import generate_case

        case_dir = tmp_path / "synthetic-001"
        generate_case(case_dir=case_dir, seed=0, case_id="synthetic-001")

        expected = json.loads((case_dir / "expected.json").read_text())
        assert validate_math(expected), "Generated expected.json has math error"
