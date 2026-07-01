"""
Synthetic Portuguese invoice generation.
generate_invoice_data() is a pure function — no I/O, testable without disk.
generate_case() writes input.pdf + expected.json + meta.json to a directory.
"""

from __future__ import annotations

import json
import random
from datetime import date, timedelta
from pathlib import Path

from typing import Any

from faker import Faker
from fpdf import FPDF
from fpdf.enums import XPos, YPos

from analytics.dataset.meta import MetaSchema, generate_valid_nif

_faker_pt = Faker("pt_PT")

# Valid Portuguese VAT rates
_VAT_RATES = (0.06, 0.13, 0.23)
_DOCUMENT_TYPES = ("fatura", "fatura_simplificada", "fatura_recibo")

# Fixed item descriptions — low variability so LLM can reliably extract them
_ITEM_DESCRIPTIONS = [
    "Serviço de consultoria",
    "Material de escritório",
    "Licença de software",
    "Serviço de manutenção",
    "Formação profissional",
]


def _generate_items(rng: random.Random, vat_rate: float) -> list[dict[str, Any]]:
    """
    Generate 2-3 line items.
    net_amount = round(quantity * unit_price, 2)
    vat_amount = round(net_amount * vat_rate, 2)
    gross_amount = round(net_amount + vat_amount, 2)
    Returns list of dicts matching InvoiceItemSchema.
    """
    n_items = rng.randint(2, 3)
    vat_rate_pct = int(round(vat_rate * 100))

    descriptions = rng.sample(_ITEM_DESCRIPTIONS, k=n_items)
    items: list[dict[str, Any]] = []

    for i, desc in enumerate(descriptions, start=1):
        # Quantity: integer only — avoids LLM decimal misread (e.g. 1.9 → 1).
        # Robust for synthetic evaluation; real invoices handled by C6 correction.
        quantity = float(rng.randint(1, 10))

        # Unit price: 5.00–99.99 with 2-3 decimals
        if rng.random() < 0.5:
            unit_price = round(rng.uniform(5.0, 99.99), 2)
        else:
            unit_price = round(rng.uniform(5.0, 99.99), 3)

        net_amount = round(quantity * unit_price, 2)
        vat_amount = round(net_amount * vat_rate, 2)
        gross_amount = round(net_amount + vat_amount, 2)

        items.append({
            "line_number": i,
            "description": desc,
            "quantity": quantity,
            "unit_price": unit_price,
            "net_amount": net_amount,
            "vat_rate": vat_rate_pct,
            "vat_amount": vat_amount,
            "gross_amount": gross_amount,
        })

    return items


def generate_invoice_data(seed: int | None = None) -> dict[str, Any]:
    """
    Pure function — returns invoice field dict matching expected.json schema.
    Math invariant: total_with_vat = round(total_without_vat + vat_total, 2).
    Items drive total_without_vat: subtotal = sum(item.net_amount).
    Never generates total_with_vat independently.
    """
    rng = random.Random(seed)
    fake = Faker("pt_PT")
    if seed is not None:
        Faker.seed(seed)

    vat_rate = rng.choice(_VAT_RATES)
    vat_rate_pct = int(round(vat_rate * 100))

    # Generate items first — they drive the totals
    items = _generate_items(rng, vat_rate)

    subtotal = round(sum(item["net_amount"] for item in items), 2)
    vat = round(subtotal * vat_rate, 2)
    total = round(subtotal + vat, 2)  # ALWAYS computed from parts

    year = 2025 + rng.randint(0, 1)
    month = rng.randint(1, 12)
    day = rng.randint(1, 28)
    issue_date = date(year, month, day)

    seq = rng.randint(1, 9999)
    inv_number = f"FT {year}/{seq:04d}"

    return {
        "invoice_number": inv_number,
        "issuer_nif": generate_valid_nif(prefix_digit=rng.choice([5, 5, 5, 6, 7])),
        "receiver_nif": generate_valid_nif(prefix_digit=rng.choice([5, 5, 5, 6, 7])),
        "issuer_name": fake.company(),
        "receiver_name": fake.company(),
        "issue_date": issue_date.isoformat(),
        "due_date": (issue_date + timedelta(days=30)).isoformat(),
        "total_with_vat": total,
        "total_without_vat": subtotal,
        "vat_total": vat,
        "vat_breakdown": [{"rate": vat_rate_pct, "base": subtotal, "amount": vat}],
        "currency": "EUR",
        "document_type": rng.choice(_DOCUMENT_TYPES),
        "origin_country": "PT",
        "atcud": None,
        "items": items,
        "llm_confidence": None,
        "missing_fields": [],
    }


def _build_pdf(data: dict[str, Any], output_path: Path) -> None:
    """Create a minimal A4 PDF invoice from data dict, including items table."""
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=12)

    _HEADER_LABELS = {
        "fatura": "FATURA",
        "fatura_simplificada": "FATURA SIMPLIFICADA",
        "fatura_recibo": "FATURA-RECIBO",
        "nota_credito": "NOTA DE CRÉDITO",
        "nota_debito": "NOTA DE DÉBITO",
        "recibo": "RECIBO",
        "proforma": "PROFORMA",
    }
    header_label = _HEADER_LABELS.get(data.get("document_type", "fatura"), "FATURA")

    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, header_label, new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="C")
    pdf.ln(5)

    nx, ny = XPos.LMARGIN, YPos.NEXT
    pdf.set_font("Helvetica", size=11)
    pdf.cell(0, 8, f"Número: {data['invoice_number']}", new_x=nx, new_y=ny)
    pdf.cell(0, 8, f"Data: {data['issue_date']}", new_x=nx, new_y=ny)
    if data.get("due_date"):
        pdf.cell(0, 8, f"Vencimento: {data['due_date']}", new_x=nx, new_y=ny)
    pdf.ln(4)

    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 8, "Emitente:", new_x=nx, new_y=ny)
    pdf.set_font("Helvetica", size=11)
    pdf.cell(0, 8, f"  {data['issuer_name']}", new_x=nx, new_y=ny)
    pdf.cell(0, 8, f"  NIF: {data['issuer_nif']}", new_x=nx, new_y=ny)
    pdf.ln(4)

    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 8, "Destinatário:", new_x=nx, new_y=ny)
    pdf.set_font("Helvetica", size=11)
    pdf.cell(0, 8, f"  {data['receiver_name']}", new_x=nx, new_y=ny)
    pdf.cell(0, 8, f"  NIF: {data['receiver_nif']}", new_x=nx, new_y=ny)
    pdf.ln(8)

    # Items table
    items = data.get("items", [])
    if items:
        pdf.set_font("Helvetica", "B", 10)
        # Column widths: Descrição(70), Qtd(18), P.Unit.(28), Líq.(28), IVA%(15), Total(28)
        col_w = [70, 18, 28, 28, 15, 28]
        headers = ["Descrição", "Qtd", "P.Unit.", "Líq.", "IVA%", "Total"]
        for h, w in zip(headers, col_w):
            pdf.cell(w, 7, h, border=1, align="C")
        pdf.ln()

        pdf.set_font("Helvetica", size=10)
        for item in items:
            desc = str(item.get("description", ""))
            qty = item.get("quantity", 0)
            up = item.get("unit_price", 0)
            net = item.get("net_amount", 0)
            vat_r = item.get("vat_rate", 0)
            gross = item.get("gross_amount", 0)

            qty_str = f"{qty:.1f}" if qty != int(qty) else str(int(qty))
            up_str = f"{up:.3f}" if round(up, 2) != up else f"{up:.2f}"

            pdf.cell(col_w[0], 7, desc, border=1)
            pdf.cell(col_w[1], 7, qty_str, border=1, align="R")
            pdf.cell(col_w[2], 7, up_str, border=1, align="R")
            pdf.cell(col_w[3], 7, f"{net:.2f}", border=1, align="R")
            pdf.cell(col_w[4], 7, f"{vat_r}%", border=1, align="R")
            pdf.cell(col_w[5], 7, f"{gross:.2f}", border=1, align="R")
            pdf.ln()

        pdf.ln(4)

    # Totals section
    pdf.set_font("Helvetica", "B", 11)
    vat_breakdown = data.get("vat_breakdown")
    vat_rate_display = vat_breakdown[0]["rate"] if isinstance(vat_breakdown, list) and vat_breakdown else 23
    pdf.cell(0, 8, f"Subtotal:     EUR {data['total_without_vat']:.2f}", new_x=nx, new_y=ny)
    pdf.cell(0, 8, f"IVA ({vat_rate_display}%):  EUR {data['vat_total']:.2f}", new_x=nx, new_y=ny)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 10, f"TOTAL: EUR {data['total_with_vat']:.2f}", new_x=nx, new_y=ny)

    pdf.output(str(output_path))


def generate_case(case_dir: Path, seed: int | None, case_id: str) -> None:
    """
    Generate a single case directory with input.pdf, expected.json, meta.json.
    case_dir is created if it does not exist.
    """
    case_dir.mkdir(parents=True, exist_ok=True)

    data = generate_invoice_data(seed=seed)

    # input.pdf
    _build_pdf(data, case_dir / "input.pdf")

    # expected.json — only extractable fields (no llm_confidence, no items detail)
    expected = {k: v for k, v in data.items()
                if k not in ("llm_confidence", "missing_fields")}
    (case_dir / "expected.json").write_text(json.dumps(expected, indent=2, ensure_ascii=False))

    # meta.json
    meta = MetaSchema(
        case_id=case_id,
        source="synthetic",
        language="pt-PT",
        difficulty="easy",
        quality="digital",
        tags=[],
        added_date=date.today().isoformat(),
        added_by="script",
    )
    (case_dir / "meta.json").write_text(json.dumps(meta.model_dump(), indent=2, ensure_ascii=False))
