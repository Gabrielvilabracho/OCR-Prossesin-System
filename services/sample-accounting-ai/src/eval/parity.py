"""Parity evaluation system for extracted invoice fields vs golden dataset.

Uses rapidfuzz for fuzzy text matching on string fields.
Numeric/monetary fields use exact Decimal comparison (no tolerance).

Design decisions:
- String fields: rapidfuzz.fuzz.ratio (0.0-1.0) — captures OCR errors
- Monetary fields (subtotal, vat_amount, total): exact string match only
  because these are Decimal serialized as strings — any difference is an error
- Integer fields (vat_rate): exact integer equality
- None vs None: perfect match (1.0) — correctly identified missing field
- Value vs None: 0.0 — extraction failure
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from rapidfuzz import fuzz

# Fields that must match exactly (Decimal monetary values + rates)
_EXACT_FIELDS = {"subtotal", "vat_amount", "total", "vat_rate", "currency"}

# Fields where fuzzy matching is appropriate (text with OCR noise)
_FUZZY_FIELDS = {"supplier_name", "invoice_number", "invoice_date", "supplier_nif"}


@dataclass(frozen=True)
class FieldScore:
    """Score for a single extracted field vs expected value."""

    field: str
    extracted: Any
    expected: Any
    score: float  # 0.0 (completely wrong) to 1.0 (perfect match)
    match_type: str  # "exact" | "fuzzy" | "null_match" | "null_mismatch"


@dataclass(frozen=True)
class ParityResult:
    """Parity evaluation result for a single golden case."""

    case_id: str | None
    overall_score: float  # arithmetic mean of all field scores
    field_scores: list[FieldScore] = field(default_factory=list)

    @property
    def is_passing(self) -> bool:
        """True if overall_score >= 0.98 (98% parity gate)."""
        return self.overall_score >= 0.98


def score_field(field_name: str, extracted: Any, expected: Any) -> FieldScore:
    """Score a single extracted field against the expected value.

    Args:
        field_name: Name of the field being evaluated.
        extracted: Value produced by the extraction pipeline.
        expected: Ground-truth value from the golden dataset.

    Returns:
        FieldScore with score 0.0-1.0.
    """
    # Both None → correct null extraction
    if extracted is None and expected is None:
        return FieldScore(
            field=field_name,
            extracted=extracted,
            expected=expected,
            score=1.0,
            match_type="null_match",
        )

    # One side is None, the other isn't → mismatch
    if extracted is None or expected is None:
        return FieldScore(
            field=field_name,
            extracted=extracted,
            expected=expected,
            score=0.0,
            match_type="null_mismatch",
        )

    # Exact match required for monetary/numeric fields
    if field_name in _EXACT_FIELDS:
        exact = str(extracted).strip() == str(expected).strip()
        return FieldScore(
            field=field_name,
            extracted=extracted,
            expected=expected,
            score=1.0 if exact else 0.0,
            match_type="exact",
        )

    # Fuzzy match for text fields (handles OCR noise)
    ratio = fuzz.ratio(str(extracted).strip(), str(expected).strip()) / 100.0
    return FieldScore(
        field=field_name,
        extracted=extracted,
        expected=expected,
        score=ratio,
        match_type="fuzzy",
    )


# All fields evaluated in parity (must match InvoiceFields)
_ALL_FIELDS = [
    "supplier_name",
    "supplier_nif",
    "invoice_number",
    "invoice_date",
    "subtotal",
    "vat_amount",
    "total",
    "vat_rate",
    "currency",
]


def evaluate_parity(
    extracted: dict,  # type: ignore[type-arg]
    expected: dict,  # type: ignore[type-arg]
    case_id: str | None = None,
) -> ParityResult:
    """Evaluate parity between extracted invoice fields and golden expected.

    Args:
        extracted: Dict of extracted fields from the pipeline.
        expected: Dict of expected fields from the golden dataset.
        case_id: Optional identifier for the golden case (for reporting).

    Returns:
        ParityResult with per-field scores and overall score.
    """
    field_scores: list[FieldScore] = []

    for field_name in _ALL_FIELDS:
        extracted_val = extracted.get(field_name)
        expected_val = expected.get(field_name)
        fs = score_field(field_name, extracted_val, expected_val)
        field_scores.append(fs)

    overall = sum(fs.score for fs in field_scores) / len(field_scores) if field_scores else 0.0

    return ParityResult(
        case_id=case_id,
        overall_score=overall,
        field_scores=field_scores,
    )
