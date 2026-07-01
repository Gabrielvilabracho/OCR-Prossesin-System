"""Tests for the golden dataset loader.

TDD RED phase — ensures golden cases are well-formed and loader works correctly.
"""

import json
from pathlib import Path

import pytest


GOLDEN_DIR = Path(__file__).parent.parent / "golden"


def load_golden_cases() -> list[dict]:
    """Load all golden cases from the golden/ directory."""
    cases = []
    for path in sorted(GOLDEN_DIR.glob("case_*.json")):
        with path.open() as f:
            cases.append({"file": path.name, "data": json.load(f)})
    return cases


class TestGoldenDatasetStructure:
    """Validate structure and coverage of the golden dataset."""

    def test_golden_dir_exists(self):
        assert GOLDEN_DIR.exists(), f"Golden directory not found: {GOLDEN_DIR}"

    def test_at_least_20_cases(self):
        cases = list(GOLDEN_DIR.glob("case_*.json"))
        assert len(cases) >= 20, f"Expected ≥20 cases, found {len(cases)}"

    def test_all_cases_have_input_and_expected(self):
        for item in load_golden_cases():
            data = item["data"]
            assert "input" in data, f"{item['file']} missing 'input'"
            assert "expected" in data, f"{item['file']} missing 'expected'"

    def test_all_inputs_have_raw_text_and_invoice_id(self):
        for item in load_golden_cases():
            inp = item["data"]["input"]
            assert "raw_text" in inp, f"{item['file']} input missing 'raw_text'"
            assert "invoice_id" in inp, f"{item['file']} input missing 'invoice_id'"
            assert isinstance(inp["raw_text"], str), f"{item['file']} raw_text must be str"
            assert len(inp["raw_text"]) > 0, f"{item['file']} raw_text must not be empty"

    def test_all_expected_have_supplier_name(self):
        for item in load_golden_cases():
            expected = item["data"]["expected"]
            assert "supplier_name" in expected, f"{item['file']} expected missing 'supplier_name'"

    def test_golden_covers_vat_rate_6(self):
        """At least one case must exercise 6% VAT rate."""
        cases = load_golden_cases()
        rates = [c["data"]["expected"].get("vat_rate") for c in cases]
        assert 6 in rates, "Golden dataset must include at least one 6% VAT case"

    def test_golden_covers_vat_rate_13(self):
        """At least one case must exercise 13% VAT rate."""
        cases = load_golden_cases()
        rates = [c["data"]["expected"].get("vat_rate") for c in cases]
        assert 13 in rates, "Golden dataset must include at least one 13% VAT case"

    def test_golden_covers_vat_rate_23(self):
        """At least one case must exercise 23% VAT rate."""
        cases = load_golden_cases()
        rates = [c["data"]["expected"].get("vat_rate") for c in cases]
        assert 23 in rates, "Golden dataset must include at least one 23% VAT case"

    def test_golden_covers_invalid_nif_cases(self):
        """At least one case must have supplier_nif=None (invalid or missing NIF)."""
        cases = load_golden_cases()
        nifs = [c["data"]["expected"].get("supplier_nif") for c in cases]
        assert None in nifs, "Golden dataset must include at least one case with null supplier_nif"

    def test_golden_covers_math_error_cases(self):
        """At least one case must be tagged as a math error case."""
        cases = load_golden_cases()
        has_math_error = any(
            c["data"].get("meta", {}).get("math_error", False) for c in cases
        )
        assert has_math_error, "Golden dataset must include at least one math error case"

    def test_no_float_monetary_values(self):
        """All monetary values in expected must be strings (Decimal serialization)."""
        money_fields = {"subtotal", "vat_amount", "total"}
        for item in load_golden_cases():
            expected = item["data"]["expected"]
            for field in money_fields:
                val = expected.get(field)
                if val is not None:
                    assert isinstance(val, str), (
                        f"{item['file']} expected.{field} must be string (Decimal), got {type(val)}"
                    )

    def test_all_invoice_ids_are_uuids(self):
        """invoice_id in input must look like a UUID."""
        import re
        uuid_pattern = re.compile(
            r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
        )
        for item in load_golden_cases():
            iid = item["data"]["input"]["invoice_id"]
            assert uuid_pattern.match(iid), (
                f"{item['file']} invoice_id is not a valid UUID: {iid!r}"
            )

    def test_case_files_are_uniquely_named(self):
        cases = list(GOLDEN_DIR.glob("case_*.json"))
        names = [c.name for c in cases]
        assert len(names) == len(set(names)), "Duplicate golden case filenames detected"
