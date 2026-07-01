#!/usr/bin/env python3
"""
create_meta_existing.py — One-shot script to create meta.json for the 20 existing real cases.

Usage:
    python create_meta_existing.py [--dataset <path>] [--dry-run]

Infers difficulty from invoice structure, quality from filename convention.
Does NOT overwrite existing meta.json files.
"""

import argparse
import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from analytics.dataset.meta import MetaSchema

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_DATASET = REPO_ROOT / "clients" / "sample-accounting" / "docs" / "ai" / "evaluations" / "golden-dataset"

# Manual metadata for each real case — inferred from expected.json content
REAL_CASES_META: dict[str, dict] = {
    "invoice-001": {"difficulty": "easy",   "quality": "digital", "tags": ["pt-PT", "restaurant"]},
    "invoice-002": {"difficulty": "easy",   "quality": "digital", "tags": ["pt-PT", "restaurant"]},
    "invoice-003": {"difficulty": "easy",   "quality": "digital", "tags": ["pt-PT", "restaurant"]},
    "invoice-004": {"difficulty": "easy",   "quality": "digital", "tags": ["pt-PT", "restaurant"]},
    "invoice-005": {"difficulty": "medium", "quality": "digital", "tags": ["pt-PT", "food"]},
    "invoice-006": {"difficulty": "medium", "quality": "digital", "tags": ["pt-PT", "food"]},
    "invoice-007": {"difficulty": "hard",   "quality": "digital", "tags": ["pt-PT", "retail", "null-receiver-nif"]},
    "invoice-008": {"difficulty": "medium", "quality": "digital", "tags": ["pt-PT"]},
    "invoice-009": {"difficulty": "hard",   "quality": "digital", "tags": ["international", "foreign-nif"]},
    "invoice-010": {"difficulty": "hard",   "quality": "scanned", "tags": ["international", "null-nif"]},
    "invoice-011": {"difficulty": "hard",   "quality": "digital", "tags": ["international", "foreign-nif"]},
    "invoice-012": {"difficulty": "medium", "quality": "digital", "tags": ["pt-PT", "retail"]},
    "invoice-013": {"difficulty": "medium", "quality": "digital", "tags": ["pt-PT", "food"]},
    "invoice-014": {"difficulty": "hard",   "quality": "digital", "tags": ["international", "foreign-nif"]},
    "invoice-015": {"difficulty": "medium", "quality": "digital", "tags": ["pt-PT", "amazon"]},
    "invoice-016": {"difficulty": "easy",   "quality": "digital", "tags": ["pt-PT"]},
    "invoice-017": {"difficulty": "medium", "quality": "digital", "tags": ["pt-PT", "amazon"]},
    "invoice-018": {"difficulty": "easy",   "quality": "digital", "tags": ["pt-PT", "restaurant"]},
    "invoice-019": {"difficulty": "easy",   "quality": "digital", "tags": ["pt-PT", "restaurant"]},
    "invoice-020": {"difficulty": "hard",   "quality": "scanned", "tags": ["international", "null-nif"]},
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Create meta.json for existing real cases")
    parser.add_argument("--dataset", default=str(DEFAULT_DATASET), help="Path to golden-dataset/")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be written, don't write")
    args = parser.parse_args()

    dataset_dir = Path(args.dataset)
    created = skipped = 0

    for case_id, hints in REAL_CASES_META.items():
        case_dir = dataset_dir / case_id
        meta_path = case_dir / "meta.json"

        if not case_dir.exists():
            print(f"  SKIP {case_id} — directory not found")
            skipped += 1
            continue

        if meta_path.exists():
            print(f"  SKIP {case_id} — meta.json already exists")
            skipped += 1
            continue

        meta = MetaSchema(
            case_id=case_id,
            source="real",
            language="pt-PT",
            difficulty=hints["difficulty"],
            quality=hints["quality"],
            tags=hints["tags"],
            added_date=date.today().isoformat(),
            added_by="gabriel",
        )

        if args.dry_run:
            print(f"  DRY-RUN {case_id}: {meta.model_dump()}")
        else:
            meta_path.write_text(json.dumps(meta.model_dump(), indent=2, ensure_ascii=False))
            print(f"  CREATED {meta_path}")
        created += 1

    action = "Would create" if args.dry_run else "Created"
    print(f"\n{action} {created} meta.json files, skipped {skipped}")


if __name__ == "__main__":
    main()
