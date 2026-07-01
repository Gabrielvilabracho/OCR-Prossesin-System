import { describe, it, expect } from "vitest";
import { interpretTax } from "../intelligence/tax-interpreter";
import type { InvoiceFields } from "../schema";

// ============================================================
// Fixture helpers
// ============================================================

function makeFields(overrides: Partial<InvoiceFields> = {}): InvoiceFields {
  return {
    invoice_number: "FAC-001",
    issuer_nif: "123456789",
    receiver_nif: null,
    issuer_name: "Empresa Teste Lda",
    issue_date: "2026-01-15",
    total_with_vat: 123,
    total_without_vat: 100,
    vat_total: 23,
    vat_breakdown: null,
    items: [],
    receiver_name: null,
    due_date: null,
    currency: null,
    document_type: null,
    origin_country: null,
    atcud: null,
    llm_confidence: 0.97,
    missing_fields: [],
    extraction_error_categories: [],
    ...overrides,
  };
}

const INVOICE_ID = "invoice-uuid-aaa";

// ============================================================
// Empty / null vat_breakdown → []
// ============================================================

describe("interpretTax — empty breakdown", () => {
  it("returns [] when vat_breakdown is null", () => {
    const fields = makeFields({ vat_breakdown: null });
    expect(interpretTax(INVOICE_ID, fields)).toEqual([]);
  });

  it("returns [] when vat_breakdown is empty array", () => {
    const fields = makeFields({ vat_breakdown: [] });
    expect(interpretTax(INVOICE_ID, fields)).toEqual([]);
  });

  it("returns [] when vat_breakdown is not an array", () => {
    const fields = makeFields({ vat_breakdown: "invalid" });
    expect(interpretTax(INVOICE_ID, fields)).toEqual([]);
  });
});

// ============================================================
// Valid PT IVA rates (0, 6, 13, 23) → is_valid=true
// ============================================================

describe("interpretTax — valid PT rates", () => {
  it("marks rate=23 as is_valid=true", () => {
    const fields = makeFields({
      vat_breakdown: [{ rate: 23, taxable_base: 100, tax_amount: 23 }],
    });
    const rows = interpretTax(INVOICE_ID, fields);
    expect(rows).toHaveLength(1);
    expect(rows[0].rate).toBe(23);
    expect(rows[0].is_valid).toBe(true);
    expect(rows[0].invoice_id).toBe(INVOICE_ID);
    expect(rows[0].tax_code).toBe("IVA");
  });

  it("marks rate=13 as is_valid=true", () => {
    const fields = makeFields({
      vat_breakdown: [{ rate: 13, taxable_base: 200, tax_amount: 26 }],
    });
    const rows = interpretTax(INVOICE_ID, fields);
    expect(rows[0].rate).toBe(13);
    expect(rows[0].is_valid).toBe(true);
  });

  it("marks rate=6 as is_valid=true", () => {
    const fields = makeFields({
      vat_breakdown: [{ rate: 6, taxable_base: 50, tax_amount: 3 }],
    });
    const rows = interpretTax(INVOICE_ID, fields);
    expect(rows[0].rate).toBe(6);
    expect(rows[0].is_valid).toBe(true);
  });

  it("marks rate=0 as is_valid=true (exempt)", () => {
    const fields = makeFields({
      vat_breakdown: [{ rate: 0, taxable_base: 500, tax_amount: 0 }],
    });
    const rows = interpretTax(INVOICE_ID, fields);
    expect(rows[0].rate).toBe(0);
    expect(rows[0].is_valid).toBe(true);
  });
});

// ============================================================
// Invalid rates → is_valid=false
// ============================================================

describe("interpretTax — invalid rate → is_valid=false", () => {
  it("marks rate=19 as is_valid=false", () => {
    const fields = makeFields({
      vat_breakdown: [{ rate: 19, taxable_base: 100, tax_amount: 19 }],
    });
    const rows = interpretTax(INVOICE_ID, fields);
    expect(rows).toHaveLength(1);
    expect(rows[0].rate).toBe(19);
    expect(rows[0].is_valid).toBe(false);
  });

  it("marks rate=21 as is_valid=false", () => {
    const fields = makeFields({
      vat_breakdown: [{ rate: 21, taxable_base: 100, tax_amount: 21 }],
    });
    const rows = interpretTax(INVOICE_ID, fields);
    expect(rows[0].is_valid).toBe(false);
  });

  it("marks rate=7 as is_valid=false", () => {
    const fields = makeFields({
      vat_breakdown: [{ rate: 7, taxable_base: 100, tax_amount: 7 }],
    });
    const rows = interpretTax(INVOICE_ID, fields);
    expect(rows[0].is_valid).toBe(false);
  });
});

// ============================================================
// Multi-band breakdown
// ============================================================

describe("interpretTax — multiple bands", () => {
  it("handles mixed valid and invalid rates across multiple rows", () => {
    const fields = makeFields({
      vat_breakdown: [
        { rate: 23, taxable_base: 100, tax_amount: 23 },
        { rate: 6,  taxable_base: 50,  tax_amount: 3  },
        { rate: 19, taxable_base: 200, tax_amount: 38 }, // invalid
      ],
    });
    const rows = interpretTax(INVOICE_ID, fields);
    expect(rows).toHaveLength(3);
    expect(rows[0].is_valid).toBe(true);
    expect(rows[1].is_valid).toBe(true);
    expect(rows[2].is_valid).toBe(false);
  });

  it("sets invoice_id on all rows", () => {
    const fields = makeFields({
      vat_breakdown: [
        { rate: 23, taxable_base: 100, tax_amount: 23 },
        { rate: 6,  taxable_base: 50,  tax_amount: 3  },
      ],
    });
    const rows = interpretTax(INVOICE_ID, fields);
    for (const row of rows) {
      expect(row.invoice_id).toBe(INVOICE_ID);
    }
  });
});

// ============================================================
// Alternative key names (vat_rate, vat_amount, base)
// ============================================================

describe("interpretTax — alternative key names", () => {
  it("reads 'vat_rate' as fallback for 'rate'", () => {
    const fields = makeFields({
      vat_breakdown: [{ vat_rate: 23, taxable_base: 100, tax_amount: 23 }],
    });
    const rows = interpretTax(INVOICE_ID, fields);
    expect(rows).toHaveLength(1);
    expect(rows[0].rate).toBe(23);
  });

  it("reads 'vat_amount' as fallback for 'tax_amount'", () => {
    const fields = makeFields({
      vat_breakdown: [{ rate: 13, taxable_base: 100, vat_amount: 13 }],
    });
    const rows = interpretTax(INVOICE_ID, fields);
    expect(rows).toHaveLength(1);
    expect(rows[0].tax_amount).toBe(13);
  });

  it("reads 'base' as fallback for 'taxable_base'", () => {
    const fields = makeFields({
      vat_breakdown: [{ rate: 6, base: 200, tax_amount: 12 }],
    });
    const rows = interpretTax(INVOICE_ID, fields);
    expect(rows).toHaveLength(1);
    expect(rows[0].taxable_base).toBe(200);
  });
});

// ============================================================
// tax_code handling
// ============================================================

describe("interpretTax — tax_code resolution", () => {
  it("defaults to IVA when no tax_code present", () => {
    const fields = makeFields({
      vat_breakdown: [{ rate: 23, taxable_base: 100, tax_amount: 23 }],
    });
    const rows = interpretTax(INVOICE_ID, fields);
    expect(rows[0].tax_code).toBe("IVA");
  });

  it("preserves VAT tax_code when present", () => {
    const fields = makeFields({
      vat_breakdown: [{ rate: 23, taxable_base: 100, tax_amount: 23, tax_code: "VAT" }],
    });
    const rows = interpretTax(INVOICE_ID, fields);
    expect(rows[0].tax_code).toBe("VAT");
  });

  it("converts MWST to MwSt", () => {
    const fields = makeFields({
      vat_breakdown: [{ rate: 19, taxable_base: 100, tax_amount: 19, tax_code: "MWST" }],
    });
    const rows = interpretTax(INVOICE_ID, fields);
    expect(rows[0].tax_code).toBe("MwSt");
  });
});
