"""Tests for Pydantic v2 fiscal models.

All tests use exact Decimal arithmetic — never float.
"""

from decimal import Decimal

import pytest

from src.models.invoice import (
    InvoiceFields,
    InvoiceTotals,
    MathValidationResult,
    SupplierInfo,
    validate_pt_nif,
)


# ─── NIF validation tests ─────────────────────────────────────────────────────

class TestPtNif:
    def test_valid_nif_passes(self) -> None:
        # 123456789 — well-known test NIF
        # Verify checksum: 1*9+2*8+3*7+4*6+5*5+6*4+7*3+8*2 = 9+16+21+24+25+24+21+16 = 156
        # 156 % 11 = 2 → check = 11-2 = 9 ✓
        assert validate_pt_nif("123456789") == "123456789"

    def test_invalid_nif_wrong_checksum(self) -> None:
        with pytest.raises(ValueError, match="checksum"):
            validate_pt_nif("123456780")

    def test_invalid_nif_wrong_length(self) -> None:
        with pytest.raises(ValueError, match="9 digits"):
            validate_pt_nif("12345678")

    def test_invalid_nif_not_digits(self) -> None:
        with pytest.raises(ValueError, match="9 digits"):
            validate_pt_nif("12345678A")

    def test_invalid_nif_first_digit_zero(self) -> None:
        with pytest.raises(ValueError, match="first digit"):
            validate_pt_nif("023456789")

    def test_invalid_nif_first_digit_three(self) -> None:
        with pytest.raises(ValueError, match="first digit"):
            validate_pt_nif("323456789")


# ─── Decimal model tests ──────────────────────────────────────────────────────

class TestInvoiceTotals:
    def test_decimal_from_string(self) -> None:
        totals = InvoiceTotals(
            subtotal="100.00",
            vat_amount="23.00",
            total="123.00",
            vat_rate=23,
        )
        assert totals.subtotal == Decimal("100.00")
        assert totals.vat_amount == Decimal("23.00")
        assert totals.total == Decimal("123.00")

    def test_decimal_from_int(self) -> None:
        totals = InvoiceTotals(
            subtotal=100,
            vat_amount=23,
            total=123,
            vat_rate=23,
        )
        assert totals.subtotal == Decimal("100")

    def test_rejects_float(self) -> None:
        with pytest.raises(TypeError, match="float"):
            InvoiceTotals(
                subtotal=100.0,  # float — must be rejected
                vat_amount=23.0,
                total=123.0,
                vat_rate=23,
            )

    def test_json_serialization_decimal_as_string(self) -> None:
        totals = InvoiceTotals(
            subtotal="100.50",
            vat_amount="23.115",
            total="123.615",
            vat_rate=23,
        )
        data = totals.model_dump(mode="json")
        assert data["subtotal"] == "100.50"    # string, not float
        assert data["vat_amount"] == "23.115"  # string, not float
        assert isinstance(data["subtotal"], str)

    def test_invalid_vat_rate(self) -> None:
        with pytest.raises((ValueError, Exception)):
            InvoiceTotals(
                subtotal="100.00",
                vat_amount="15.00",
                total="115.00",
                vat_rate=15,  # not a valid PT VAT rate
            )


# ─── InvoiceFields tests ──────────────────────────────────────────────────────

class TestInvoiceFields:
    def test_partial_extraction_ok(self) -> None:
        # All fields are optional
        fields = InvoiceFields()
        assert fields.supplier_name is None
        assert fields.total is None

    def test_valid_nif_is_accepted(self) -> None:
        fields = InvoiceFields(supplier_nif="123456789")
        assert fields.supplier_nif == "123456789"

    def test_invalid_nif_becomes_none(self) -> None:
        # Invalid NIFs are silently dropped (logged in E3)
        fields = InvoiceFields(supplier_nif="000000000")
        assert fields.supplier_nif is None

    def test_decimal_amounts(self) -> None:
        fields = InvoiceFields(
            subtotal="100.00",
            vat_amount="23.00",
            total="123.00",
        )
        assert fields.subtotal == Decimal("100.00")
        assert isinstance(fields.subtotal, Decimal)

    def test_rejects_float_amounts(self) -> None:
        with pytest.raises(TypeError, match="float"):
            InvoiceFields(total=123.45)  # float rejected


# ─── Math validation logic tests ─────────────────────────────────────────────

class TestMathValidation:
    def test_valid_math(self) -> None:
        from src.graph.nodes.validate import _validate_math

        is_valid, errors, _ = _validate_math({
            "subtotal": Decimal("100.00"),
            "vat_amount": Decimal("23.00"),
            "total": Decimal("123.00"),
        })
        assert is_valid is True
        assert errors == []

    def test_invalid_math(self) -> None:
        from src.graph.nodes.validate import _validate_math

        is_valid, errors, detail = _validate_math({
            "subtotal": Decimal("100.00"),
            "vat_amount": Decimal("23.00"),
            "total": Decimal("124.00"),  # wrong — 1€ discrepancy
        })
        assert is_valid is False
        assert len(errors) == 1
        assert "Math validation failed" in errors[0]
        assert detail["discrepancy"] == "1.00"

    def test_tolerates_no_float_creep(self) -> None:
        """The old TS MATH_TOLERANCE was 0.02€. With Decimal, even 0.01 difference fails."""
        from src.graph.nodes.validate import _validate_math

        is_valid, errors, _ = _validate_math({
            "subtotal": Decimal("100.00"),
            "vat_amount": Decimal("23.00"),
            "total": Decimal("123.01"),  # 0.01 discrepancy — MUST fail with Decimal
        })
        assert is_valid is False  # Would have passed with 0.02 float tolerance!

    def test_missing_totals_skips_validation(self) -> None:
        from src.graph.nodes.validate import _validate_math

        is_valid, errors, detail = _validate_math({
            "supplier_name": "Test SA",
            # No totals
        })
        assert is_valid is True  # Skipped, not failed
        assert "skipped" in detail

    def test_string_amounts_parsed_as_decimal(self) -> None:
        from src.graph.nodes.validate import _validate_math

        # Validate that string amounts (from JSON) are parsed correctly
        is_valid, errors, _ = _validate_math({
            "subtotal": "100.00",
            "vat_amount": "23.00",
            "total": "123.00",
        })
        assert is_valid is True
