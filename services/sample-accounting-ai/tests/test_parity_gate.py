"""T3.6 — Parity gate: ≥98% accuracy on the golden dataset.

FR-007a (CI gate): validates the parity EVALUATOR, not the LLM extractor.

IMPORTANT — What this gate tests vs what it does NOT test:
  ✅ TESTS: The parity evaluation system (evaluate_parity, FieldScore, rapidfuzz)
            correctly scores ideal extractions at ≥98%.
  ✅ TESTS: Golden dataset has correct structure and covers required VAT rates/NIFs.
  ❌ DOES NOT TEST: Real Python LLM extraction accuracy vs TS legacy pipeline.
  ❌ DOES NOT TEST: Mistral OCR or LLM quality on real invoices.

The mock extraction (simulate_extraction) injects the expected golden values
directly as the extracted values. This is an oracle scenario — it proves the
evaluator can detect perfect extraction. Real LLM accuracy is FR-007b (staging).

For each case, the pipeline is:
  expected_values → simulate_extraction → evaluate_parity → ParityResult

Gate (CI): mean overall_score across all 21 golden cases ≥ 0.98
Gate (Staging, manual): Real Python extraction vs TS legacy ≥ 98% on real invoices.
"""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from src.eval.parity import ParityResult, evaluate_parity

GOLDEN_DIR = Path(__file__).parent / "golden"
PARITY_GATE = 0.98  # 98% minimum


def load_golden_cases() -> list[dict]:  # type: ignore[type-arg]
    """Load all golden cases."""
    cases = []
    for path in sorted(GOLDEN_DIR.glob("case_*.json")):
        with path.open() as f:
            cases.append({"file": path.name, "data": json.load(f)})
    return cases


def simulate_extraction(golden_case: dict) -> dict:  # type: ignore[type-arg]
    """Simulate extraction result from a golden case.

    For gate testing, we inject the expected output as the extracted output
    (ideal extraction scenario). This validates the parity system evaluates
    perfect extraction at 100%.

    In E4/E5 this will be replaced with real LLM calls.
    """
    return dict(golden_case["data"]["expected"])


class TestParityGate:
    """Acceptance gate: overall parity ≥98% on the golden dataset."""

    def test_parity_gate_98_percent(self):
        """GATE: Mean parity score across all golden cases must be ≥98%."""
        cases = load_golden_cases()
        assert len(cases) >= 20, f"Golden dataset too small: {len(cases)} cases"

        results: list[ParityResult] = []
        failed_cases: list[dict] = []  # type: ignore[type-arg]

        for item in cases:
            golden = item["data"]
            case_id = item["file"]

            # Simulate ideal extraction (E3 gate uses perfect mock)
            extracted = simulate_extraction(item)
            expected = dict(golden["expected"])

            result = evaluate_parity(extracted, expected, case_id=case_id)
            results.append(result)

            if result.overall_score < PARITY_GATE:
                failed_cases.append({
                    "case_id": case_id,
                    "score": result.overall_score,
                    "failed_fields": [
                        {
                            "field": fs.field,
                            "extracted": fs.extracted,
                            "expected": fs.expected,
                            "score": fs.score,
                        }
                        for fs in result.field_scores
                        if fs.score < 1.0
                    ],
                })

        # Compute mean parity score
        mean_score = sum(r.overall_score for r in results) / len(results)

        # Detailed failure output for debugging
        if failed_cases:
            failure_details = "\n".join(
                f"  [{fc['case_id']}] score={fc['score']:.3f} — "
                f"failed fields: {[f['field'] for f in fc['failed_fields']]}"
                for fc in failed_cases
            )
            pytest.fail(
                f"Parity gate FAILED: mean={mean_score:.3f} < {PARITY_GATE}\n"
                f"Cases below gate ({len(failed_cases)}/{len(results)}):\n{failure_details}"
            )

        assert mean_score >= PARITY_GATE, (
            f"Parity gate FAILED: mean score {mean_score:.3f} < {PARITY_GATE}"
        )

    def test_each_case_scores_at_least_95_percent(self):
        """No individual case should score below 95% — catches structural failures."""
        cases = load_golden_cases()
        low_scoring: list[dict] = []  # type: ignore[type-arg]

        for item in cases:
            extracted = simulate_extraction(item)
            expected = dict(item["data"]["expected"])
            result = evaluate_parity(extracted, expected, case_id=item["file"])

            if result.overall_score < 0.95:
                low_scoring.append({
                    "case_id": item["file"],
                    "score": result.overall_score,
                })

        if low_scoring:
            details = "\n".join(
                f"  [{lc['case_id']}] score={lc['score']:.3f}" for lc in low_scoring
            )
            pytest.fail(
                f"Cases below 95% threshold ({len(low_scoring)} cases):\n{details}"
            )

    def test_parity_result_objects_are_valid(self):
        """All ParityResult objects must have valid structure."""
        cases = load_golden_cases()
        for item in cases:
            extracted = simulate_extraction(item)
            expected = dict(item["data"]["expected"])
            result = evaluate_parity(extracted, expected, case_id=item["file"])

            assert isinstance(result, ParityResult)
            assert 0.0 <= result.overall_score <= 1.0
            assert len(result.field_scores) > 0
            for fs in result.field_scores:
                assert 0.0 <= fs.score <= 1.0
                assert fs.field is not None

    def test_math_error_cases_still_score_high_on_extraction(self):
        """Math error cases test extraction accuracy, not validation correctness.

        The parity system evaluates whether fields are extracted correctly,
        not whether the invoice math is valid. Math errors are caught by the
        validate node, not here.
        """
        math_error_cases = [
            item for item in load_golden_cases()
            if item["data"].get("meta", {}).get("math_error", False)
        ]

        assert len(math_error_cases) >= 1, "Must have at least one math error case"

        for item in math_error_cases:
            extracted = simulate_extraction(item)
            expected = dict(item["data"]["expected"])
            result = evaluate_parity(extracted, expected, case_id=item["file"])
            assert result.overall_score >= 0.98, (
                f"Math error case {item['file']} should still score high on extraction: "
                f"got {result.overall_score:.3f}"
            )

    def test_invalid_nif_cases_handled_correctly(self):
        """Cases with null supplier_nif in expected should score 1.0 for that field."""
        null_nif_cases = [
            item for item in load_golden_cases()
            if item["data"]["expected"].get("supplier_nif") is None
        ]

        assert len(null_nif_cases) >= 1, "Must have at least one null-NIF case"

        for item in null_nif_cases:
            extracted = simulate_extraction(item)
            expected = dict(item["data"]["expected"])
            result = evaluate_parity(extracted, expected, case_id=item["file"])

            nif_score = next(
                (fs for fs in result.field_scores if fs.field == "supplier_nif"), None
            )
            assert nif_score is not None
            assert nif_score.score == 1.0, (
                f"Case {item['file']}: null NIF should score 1.0, got {nif_score.score}"
            )

    def test_golden_dataset_summary(self):
        """Summary test — print stats for observability (always passes)."""
        cases = load_golden_cases()
        results = []
        for item in cases:
            extracted = simulate_extraction(item)
            expected = dict(item["data"]["expected"])
            result = evaluate_parity(extracted, expected, case_id=item["file"])
            results.append(result)

        mean_score = sum(r.overall_score for r in results) / len(results)
        min_score = min(r.overall_score for r in results)
        max_score = max(r.overall_score for r in results)

        print(f"\n=== Parity Gate Summary ===")
        print(f"Cases: {len(results)}")
        print(f"Mean score: {mean_score:.4f} ({mean_score * 100:.2f}%)")
        print(f"Min score: {min_score:.4f} ({min_score * 100:.2f}%)")
        print(f"Max score: {max_score:.4f} ({max_score * 100:.2f}%)")
        print(f"Gate: {'PASS' if mean_score >= PARITY_GATE else 'FAIL'}")

        # Real assertions — observability test has actual invariants
        assert len(results) >= 20, f"Summary test ran on too few cases: {len(results)}"
        assert 0.0 <= mean_score <= 1.0, f"Mean score out of range: {mean_score}"
        assert 0.0 <= min_score <= 1.0, f"Min score out of range: {min_score}"
        assert min_score <= mean_score <= max_score, (
            f"Score ordering violated: min={min_score} mean={mean_score} max={max_score}"
        )
        # Summary test validates gate at the 98% level (same gate as main test)
        assert mean_score >= PARITY_GATE, (
            f"Summary gate FAILED: mean={mean_score:.4f} < {PARITY_GATE}"
        )
