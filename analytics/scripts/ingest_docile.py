#!/usr/bin/env python3
"""
ingest_docile.py — Ingest a sample of DocILE dataset cases into the golden dataset.

Usage:
    python ingest_docile.py --sample 20 --output <golden-dataset-dir>

Requires HuggingFace 'datasets' library and internet access.
Cases with unmappable fields (missing total/net_total) are skipped automatically.
"""

import argparse
import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from analytics.dataset.docile import map_docile_fields
from analytics.dataset.meta import MetaSchema

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_DATASET = REPO_ROOT / "clients" / "sample-accounting" / "docs" / "ai" / "evaluations" / "golden-dataset"


def _save_image_as_pdf(image, output_path: Path) -> None:
    """Convert PIL image to PDF using fpdf2."""
    from fpdf import FPDF
    from fpdf.enums import XPos, YPos

    pdf = FPDF()
    pdf.add_page()

    # Save image temporarily then embed
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_path = tmp.name
        image.save(tmp_path)

    pdf.image(tmp_path, x=0, y=0, w=210)  # A4 width in mm
    pdf.output(str(output_path))

    import os
    os.unlink(tmp_path)


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest DocILE sample into golden dataset")
    parser.add_argument("--sample", type=int, default=20, help="Number of cases to ingest")
    parser.add_argument("--output", default=str(DEFAULT_DATASET), help="Path to golden-dataset/")
    parser.add_argument("--start-at", type=int, default=1, dest="start_at",
                        help="First case number for naming (default: 1)")
    args = parser.parse_args()

    print("Loading DocILE dataset from HuggingFace (this may take a moment)...")
    try:
        from datasets import load_dataset
        ds = load_dataset("pero-ocr/docile", split="train", streaming=True, trust_remote_code=True)
    except Exception as e:
        print(f"ERROR: Could not load DocILE dataset: {e}")
        print("Tip: requires HuggingFace datasets library and internet access.")
        sys.exit(1)

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    ingested = skipped = 0
    n = args.start_at

    for item in ds:
        if ingested >= args.sample:
            break

        mapped = map_docile_fields(item)
        if mapped is None:
            skipped += 1
            continue

        case_id = f"docile-{n:03d}"
        case_dir = output_dir / case_id
        case_dir.mkdir(exist_ok=True)

        # input.pdf — from image field
        if "image" in item and item["image"] is not None:
            _save_image_as_pdf(item["image"], case_dir / "input.pdf")

        # expected.json
        (case_dir / "expected.json").write_text(
            json.dumps(mapped, indent=2, ensure_ascii=False)
        )

        # meta.json
        meta = MetaSchema(
            case_id=case_id,
            source="docile",
            language="cs",
            difficulty="medium",
            quality="digital",
            tags=["docile", "czech"],
            added_date=date.today().isoformat(),
            added_by="script",
        )
        (case_dir / "meta.json").write_text(
            json.dumps(meta.model_dump(), indent=2, ensure_ascii=False)
        )

        ingested += 1
        n += 1
        print(f"  Ingested {case_id}")

    print(f"\nDone — {ingested} cases ingested, {skipped} skipped (unmappable)")


if __name__ == "__main__":
    main()
