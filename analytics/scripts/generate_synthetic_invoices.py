#!/usr/bin/env python3
"""
generate_synthetic_invoices.py — Generate synthetic Portuguese invoices for the golden dataset.

Usage:
    python generate_synthetic_invoices.py --count 100 --output <golden-dataset-dir>
    python generate_synthetic_invoices.py --count 10 --output /tmp/test-gen --seed 42

Options:
    --count     Number of invoices to generate (default: 10)
    --output    Path to golden-dataset/ directory (required)
    --seed      Base random seed for reproducibility (default: random)
    --start-at  First case number, for appending to existing dataset (default: 1)
"""

import argparse
import sys
from pathlib import Path

# Allow running as script from repo root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from analytics.dataset.synthetic import generate_case


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic PT invoices")
    parser.add_argument("--count", type=int, default=10, help="Number of cases to generate")
    parser.add_argument("--output", required=True, help="Path to golden-dataset/ directory")
    parser.add_argument("--seed", type=int, default=None, help="Base random seed")
    parser.add_argument("--start-at", type=int, default=1, dest="start_at",
                        help="First case number (for appending to existing dataset)")
    args = parser.parse_args()

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    generated = 0
    for i in range(args.count):
        n = args.start_at + i
        case_id = f"synthetic-{n:03d}"
        case_dir = output_dir / case_id
        seed = (args.seed + i) if args.seed is not None else None

        generate_case(case_dir=case_dir, seed=seed, case_id=case_id)
        generated += 1
        if generated % 10 == 0:
            print(f"  Generated {generated}/{args.count}...")

    print(f"Done — {generated} cases written to {output_dir}")


if __name__ == "__main__":
    main()
