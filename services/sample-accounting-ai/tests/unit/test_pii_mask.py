from decimal import Decimal

from src.utils.pii_mask import mask_amount, mask_nif


def test_mask_nif_normal() -> None:
    assert mask_nif("123456789") == "123***789"


def test_mask_nif_none() -> None:
    assert mask_nif(None) == "***"


def test_mask_nif_short() -> None:
    assert mask_nif("12") == "***"


def test_mask_amount_decimal() -> None:
    result = mask_amount(Decimal("1234.56"))
    assert result.startswith("1***")
    assert "**" in result


def test_mask_amount_none() -> None:
    assert mask_amount(None) == "***"


def test_mask_amount_small() -> None:
    result = mask_amount(Decimal("5.00"))
    assert "***" in result
