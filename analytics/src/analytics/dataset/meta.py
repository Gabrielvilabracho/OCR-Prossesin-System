"""
Dataset metadata schema, NIF generation, and math validation utilities.
Shared across generate_synthetic_invoices.py, ingest_docile.py, and tests.
"""

from __future__ import annotations

import random
from typing import Literal

from pydantic import BaseModel


class MetaSchema(BaseModel):
    case_id: str
    source: Literal["real", "synthetic", "docile"]
    language: Literal["pt-PT", "pt-BR", "en", "cs", "mixed"]
    difficulty: Literal["easy", "medium", "hard"]
    quality: Literal["digital", "scanned", "low-res"]
    tags: list[str] = []
    added_date: str  # YYYY-MM-DD
    added_by: str


def generate_valid_nif(prefix_digit: int = 5) -> str:
    """
    Generate a valid Portuguese NIF (9-digit string, checksum mod 11).

    Valid prefix digits: 1, 2 (individuals), 5, 6, 7, 8, 9 (companies).
    Default 5 = company NIF.
    """
    if prefix_digit not in (1, 2, 5, 6, 7, 8, 9):
        raise ValueError(f"Invalid prefix_digit {prefix_digit}. Must be one of 1,2,5,6,7,8,9")

    # Generate 7 random middle digits
    middle = [random.randint(0, 9) for _ in range(7)]
    digits = [prefix_digit] + middle

    # Compute check digit via weighted sum mod 11
    weights = [9, 8, 7, 6, 5, 4, 3, 2]
    total = sum(digits[i] * weights[i] for i in range(8))
    remainder = total % 11
    check = 0 if remainder < 2 else 11 - remainder

    # Retry if check digit is 10 (invalid — cannot be represented as single digit)
    if check == 10:
        return generate_valid_nif(prefix_digit)

    return "".join(str(d) for d in digits) + str(check)


def validate_math(expected: dict[str, object]) -> bool:
    """
    Validate that total_with_vat ≈ total_without_vat + vat_total (±0.02 EUR).
    Returns False if any required field is missing.
    """
    try:
        subtotal = expected["total_without_vat"]
        vat = expected["vat_total"]
        total = expected["total_with_vat"]
    except KeyError:
        return False

    if not isinstance(subtotal, (int, float)) or not isinstance(vat, (int, float)) or not isinstance(total, (int, float)):
        return False

    return abs(float(total) - (float(subtotal) + float(vat))) <= 0.02
