#!/usr/bin/env python3
"""
eval_extractor.py — Sample Accounting Invoice Extractor Evaluation Script

Runs the TypeScript extractor on all golden dataset cases and compares
results against expected.json using rubric.md scoring rules.

Usage:
    python eval_extractor.py [--dry-run]

Options:
    --dry-run   Process only the first 3 cases (fast testing)

Requires: MISTRAL_API_KEY env var (passed through to subprocess)
Output: clients/sample-accounting/docs/ai/evaluations/reports/YYYY-MM-DD.md
"""

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
TRIGGER_DIR = REPO_ROOT / "trigger"
GOLDEN_DIR = REPO_ROOT / "clients" / "sample-accounting" / "docs" / "ai" / "evaluations" / "golden-dataset"
REPORTS_DIR = REPO_ROOT / "clients" / "sample-accounting" / "docs" / "ai" / "evaluations" / "reports"
EXTRACTOR_SCRIPT = "src/clients/sample-accounting/scripts/run-extractor.ts"

# ---------------------------------------------------------------------------
# Fields tracked for per-field accuracy
# ---------------------------------------------------------------------------

SCORED_FIELDS = [
    "invoice_number",
    "issue_date",
    "due_date",
    "issuer_name",
    "issuer_nif",
    "receiver_name",
    "receiver_nif",
    "total_with_vat",
    "total_without_vat",
    "vat_total",
    "vat_breakdown",
    "document_type",
    "items",
]

# Fields required to be non-null in a valid invoice
REQUIRED_FIELDS = [
    "invoice_number",
    "issue_date",
    "issuer_name",
    "issuer_nif",
    "total_with_vat",
    "document_type",
]

NUMERIC_TOLERANCE = 0.02
MATH_TOLERANCE = 0.02


# ---------------------------------------------------------------------------
# Scoring helpers
# ---------------------------------------------------------------------------

def normalize_string(s: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace."""
    s = s.lower()
    s = re.sub(r"[^\w\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def levenshtein(a: str, b: str) -> int:
    """Standard Levenshtein distance."""
    if len(a) < len(b):
        return levenshtein(b, a)
    if len(b) == 0:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a):
        curr = [i + 1]
        for j, cb in enumerate(b):
            curr.append(min(prev[j + 1] + 1, curr[j] + 1, prev[j] + (0 if ca == cb else 1)))
        prev = curr
    return prev[-1]


def score_exact_string(expected, actual) -> bool:
    """Case-insensitive, whitespace-normalized exact match."""
    if expected is None and actual is None:
        return True
    if expected is None:
        return actual is None
    if actual is None:
        return False
    e = re.sub(r"\s+", " ", str(expected).strip()).lower()
    a = re.sub(r"\s+", " ", str(actual).strip()).lower()
    return e == a


def score_date(expected, actual) -> bool:
    """ISO 8601 exact match."""
    if expected is None and actual is None:
        return True
    if expected is None:
        return actual is None
    if actual is None:
        return False
    return str(expected) == str(actual)


def score_fuzzy_name(expected, actual) -> bool:
    """Levenshtein ≤ 3 OR contains/is-contained-by (case-insensitive)."""
    if expected is None and actual is None:
        return True
    if expected is None:
        return actual is None
    if actual is None:
        return False
    e = normalize_string(str(expected))
    a = normalize_string(str(actual))
    if e in a or a in e:
        return True
    return levenshtein(e, a) <= 3


def score_nif(expected, actual) -> bool:
    """Strip non-digits, exact match."""
    if expected is None and actual is None:
        return True
    if expected is None:
        return actual is None
    if actual is None:
        return False
    e = re.sub(r"\D", "", str(expected))
    a = re.sub(r"\D", "", str(actual))
    return e == a


def score_numeric(expected, actual, tolerance: float = NUMERIC_TOLERANCE) -> bool:
    """Numeric match within tolerance."""
    if expected is None and actual is None:
        return True
    if expected is None:
        return actual is None
    if actual is None:
        return False
    try:
        return abs(float(expected) - float(actual)) <= tolerance
    except (TypeError, ValueError):
        return False


def score_vat_breakdown(expected, actual) -> bool:
    """
    Array comparison: match by rate. All elements must match.
    Null/empty expected → null/empty actual = CORRECT.
    """
    # Normalize None and empty list
    exp_list = expected if expected else []
    act_list = actual if actual else []

    if not exp_list and not act_list:
        return True
    if len(exp_list) != len(act_list):
        return False

    # Build lookup by rate from actual
    act_by_rate: dict = {}
    for item in act_list:
        rate = item.get("rate")
        act_by_rate[rate] = item

    for exp_item in exp_list:
        rate = exp_item.get("rate")
        act_item = act_by_rate.get(rate)
        if act_item is None:
            return False
        if not score_numeric(exp_item.get("base"), act_item.get("base")):
            return False
        if not score_numeric(exp_item.get("amount"), act_item.get("amount")):
            return False
    return True


def score_item_description(expected, actual) -> bool:
    """Fuzzy match: Levenshtein ≤ 5 OR 80%+ character overlap."""
    if expected is None and actual is None:
        return True
    if expected is None or actual is None:
        return False
    e = normalize_string(str(expected))
    a = normalize_string(str(actual))
    if levenshtein(e, a) <= 5:
        return True
    # 80%+ overlap: use longer string as denominator
    max_len = max(len(e), len(a))
    if max_len == 0:
        return True
    dist = levenshtein(e, a)
    similarity = 1 - dist / max_len
    return similarity >= 0.80


def score_single_item(exp_item: dict, act_item: dict) -> bool:
    """Score a single line item. All sub-fields must match."""
    checks = [
        score_item_description(exp_item.get("description"), act_item.get("description")),
        score_numeric(exp_item.get("quantity"), act_item.get("quantity"), tolerance=0.001),
        score_numeric(exp_item.get("unit_price"), act_item.get("unit_price")),
        score_numeric(exp_item.get("net_amount"), act_item.get("net_amount")),
        exp_item.get("vat_rate") == act_item.get("vat_rate"),  # exact integer
        score_numeric(exp_item.get("vat_amount"), act_item.get("vat_amount")),
        score_numeric(exp_item.get("gross_amount"), act_item.get("gross_amount")),
    ]
    return all(checks)


def score_items(expected, actual) -> bool:
    """
    Array comparison in order (line_number ascending).
    Count must match AND all fields must match in each item.
    """
    exp_list = expected if expected else []
    act_list = actual if actual else []

    if not exp_list and not act_list:
        return True
    if len(exp_list) != len(act_list):
        return False

    # Sort by line_number if available
    def sort_key(item):
        return item.get("line_number", 0) if item.get("line_number") is not None else 0

    exp_sorted = sorted(exp_list, key=sort_key)
    act_sorted = sorted(act_list, key=sort_key)

    return all(score_single_item(e, a) for e, a in zip(exp_sorted, act_sorted))


def score_document_type(expected, actual) -> bool:
    """Exact string match from vocabulary."""
    if expected is None and actual is None:
        return True
    if expected is None:
        return actual is None
    if actual is None:
        return False
    return str(expected) == str(actual)


def score_field(field: str, expected_val, actual_val) -> bool:
    """Dispatch to per-field scorer."""
    if field == "invoice_number":
        return score_exact_string(expected_val, actual_val)
    elif field in ("issue_date", "due_date"):
        return score_date(expected_val, actual_val)
    elif field in ("issuer_name", "receiver_name"):
        return score_fuzzy_name(expected_val, actual_val)
    elif field in ("issuer_nif", "receiver_nif"):
        return score_nif(expected_val, actual_val)
    elif field in ("total_with_vat", "total_without_vat", "vat_total"):
        return score_numeric(expected_val, actual_val)
    elif field == "vat_breakdown":
        return score_vat_breakdown(expected_val, actual_val)
    elif field == "document_type":
        return score_document_type(expected_val, actual_val)
    elif field == "items":
        return score_items(expected_val, actual_val)
    return False


def is_null_error(expected_val, actual_val) -> bool:
    """Returns True if expected is non-null but actual is null/missing."""
    return expected_val is not None and (actual_val is None)


# ---------------------------------------------------------------------------
# Extractor invocation
# ---------------------------------------------------------------------------

def load_env_file(env_path: Path) -> dict[str, str]:
    """Parse a simple KEY=VALUE .env file. No quoting gymnastics — just strip."""
    result: dict[str, str] = {}
    if not env_path.exists():
        return result
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        # Strip inline comments (e.g. # [SECRET]) and surrounding quotes
        value = value.split("#")[0].strip().strip('"').strip("'")
        result[key] = value
    return result


def run_extractor(input_path: Path) -> dict | None:
    """
    Call the TypeScript extractor via subprocess.
    Returns parsed JSON dict or None on failure.
    """
    env = os.environ.copy()

    # Always load trigger/.env to ensure all required vars (SUPABASE_URL, MISTRAL_API_KEY, etc.)
    # are available to the subprocess, regardless of what's already in the shell environment.
    env_vars = load_env_file(TRIGGER_DIR / ".env")
    env.update(env_vars)

    if not env.get("MISTRAL_API_KEY"):
        print(f"  [SKIP] MISTRAL_API_KEY not set — skipping {input_path.name}", file=sys.stderr)
        return None

    cmd = ["npx", "tsx", EXTRACTOR_SCRIPT, str(input_path)]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=str(TRIGGER_DIR),
            env=env,
            timeout=120,
        )
    except subprocess.TimeoutExpired:
        print(f"  [ERROR] Extractor timed out for {input_path.name}", file=sys.stderr)
        return None
    except Exception as exc:
        print(f"  [ERROR] Subprocess error for {input_path.name}: {exc}", file=sys.stderr)
        return None

    if result.returncode != 0:
        stderr_snippet = result.stderr.strip()[-300:] if result.stderr else "(no stderr)"
        print(f"  [ERROR] Extractor exited {result.returncode} for {input_path.name}", file=sys.stderr)
        print(f"  [ERROR] stderr: {stderr_snippet}", file=sys.stderr)
        return None

    stdout = result.stdout.strip()
    if not stdout:
        print(f"  [ERROR] Empty stdout for {input_path.name}", file=sys.stderr)
        return None

    # pdfjs worker may emit Warning: lines to stdout before the JSON object.
    # Strip any non-JSON prefix by finding the first '{'.
    json_start = stdout.find("{")
    if json_start > 0:
        stdout = stdout[json_start:]

    try:
        return json.loads(stdout)
    except json.JSONDecodeError as exc:
        print(f"  [ERROR] JSON parse failed for {input_path.name}: {exc}", file=sys.stderr)
        return None


# ---------------------------------------------------------------------------
# Golden dataset loader
# ---------------------------------------------------------------------------

def load_cases(dry_run: bool, real_only: bool = False) -> list[dict]:
    """Load golden dataset cases sorted by invoice number."""
    dirs = sorted(
        [d for d in GOLDEN_DIR.iterdir() if d.is_dir() and (d.name.startswith("invoice-") or d.name.startswith("synthetic-"))],
        key=lambda d: d.name,
    )
    if real_only:
        dirs = [d for d in dirs if d.name.startswith("invoice-")]
    if dry_run:
        dirs = dirs[:3]

    cases = []
    for d in dirs:
        expected_path = d / "expected.json"
        if not expected_path.exists():
            print(f"  [SKIP] No expected.json in {d.name}", file=sys.stderr)
            continue

        # Find input file
        input_path = None
        for ext in ("pdf", "jpg", "jpeg", "png"):
            candidate = d / f"input.{ext}"
            if candidate.exists():
                input_path = candidate
                break

        with open(expected_path, encoding="utf-8") as f:
            expected = json.load(f)

        cases.append({
            "name": d.name,
            "input_path": input_path,
            "expected": expected,
        })

    return cases


# ---------------------------------------------------------------------------
# Per-case evaluation
# ---------------------------------------------------------------------------

def evaluate_case(case: dict) -> dict:
    """
    Evaluate a single golden dataset case.
    Returns a result dict with field scores, math check, and mismatches.
    """
    name = case["name"]
    expected = case["expected"]
    input_path = case["input_path"]

    result = {
        "name": name,
        "skipped": False,
        "skip_reason": None,
        "field_scores": {},   # field -> True/False
        "null_errors": {},    # field -> True if null error
        "math_ok": None,      # True/False/None
        "mismatches": [],     # list of {field, expected, actual}
        "actual": None,
    }

    if input_path is None:
        print(f"  [SKIP] No input file in {name}", file=sys.stderr)
        result["skipped"] = True
        result["skip_reason"] = "no input file"
        return result

    print(f"  Running extractor on {name} ({input_path.name})...", file=sys.stderr)
    actual = run_extractor(input_path)

    if actual is None:
        result["skipped"] = True
        result["skip_reason"] = "extractor error"
        return result

    result["actual"] = actual

    # Score each field
    for field in SCORED_FIELDS:
        expected_val = expected.get(field)
        actual_val = actual.get(field)

        # Skip fields marked _status: needs-manual-review
        if isinstance(expected_val, dict) and expected_val.get("_status") == "needs-manual-review":
            continue

        correct = score_field(field, expected_val, actual_val)
        result["field_scores"][field] = correct

        null_err = is_null_error(expected_val, actual_val)
        result["null_errors"][field] = null_err

        if not correct:
            result["mismatches"].append({
                "field": field,
                "expected": expected_val,
                "actual": actual_val,
            })

    # Math validation
    twv = actual.get("total_with_vat")
    twov = actual.get("total_without_vat")
    vt = actual.get("vat_total")

    if twv is not None and twov is not None and vt is not None:
        try:
            math_diff = abs((float(twov) + float(vt)) - float(twv))
            result["math_ok"] = math_diff <= MATH_TOLERANCE
        except (TypeError, ValueError):
            result["math_ok"] = False
    else:
        result["math_ok"] = None  # can't check — missing values

    return result


# ---------------------------------------------------------------------------
# Metrics aggregation
# ---------------------------------------------------------------------------

def aggregate_metrics(results: list[dict]) -> dict:
    """Compute per-field accuracy, overall accuracy, math error rate, null rate."""
    total = len(results)
    evaluated = [r for r in results if not r["skipped"]]
    n = len(evaluated)

    if n == 0:
        return {
            "total_cases": total,
            "evaluated": 0,
            "skipped": total,
            "field_accuracy": {},
            "overall_accuracy": None,
            "math_error_rate": None,
            "null_rate": {},
        }

    # Per-field accuracy
    field_accuracy: dict[str, float] = {}
    for field in SCORED_FIELDS:
        scores = [r["field_scores"].get(field) for r in evaluated if field in r["field_scores"]]
        if scores:
            field_accuracy[field] = sum(1 for s in scores if s) / len(scores) * 100
        else:
            field_accuracy[field] = None  # type: ignore

    # Overall accuracy: % invoices with 0 errors across all scored fields
    passed = sum(
        1 for r in evaluated
        if all(v for v in r["field_scores"].values())
    )
    overall_accuracy = passed / n * 100

    # Math error rate
    math_results = [r for r in evaluated if r["math_ok"] is not None]
    if math_results:
        math_errors = sum(1 for r in math_results if not r["math_ok"])
        math_error_rate = math_errors / len(math_results) * 100
    else:
        math_error_rate = None

    # Null rate per required field
    null_rate: dict[str, float] = {}
    for field in REQUIRED_FIELDS:
        null_errors = [r for r in evaluated if r["null_errors"].get(field, False)]
        null_rate[field] = len(null_errors) / n * 100

    return {
        "total_cases": total,
        "evaluated": n,
        "skipped": total - n,
        "field_accuracy": field_accuracy,
        "overall_accuracy": overall_accuracy,
        "math_error_rate": math_error_rate,
        "null_rate": null_rate,
        "pass_count": passed,
    }


# ---------------------------------------------------------------------------
# Delta computation vs previous report
# ---------------------------------------------------------------------------

def load_previous_report_metrics(reports_dir: Path) -> dict | None:
    """
    Parse per-field accuracy from the most recent report .md file.
    Returns dict mapping field -> accuracy float, or None if no reports exist.
    """
    reports = sorted(
        [f for f in reports_dir.glob("*.md") if f.name != ".gitkeep"],
        reverse=True,
    )
    if not reports:
        return None

    prev = reports[0]
    text = prev.read_text(encoding="utf-8")

    # Parse table rows like: | invoice_number | 95.0% | ...
    prev_acc: dict[str, float] = {}
    for line in text.splitlines():
        for field in SCORED_FIELDS:
            pattern = rf"^\|\s*`?{re.escape(field)}`?\s*\|[^|]*\|\s*([\d.]+)%"
            m = re.match(pattern, line.strip())
            if m:
                prev_acc[field] = float(m.group(1))
                break

    return prev_acc if prev_acc else None


# ---------------------------------------------------------------------------
# Gate evaluation
# ---------------------------------------------------------------------------

def evaluate_gate(metrics: dict) -> tuple[bool, list[str]]:
    """
    Returns (pass: bool, reasons: list[str]).
    Gate passes only if all 4 conditions hold.
    """
    reasons = []

    oa = metrics.get("overall_accuracy")
    if oa is None or oa < 95.0:
        reasons.append(f"Overall accuracy {oa:.1f}% < 95% threshold" if oa is not None else "Overall accuracy unavailable")

    mer = metrics.get("math_error_rate")
    if mer is not None and mer > 0:
        reasons.append(f"Math error rate {mer:.1f}% > 0% threshold")

    for field, acc in metrics.get("field_accuracy", {}).items():
        if acc is not None and acc < 90.0:
            reasons.append(f"Field `{field}` accuracy {acc:.1f}% < 90% threshold")

    for field, nr in metrics.get("null_rate", {}).items():
        if nr > 10.0:
            reasons.append(f"Null rate for `{field}` is {nr:.1f}% > 10% threshold")

    return len(reasons) == 0, reasons


# ---------------------------------------------------------------------------
# Report generation
# ---------------------------------------------------------------------------

def format_delta(current: float | None, prev_acc: dict | None, field: str) -> str:
    """Format delta string like '+2.5%' or '-1.0%' or '' if no prev."""
    if prev_acc is None or field not in prev_acc or current is None:
        return "—"
    delta = current - prev_acc[field]
    if delta > 0:
        return f"+{delta:.1f}%"
    elif delta < 0:
        return f"{delta:.1f}%"
    else:
        return "0.0%"


def generate_report(
    metrics: dict,
    results: list[dict],
    prev_acc: dict | None,
    gate_pass: bool,
    gate_reasons: list[str],
    dry_run: bool,
) -> str:
    """Generate the Markdown report content."""
    today = date.today().isoformat()
    n_total = metrics["total_cases"]
    n_eval = metrics["evaluated"]
    n_skip = metrics["skipped"]

    gate_label = "PASS" if gate_pass else "FAIL"
    gate_section = f"## Gate Result: {gate_label}\n\n"
    if gate_pass:
        gate_section += "All gate conditions met. Safe to deploy.\n"
    else:
        gate_section += "Gate failed. Do NOT deploy until all conditions are resolved.\n\n"
        gate_section += "**Reasons:**\n"
        for r in gate_reasons:
            gate_section += f"- {r}\n"

    # Per-field accuracy table
    field_table = "| Field | Accuracy | Delta |\n|-------|----------|-------|\n"
    fa = metrics.get("field_accuracy", {})
    for field in SCORED_FIELDS:
        acc = fa.get(field)
        acc_str = f"{acc:.1f}%" if acc is not None else "N/A"
        delta_str = format_delta(acc, prev_acc, field)
        field_table += f"| `{field}` | {acc_str} | {delta_str} |\n"

    # Null rate table (required fields only)
    null_table = "| Field | Null Rate |\n|-------|-----------|\n"
    for field in REQUIRED_FIELDS:
        nr = metrics.get("null_rate", {}).get(field)
        nr_str = f"{nr:.1f}%" if nr is not None else "N/A"
        null_table += f"| `{field}` | {nr_str} |\n"

    # Mismatches list
    mismatch_sections = []
    for r in results:
        if r["skipped"]:
            mismatch_sections.append(
                f"### {r['name']} — SKIPPED ({r.get('skip_reason', 'unknown')})\n"
            )
        elif r["mismatches"]:
            lines = [f"### {r['name']} — FAIL\n"]
            for m in r["mismatches"]:
                exp_str = json.dumps(m["expected"], ensure_ascii=False) if not isinstance(m["expected"], str) else repr(m["expected"])
                act_str = json.dumps(m["actual"], ensure_ascii=False) if not isinstance(m["actual"], str) else repr(m["actual"])
                # Truncate very long values (e.g. items arrays)
                if len(exp_str) > 200:
                    exp_str = exp_str[:200] + "..."
                if len(act_str) > 200:
                    act_str = act_str[:200] + "..."
                lines.append(f"- **{m['field']}**: expected `{exp_str}`, got `{act_str}`")
            mismatch_sections.append("\n".join(lines))
        else:
            mismatch_sections.append(f"### {r['name']} — PASS\n")

    mismatches_md = "\n\n".join(mismatch_sections)

    oa = metrics.get("overall_accuracy")
    mer = metrics.get("math_error_rate")
    oa_str = f"{oa:.1f}%" if oa is not None else "N/A"
    mer_str = f"{mer:.1f}%" if mer is not None else "N/A"

    dry_run_note = "\n> **Note**: This report was generated in `--dry-run` mode (first 3 cases only).\n" if dry_run else ""

    report = f"""# Sample Accounting Invoice Extractor — Evaluation Report

**Date**: {today}
**Golden dataset**: {n_total} cases ({n_eval} evaluated, {n_skip} skipped)
{dry_run_note}
---

{gate_section}
---

## Summary

| Metric | Value |
|--------|-------|
| Overall accuracy | {oa_str} |
| Math error rate | {mer_str} |
| Cases evaluated | {n_eval} / {n_total} |

---

## Per-Field Accuracy

{field_table}
---

## Null Rate (required fields)

{null_table}
---

## Case Results

{mismatches_md}
"""
    return report


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Evaluate Sample Accounting invoice extractor against golden dataset")
    parser.add_argument("--dry-run", action="store_true", help="Process only first 3 cases")
    parser.add_argument("--real-only", action="store_true", help="Process only real invoice cases (invoice-*), skip synthetics")
    args = parser.parse_args()

    dry_run: bool = args.dry_run
    real_only: bool = args.real_only

    print("=== Sample Accounting Invoice Extractor Evaluation ===", file=sys.stderr)
    if dry_run:
        print("[DRY RUN] Processing first 3 cases only", file=sys.stderr)
    if real_only:
        print("[REAL-ONLY] Processing invoice-* cases only (skipping synthetics)", file=sys.stderr)

    # Load cases
    cases = load_cases(dry_run, real_only=real_only)
    print(f"Loaded {len(cases)} cases", file=sys.stderr)

    # Run evaluation
    results = []
    for case in cases:
        print(f"\n[{case['name']}]", file=sys.stderr)
        result = evaluate_case(case)
        results.append(result)
        if result["skipped"]:
            print(f"  -> SKIPPED ({result['skip_reason']})", file=sys.stderr)
        elif result["mismatches"]:
            print(f"  -> FAIL ({len(result['mismatches'])} mismatches)", file=sys.stderr)
        else:
            print(f"  -> PASS", file=sys.stderr)

    # Aggregate metrics
    metrics = aggregate_metrics(results)

    # Delta vs previous report
    prev_acc = load_previous_report_metrics(REPORTS_DIR)

    # Gate evaluation
    gate_pass, gate_reasons = evaluate_gate(metrics)

    # Generate report
    report_content = generate_report(metrics, results, prev_acc, gate_pass, gate_reasons, dry_run)

    # Write report
    today_str = date.today().isoformat()
    report_path = REPORTS_DIR / f"{today_str}.md"
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_path.write_text(report_content, encoding="utf-8")

    print(f"\n=== Report written to: {report_path} ===", file=sys.stderr)
    print(f"\nOverall accuracy: {metrics.get('overall_accuracy'):.1f}%" if metrics.get("overall_accuracy") is not None else "Overall accuracy: N/A", file=sys.stderr)
    print(f"Math error rate: {metrics.get('math_error_rate'):.1f}%" if metrics.get("math_error_rate") is not None else "Math error rate: N/A", file=sys.stderr)
    print(f"Gate: {'PASS' if gate_pass else 'FAIL'}", file=sys.stderr)

    # Exit with non-zero if gate failed
    sys.exit(0 if gate_pass else 1)


if __name__ == "__main__":
    main()
