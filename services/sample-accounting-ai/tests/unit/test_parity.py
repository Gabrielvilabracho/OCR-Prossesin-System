"""Tests for the parity evaluation system.

TDD RED phase — validates ParityResult structure and field-level scoring logic.
"""

from decimal import Decimal

import pytest

from src.eval.parity import (
    FieldScore,
    ParityResult,
    evaluate_parity,
    score_field,
)


class TestScoreField:
    """Unit tests for individual field scoring."""

    def test_exact_string_match_scores_100(self):
        score = score_field("supplier_name", "TechSolutions Lda", "TechSolutions Lda")
        assert score.score == 1.0

    def test_fuzzy_string_close_match_scores_high(self):
        # Minor OCR error — extra space
        score = score_field("supplier_name", "TechSolutions  Lda", "TechSolutions Lda")
        assert score.score >= 0.9

    def test_completely_different_strings_score_low(self):
        score = score_field("supplier_name", "ABC Corp", "XYZ Lda")
        assert score.score < 0.5

    def test_none_vs_none_scores_100(self):
        """Both None → extraction correctly left it null."""
        score = score_field("supplier_nif", None, None)
        assert score.score == 1.0

    def test_none_expected_but_got_value_scores_0(self):
        """Expected null, got a value → wrong extraction."""
        score = score_field("supplier_nif", "500123456", None)
        assert score.score == 0.0

    def test_value_expected_but_got_none_scores_0(self):
        """Expected a value, got null → missed extraction."""
        score = score_field("supplier_nif", None, "500123456")
        assert score.score == 0.0

    def test_exact_decimal_string_match_scores_100(self):
        score = score_field("subtotal", "1000.00", "1000.00")
        assert score.score == 1.0

    def test_decimal_mismatch_scores_0(self):
        """Monetary values must match exactly — no fuzzy for Decimal."""
        score = score_field("subtotal", "1000.01", "1000.00")
        assert score.score == 0.0

    def test_integer_vat_rate_exact_match_scores_100(self):
        score = score_field("vat_rate", 23, 23)
        assert score.score == 1.0

    def test_integer_vat_rate_mismatch_scores_0(self):
        score = score_field("vat_rate", 13, 23)
        assert score.score == 0.0

    def test_field_score_has_field_name(self):
        score = score_field("invoice_number", "FT 2026/001", "FT 2026/001")
        assert score.field == "invoice_number"

    def test_field_score_has_extracted_and_expected(self):
        score = score_field("invoice_date", "2026-05-01", "2026-05-01")
        assert score.extracted == "2026-05-01"
        assert score.expected == "2026-05-01"


class TestEvaluateParity:
    """Integration tests for full parity evaluation."""

    def _make_extracted(self, **overrides) -> dict:  # type: ignore[type-arg]
        base = {
            "supplier_name": "TechSolutions Lda",
            "supplier_nif": "500123456",
            "invoice_number": "FT 2026/001",
            "invoice_date": "2026-05-01",
            "subtotal": "1000.00",
            "vat_amount": "230.00",
            "total": "1230.00",
            "vat_rate": 23,
            "currency": "EUR",
        }
        base.update(overrides)
        return base

    def _make_expected(self, **overrides) -> dict:  # type: ignore[type-arg]
        return self._make_extracted(**overrides)

    def test_perfect_match_scores_100_percent(self):
        extracted = self._make_extracted()
        expected = self._make_expected()
        result = evaluate_parity(extracted, expected)
        assert result.overall_score == pytest.approx(1.0, abs=0.001)

    def test_result_has_field_scores(self):
        extracted = self._make_extracted()
        expected = self._make_expected()
        result = evaluate_parity(extracted, expected)
        assert len(result.field_scores) > 0
        assert all(isinstance(fs, FieldScore) for fs in result.field_scores)

    def test_one_wrong_field_lowers_score(self):
        extracted = self._make_extracted(supplier_name="Wrong Name")
        expected = self._make_expected()
        result = evaluate_parity(extracted, expected)
        assert result.overall_score < 1.0

    def test_missing_monetary_field_scores_0_for_that_field(self):
        extracted = self._make_extracted(subtotal=None)
        expected = self._make_expected()
        result = evaluate_parity(extracted, expected)
        subtotal_score = next(fs for fs in result.field_scores if fs.field == "subtotal")
        assert subtotal_score.score == 0.0

    def test_overall_score_is_average_of_field_scores(self):
        """overall_score must be the arithmetic mean of all field scores."""
        extracted = self._make_extracted()
        expected = self._make_expected()
        result = evaluate_parity(extracted, expected)
        field_scores = [fs.score for fs in result.field_scores]
        expected_avg = sum(field_scores) / len(field_scores)
        assert result.overall_score == pytest.approx(expected_avg, abs=0.001)

    def test_result_is_parity_result_instance(self):
        result = evaluate_parity(self._make_extracted(), self._make_expected())
        assert isinstance(result, ParityResult)

    def test_parity_result_has_case_id(self):
        result = evaluate_parity(
            self._make_extracted(), self._make_expected(), case_id="case_001"
        )
        assert result.case_id == "case_001"

    def test_all_null_fields_with_all_null_expected_scores_100(self):
        """If expected is all-null and extraction is also all-null, it's perfect."""
        all_null = {
            "supplier_name": None,
            "supplier_nif": None,
            "invoice_number": None,
            "invoice_date": None,
            "subtotal": None,
            "vat_amount": None,
            "total": None,
            "vat_rate": None,
            "currency": "EUR",
        }
        result = evaluate_parity(all_null, all_null)
        assert result.overall_score == pytest.approx(1.0, abs=0.001)

    def test_fuzzy_supplier_name_with_minor_ocr_error(self):
        """Minor OCR error in supplier_name should still score ≥0.9."""
        extracted = self._make_extracted(supplier_name="TechSolutions  Lda")  # extra space
        expected = self._make_expected()
        result = evaluate_parity(extracted, expected)
        name_score = next(fs for fs in result.field_scores if fs.field == "supplier_name")
        assert name_score.score >= 0.9
