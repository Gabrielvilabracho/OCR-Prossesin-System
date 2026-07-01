"""Tests for dataset/meta.py — MetaSchema, generate_valid_nif, validate_math."""

import pytest
from pydantic import ValidationError

from analytics.dataset.meta import MetaSchema, generate_valid_nif, validate_math


# ============================================================
# MetaSchema validation
# ============================================================

class TestMetaSchema:
    def _valid_meta(self, **overrides) -> dict:
        base = {
            "case_id": "invoice-001",
            "source": "real",
            "language": "pt-PT",
            "difficulty": "easy",
            "quality": "digital",
            "tags": [],
            "added_date": "2026-04-26",
            "added_by": "gabriel",
        }
        return {**base, **overrides}

    def test_valid_meta_passes(self):
        meta = MetaSchema(**self._valid_meta())
        assert meta.case_id == "invoice-001"
        assert meta.source == "real"

    def test_valid_meta_all_sources(self):
        for source in ("real", "synthetic", "docile"):
            meta = MetaSchema(**self._valid_meta(source=source))
            assert meta.source == source

    def test_missing_difficulty_raises(self):
        data = self._valid_meta()
        del data["difficulty"]
        with pytest.raises(ValidationError) as exc_info:
            MetaSchema(**data)
        assert "difficulty" in str(exc_info.value)

    def test_invalid_source_raises(self):
        with pytest.raises(ValidationError) as exc_info:
            MetaSchema(**self._valid_meta(source="unknown"))
        assert "source" in str(exc_info.value)

    def test_invalid_difficulty_raises(self):
        with pytest.raises(ValidationError):
            MetaSchema(**self._valid_meta(difficulty="impossible"))

    def test_invalid_quality_raises(self):
        with pytest.raises(ValidationError):
            MetaSchema(**self._valid_meta(quality="blurry"))

    def test_tags_defaults_to_empty_list(self):
        data = self._valid_meta()
        del data["tags"]
        meta = MetaSchema(**data)
        assert meta.tags == []

    def test_synthetic_source_accepted(self):
        meta = MetaSchema(**self._valid_meta(source="synthetic", added_by="script"))
        assert meta.source == "synthetic"
        assert meta.added_by == "script"


# ============================================================
# generate_valid_nif
# ============================================================

def _is_valid_nif(nif: str) -> bool:
    """NIF validation — checksum mod 11."""
    if not nif.isdigit() or len(nif) != 9:
        return False
    if int(nif[0]) not in (1, 2, 5, 6, 7, 8, 9):
        return False
    weights = [9, 8, 7, 6, 5, 4, 3, 2]
    total = sum(int(nif[i]) * weights[i] for i in range(8))
    remainder = total % 11
    check = 0 if remainder < 2 else 11 - remainder
    return check == int(nif[8])


class TestGenerateValidNif:
    def test_returns_9_digit_string(self):
        nif = generate_valid_nif()
        assert isinstance(nif, str)
        assert len(nif) == 9
        assert nif.isdigit()

    def test_generated_nif_passes_checksum(self):
        nif = generate_valid_nif()
        assert _is_valid_nif(nif), f"NIF {nif} failed checksum"

    def test_different_prefix_digits_all_valid(self):
        for prefix in (1, 2, 5, 6, 7, 8, 9):
            nif = generate_valid_nif(prefix_digit=prefix)
            assert _is_valid_nif(nif), f"NIF {nif} with prefix {prefix} failed"
            assert nif[0] == str(prefix)

    def test_multiple_calls_produce_different_nifs(self):
        nifs = {generate_valid_nif() for _ in range(10)}
        assert len(nifs) > 1  # at least some variety


# ============================================================
# validate_math
# ============================================================

class TestValidateMath:
    def test_exact_match_returns_true(self):
        expected = {
            "total_without_vat": 100.00,
            "vat_total": 23.00,
            "total_with_vat": 123.00,
        }
        assert validate_math(expected) is True

    def test_within_tolerance_returns_true(self):
        expected = {
            "total_without_vat": 100.00,
            "vat_total": 23.00,
            "total_with_vat": 123.01,  # 0.01 diff — within ±0.02
        }
        assert validate_math(expected) is True

    def test_outside_tolerance_returns_false(self):
        expected = {
            "total_without_vat": 100.00,
            "vat_total": 23.00,
            "total_with_vat": 123.05,  # 0.05 diff — outside ±0.02
        }
        assert validate_math(expected) is False

    def test_missing_field_returns_false(self):
        assert validate_math({"total_without_vat": 100.0, "vat_total": 23.0}) is False
        assert validate_math({}) is False
