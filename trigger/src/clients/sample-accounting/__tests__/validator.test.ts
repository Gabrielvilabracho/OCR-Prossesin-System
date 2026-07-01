import { describe, it, expect } from "vitest";
import { validate } from "../intelligence/validator";
import { CONFIDENCE_REVIEW_THRESHOLD, INVOICE_FIELD_KEYS } from "../schema";
import type { InvoiceFields } from "../schema";
import type { InvoiceTaxRow } from "../intelligence/tax-interpreter";
import type { ResolutionResult } from "../intelligence/entity-resolver";

// ============================================================
// Helpers
// ============================================================

/** Build a minimal valid InvoiceFields with all per-field confidences set to `confidence`. */
function makeFields(overrides: Partial<InvoiceFields> = {}): InvoiceFields {
  const fc: Record<string, number> = {};
  for (const k of INVOICE_FIELD_KEYS) {
    fc[k] = 0.97;
  }
  return {
    invoice_number:              "FAC-001",
    issuer_nif:                  "123456789",
    receiver_nif:                null,
    issuer_name:                 "Empresa Teste Lda",
    issue_date:                  "2026-01-15",
    total_with_vat:              1000,
    total_without_vat:           813.01,
    vat_total:                   186.99,
    vat_breakdown:               null,
    items:                       [],
    extraction_error_categories: [],
    llm_confidence:              0.97,
    missing_fields:              [],
    field_confidence:            fc,
    receiver_name:               null,
    due_date:                    null,
    currency:                    null,
    document_type:               null,
    origin_country:              null,
    atcud:                       null,
    ...overrides,
  };
}

/** Build a ResolutionResult with no review required by default. */
function makeResolution(overrides: Partial<ResolutionResult> = {}): ResolutionResult {
  return {
    supplierId:  "supplier-uuid-aaa",
    method:      "nif_exact",
    confidence:  1.0,
    needsReview: false,
    ...overrides,
  };
}

/** Build a valid tax row. */
function makeTaxRow(overrides: Partial<InvoiceTaxRow> = {}): InvoiceTaxRow {
  return {
    invoice_id:   "inv-test-001",
    tax_code:     "IVA",
    rate:         23,
    taxable_base: 813.01,
    tax_amount:   186.99,
    is_valid:     true,
    ...overrides,
  };
}

// ============================================================
// R7 — low-confidence (CONFIDENCE_REVIEW_THRESHOLD integration)
// ============================================================

describe("validate — R7-low-confidence", () => {
  it("passes R7 when all field_confidence values are above threshold", () => {
    const aboveThreshold: Record<string, number> = {};
    for (const k of INVOICE_FIELD_KEYS) {
      aboveThreshold[k] = 0.9; // clearly above 0.7
    }
    const fields = makeFields({ field_confidence: aboveThreshold });
    const results = validate(fields, [], makeResolution());

    const r7 = results.find((r) => r.rule_code === "R7-low-confidence");
    expect(r7).toBeDefined();
    expect(r7!.passed).toBe(true);
    expect(r7!.rule_code).toBe("R7-low-confidence");
  });

  it("fails R7 and sets review_required when any field_confidence is below threshold", () => {
    const oneBelow: Record<string, number> = {};
    for (const k of INVOICE_FIELD_KEYS) {
      oneBelow[k] = 0.9;
    }
    // set one field below threshold
    oneBelow["invoice_number"] = CONFIDENCE_REVIEW_THRESHOLD - 0.01; // 0.69 < 0.7

    const fields = makeFields({ field_confidence: oneBelow });
    const results = validate(fields, [], makeResolution());

    const r7 = results.find((r) => r.rule_code === "R7-low-confidence");
    expect(r7).toBeDefined();
    expect(r7!.passed).toBe(false); // review_required: true → passed: false
  });

  it("passes R7 at boundary: field exactly at CONFIDENCE_REVIEW_THRESHOLD (0.7) is NOT flagged", () => {
    // AC-05.4: boundary === 0.7 returns false (strict less-than, not <=)
    const atBoundary: Record<string, number> = {};
    for (const k of INVOICE_FIELD_KEYS) {
      atBoundary[k] = CONFIDENCE_REVIEW_THRESHOLD; // exactly 0.7
    }
    const fields = makeFields({ field_confidence: atBoundary });
    const results = validate(fields, [], makeResolution());

    const r7 = results.find((r) => r.rule_code === "R7-low-confidence");
    expect(r7).toBeDefined();
    expect(r7!.passed).toBe(true); // 0.7 >= 0.7 → not flagged → passed
  });

  it("uses CONFIDENCE_REVIEW_THRESHOLD constant in rule_description", () => {
    const fields = makeFields();
    const results = validate(fields, [], makeResolution());

    const r7 = results.find((r) => r.rule_code === "R7-low-confidence");
    expect(r7).toBeDefined();
    expect(r7!.rule_description).toContain(String(CONFIDENCE_REVIEW_THRESHOLD));
  });

  it("passes R7 when field_confidence is absent (empty object → no values below threshold)", () => {
    const fields = makeFields({ field_confidence: {} });
    const results = validate(fields, [], makeResolution());

    const r7 = results.find((r) => r.rule_code === "R7-low-confidence");
    expect(r7).toBeDefined();
    // computeReviewRequired({}) → no values below threshold → false → passed=true
    expect(r7!.passed).toBe(true);
  });
});

// ============================================================
// R1 — total-integrity
// ============================================================

describe("validate — R1-total-integrity", () => {
  it("passes R1 when total_without_vat + vat_total equals total_with_vat (within tolerance)", () => {
    const fields = makeFields({
      total_with_vat:    1230,
      total_without_vat: 1000,
      vat_total:         230,
    });
    const results = validate(fields, [], makeResolution());

    const r1 = results.find((r) => r.rule_code === "R1-total-integrity");
    expect(r1).toBeDefined();
    expect(r1!.passed).toBe(true);
  });

  it("fails R1 when totals are inconsistent", () => {
    const fields = makeFields({
      total_with_vat:    1230,
      total_without_vat: 1000,
      vat_total:         100, // wrong: 1000+100=1100 ≠ 1230
    });
    const results = validate(fields, [], makeResolution());

    const r1 = results.find((r) => r.rule_code === "R1-total-integrity");
    expect(r1).toBeDefined();
    expect(r1!.passed).toBe(false);
  });

  it("passes R1 (skipped) when totals are null", () => {
    const fields = makeFields({
      total_with_vat:    null,
      total_without_vat: null,
      vat_total:         null,
    });
    const results = validate(fields, [], makeResolution());

    const r1 = results.find((r) => r.rule_code === "R1-total-integrity");
    expect(r1).toBeDefined();
    expect(r1!.passed).toBe(true); // skipped → passed=true
  });
});

// ============================================================
// R8 — supplier-unresolved
// ============================================================

describe("validate — R8-supplier-unresolved", () => {
  it("passes R8 when supplier resolved without review", () => {
    const results = validate(makeFields(), [], makeResolution({ needsReview: false }));

    const r8 = results.find((r) => r.rule_code === "R8-supplier-unresolved");
    expect(r8).toBeDefined();
    expect(r8!.passed).toBe(true);
  });

  it("fails R8 when supplier resolution requires review", () => {
    const results = validate(makeFields(), [], makeResolution({ needsReview: true, method: "new_supplier" }));

    const r8 = results.find((r) => r.rule_code === "R8-supplier-unresolved");
    expect(r8).toBeDefined();
    expect(r8!.passed).toBe(false);
  });
});

// ============================================================
// validate — returns all 4+ rules in output
// ============================================================

describe("validate — output structure", () => {
  it("returns ValidationResult array with at least 4 rule entries", () => {
    const results = validate(makeFields(), [], makeResolution());

    expect(results.length).toBeGreaterThanOrEqual(4);
    for (const r of results) {
      expect(typeof r.rule_code).toBe("string");
      expect(typeof r.rule_description).toBe("string");
      expect(typeof r.passed).toBe("boolean");
      expect(typeof r.detail).toBe("string");
    }
  });

  it("includes all expected rule codes", () => {
    const results = validate(makeFields(), [makeTaxRow()], makeResolution());
    const codes = results.map((r) => r.rule_code);

    expect(codes).toContain("R1-total-integrity");
    expect(codes).toContain("R2-items-sum");
    expect(codes).toContain("R5-vat-breakdown-mismatch");
    expect(codes).toContain("R6-invalid-vat-rate");
    expect(codes).toContain("R7-low-confidence");
    expect(codes).toContain("R8-supplier-unresolved");
  });
});
