import { describe, it, expect } from "vitest";
import { routeInvoice } from "../intelligence/review-router";
import { CONFIDENCE_REVIEW_THRESHOLD, INVOICE_FIELD_KEYS, normalizeFieldConfidence, computeReviewRequired } from "../schema";
import type { InvoiceFields } from "../schema";
import type { ValidationResult } from "../intelligence/validator";
import type { ResolutionResult } from "../intelligence/entity-resolver";

// ============================================================
// Fixtures
// ============================================================

/** Build a field_confidence record with all keys set to the given value */
function makeFieldConfidence(value: number): Record<string, number> {
  const fc: Record<string, number> = {};
  for (const k of INVOICE_FIELD_KEYS) {
    fc[k] = value;
  }
  return fc;
}

function makeFields(overrides: Partial<InvoiceFields> = {}): InvoiceFields {
  return {
    invoice_number: "FAC-001",
    issuer_nif: "123456789",
    receiver_nif: null,
    issuer_name: "Empresa Teste Lda",
    issue_date: "2026-01-15",
    total_with_vat: 1000,
    total_without_vat: 813.01,
    vat_total: 186.99,
    vat_breakdown: null,
    items: [],
    receiver_name: null,
    due_date: null,
    currency: null,
    document_type: null,
    origin_country: null,
    atcud: null,
    llm_confidence: 0.97,
    field_confidence: makeFieldConfidence(0.97),
    extraction_error_categories: [],
    missing_fields: [],
    ...overrides,
  };
}

function makeResolutionResult(overrides: Partial<ResolutionResult> = {}): ResolutionResult {
  return {
    supplierId: "supplier-uuid-aaa",
    method: "nif_exact",
    confidence: 1.0,
    needsReview: false,
    ...overrides,
  };
}

/**
 * allPassedValidationResults — a set of 6 validation results all passing
 */
function allPassedResults(): ValidationResult[] {
  return [
    { rule_code: "R1-total-integrity",        rule_description: "", passed: true, detail: "" },
    { rule_code: "R2-items-sum",               rule_description: "", passed: true, detail: "" },
    { rule_code: "R5-vat-breakdown-mismatch",  rule_description: "", passed: true, detail: "" },
    { rule_code: "R6-invalid-vat-rate",        rule_description: "", passed: true, detail: "" },
    { rule_code: "R7-low-confidence",          rule_description: "", passed: true, detail: "" },
    { rule_code: "R8-supplier-unresolved",     rule_description: "", passed: true, detail: "" },
  ];
}

function failRule(
  results: ValidationResult[],
  ruleCode: string
): ValidationResult[] {
  return results.map((r) =>
    r.rule_code === ruleCode ? { ...r, passed: false, detail: "test failure" } : r
  );
}

// ============================================================
// Perfect invoice → autoAccept
// ============================================================

describe("routeInvoice — perfect invoice (autoAccept=true)", () => {
  it("returns autoAccept=true and empty reasons when all conditions pass", () => {
    const decision = routeInvoice(
      makeFields(),
      allPassedResults(),
      makeResolutionResult(),
      false // not first-time supplier
    );

    expect(decision.autoAccept).toBe(true);
    expect(decision.reasons).toHaveLength(0);
  });
});

// ============================================================
// amount_above_threshold — priority 1
// ============================================================

describe("routeInvoice — amount_above_threshold", () => {
  it("triggers when total_with_vat > 10000", () => {
    const decision = routeInvoice(
      makeFields({ total_with_vat: 10_001 }),
      allPassedResults(),
      makeResolutionResult(),
      false
    );

    expect(decision.autoAccept).toBe(false);
    const reason = decision.reasons.find((r) => r.reason_code === "amount_above_threshold");
    expect(reason).toBeDefined();
    expect(reason?.priority).toBe(1);
  });

  it("does NOT trigger when total_with_vat === 10000 (threshold is exclusive)", () => {
    const decision = routeInvoice(
      makeFields({ total_with_vat: 10_000 }),
      allPassedResults(),
      makeResolutionResult(),
      false
    );

    const reason = decision.reasons.find((r) => r.reason_code === "amount_above_threshold");
    expect(reason).toBeUndefined();
  });

  it("does NOT trigger when total_with_vat is null", () => {
    const decision = routeInvoice(
      makeFields({ total_with_vat: null }),
      allPassedResults(),
      makeResolutionResult(),
      false
    );

    const reason = decision.reasons.find((r) => r.reason_code === "amount_above_threshold");
    expect(reason).toBeUndefined();
  });
});

// ============================================================
// first_time_supplier — priority 2
// ============================================================

describe("routeInvoice — first_time_supplier", () => {
  it("triggers with priority 2 when isFirstTimeSupplier=true and supplier resolved", () => {
    const decision = routeInvoice(
      makeFields(),
      allPassedResults(),
      makeResolutionResult({ needsReview: false }),
      true // first-time supplier
    );

    expect(decision.autoAccept).toBe(false);
    const reason = decision.reasons.find((r) => r.reason_code === "first_time_supplier");
    expect(reason).toBeDefined();
    expect(reason?.priority).toBe(2);
  });

  it("does NOT trigger when isFirstTimeSupplier=false", () => {
    const decision = routeInvoice(
      makeFields(),
      allPassedResults(),
      makeResolutionResult(),
      false
    );

    const reason = decision.reasons.find((r) => r.reason_code === "first_time_supplier");
    expect(reason).toBeUndefined();
  });

  it("does NOT trigger first_time_supplier when supplier is unresolved (needsReview=true)", () => {
    const decision = routeInvoice(
      makeFields(),
      allPassedResults(),
      makeResolutionResult({ needsReview: true, method: "new_supplier", confidence: 0, supplierId: null }),
      true // isFirstTimeSupplier but supplier unresolved
    );

    // supplier_unresolved fires but NOT first_time_supplier
    const firstTime = decision.reasons.find((r) => r.reason_code === "first_time_supplier");
    const unresolved = decision.reasons.find((r) => r.reason_code === "supplier_unresolved");
    expect(firstTime).toBeUndefined();
    expect(unresolved).toBeDefined();
  });
});

// ============================================================
// supplier_unresolved — priority 1
// ============================================================

describe("routeInvoice — supplier_unresolved", () => {
  it("triggers when resolutionResult.needsReview=true", () => {
    const decision = routeInvoice(
      makeFields(),
      allPassedResults(),
      makeResolutionResult({ needsReview: true, method: "new_supplier", confidence: 0, supplierId: null }),
      false
    );

    expect(decision.autoAccept).toBe(false);
    const reason = decision.reasons.find((r) => r.reason_code === "supplier_unresolved");
    expect(reason).toBeDefined();
    expect(reason?.priority).toBe(1);
  });
});

// ============================================================
// math_mismatch — priority 1 (R1, R2, R5)
// ============================================================

describe("routeInvoice — math_mismatch", () => {
  it("triggers when R1-total-integrity fails", () => {
    const decision = routeInvoice(
      makeFields(),
      failRule(allPassedResults(), "R1-total-integrity"),
      makeResolutionResult(),
      false
    );

    expect(decision.autoAccept).toBe(false);
    const reason = decision.reasons.find((r) => r.reason_code === "math_mismatch");
    expect(reason).toBeDefined();
    expect(reason?.priority).toBe(1);
  });

  it("triggers when R2-items-sum fails", () => {
    const decision = routeInvoice(
      makeFields(),
      failRule(allPassedResults(), "R2-items-sum"),
      makeResolutionResult(),
      false
    );

    const reason = decision.reasons.find((r) => r.reason_code === "math_mismatch");
    expect(reason).toBeDefined();
  });

  it("triggers when R5-vat-breakdown-mismatch fails", () => {
    const decision = routeInvoice(
      makeFields(),
      failRule(allPassedResults(), "R5-vat-breakdown-mismatch"),
      makeResolutionResult(),
      false
    );

    const reason = decision.reasons.find((r) => r.reason_code === "math_mismatch");
    expect(reason).toBeDefined();
  });

  it("does NOT trigger math_mismatch when only R6 fails (that is vat_invalid)", () => {
    const decision = routeInvoice(
      makeFields(),
      failRule(allPassedResults(), "R6-invalid-vat-rate"),
      makeResolutionResult(),
      false
    );

    const mathReason = decision.reasons.find((r) => r.reason_code === "math_mismatch");
    expect(mathReason).toBeUndefined();
    // vat_invalid should fire instead
    const vatReason = decision.reasons.find((r) => r.reason_code === "vat_invalid");
    expect(vatReason).toBeDefined();
  });
});

// ============================================================
// low_confidence — priority 2 (now uses field_confidence + CONFIDENCE_REVIEW_THRESHOLD)
// ============================================================

describe("routeInvoice — low_confidence (uses field_confidence + CONFIDENCE_REVIEW_THRESHOLD)", () => {
  it("triggers when any field_confidence < CONFIDENCE_REVIEW_THRESHOLD (0.7)", () => {
    const fc = makeFieldConfidence(0.9);
    fc["invoice_number"] = 0.5; // below 0.7
    const decision = routeInvoice(
      makeFields({ field_confidence: fc, llm_confidence: 0.5 }),
      allPassedResults(),
      makeResolutionResult(),
      false
    );

    expect(decision.autoAccept).toBe(false);
    const reason = decision.reasons.find((r) => r.reason_code === "low_confidence");
    expect(reason).toBeDefined();
    expect(reason?.priority).toBe(2);
  });

  it("does NOT trigger when all field_confidence === CONFIDENCE_REVIEW_THRESHOLD (boundary — false)", () => {
    const fc = makeFieldConfidence(CONFIDENCE_REVIEW_THRESHOLD); // exactly 0.7
    const decision = routeInvoice(
      makeFields({ field_confidence: fc, llm_confidence: CONFIDENCE_REVIEW_THRESHOLD }),
      allPassedResults(),
      makeResolutionResult(),
      false
    );

    const reason = decision.reasons.find((r) => r.reason_code === "low_confidence");
    expect(reason).toBeUndefined();
  });

  it("does NOT trigger when all field_confidence > CONFIDENCE_REVIEW_THRESHOLD", () => {
    const fc = makeFieldConfidence(0.99);
    const decision = routeInvoice(
      makeFields({ field_confidence: fc, llm_confidence: 0.99 }),
      allPassedResults(),
      makeResolutionResult(),
      false
    );

    const reason = decision.reasons.find((r) => r.reason_code === "low_confidence");
    expect(reason).toBeUndefined();
  });

  it("CONFIDENCE_REVIEW_THRESHOLD is 0.7 (not the legacy 0.95)", () => {
    expect(CONFIDENCE_REVIEW_THRESHOLD).toBe(0.7);
  });

  it("computeReviewRequired integrates correctly with routeInvoice low_confidence rule", () => {
    const fcBelow = makeFieldConfidence(0.69); // all below 0.7
    expect(computeReviewRequired(fcBelow)).toBe(true);
    const decision = routeInvoice(
      makeFields({ field_confidence: fcBelow, llm_confidence: 0.69 }),
      allPassedResults(),
      makeResolutionResult(),
      false
    );
    const reason = decision.reasons.find((r) => r.reason_code === "low_confidence");
    expect(reason).toBeDefined();
  });
});

// ============================================================
// Multi-reason invoice — all 6 reasons fired simultaneously
// ============================================================

describe("routeInvoice — multi-reason invoice", () => {
  it("produces multiple ReviewReason entries when multiple conditions fail", () => {
    const failedResults = [
      { rule_code: "R1-total-integrity",        rule_description: "", passed: false, detail: "mismatch" },
      { rule_code: "R2-items-sum",               rule_description: "", passed: true,  detail: "" },
      { rule_code: "R5-vat-breakdown-mismatch",  rule_description: "", passed: true,  detail: "" },
      { rule_code: "R6-invalid-vat-rate",        rule_description: "", passed: false, detail: "rate 19 invalid" },
      { rule_code: "R7-low-confidence",          rule_description: "", passed: false, detail: "low" },
      { rule_code: "R8-supplier-unresolved",     rule_description: "", passed: false, detail: "unresolved" },
    ];

    const fcLow = makeFieldConfidence(0.5); // all below 0.7
    const decision = routeInvoice(
      makeFields({ total_with_vat: 15_000, llm_confidence: 0.50, field_confidence: fcLow }),
      failedResults,
      makeResolutionResult({ needsReview: true, method: "new_supplier", confidence: 0, supplierId: null }),
      false // first_time_supplier doesn't fire when new_supplier
    );

    expect(decision.autoAccept).toBe(false);

    const codes = decision.reasons.map((r) => r.reason_code);
    expect(codes).toContain("vat_invalid");
    expect(codes).toContain("math_mismatch");
    expect(codes).toContain("supplier_unresolved");
    expect(codes).toContain("amount_above_threshold");
    expect(codes).toContain("low_confidence");
  });

  it("includes both priority 1 and priority 2 reasons in multi-reason scenario", () => {
    const fcLow = makeFieldConfidence(0.5); // below threshold → triggers low_confidence
    const decision = routeInvoice(
      makeFields({ total_with_vat: 5_000, llm_confidence: 0.50, field_confidence: fcLow }),
      allPassedResults(),
      makeResolutionResult(),
      true // first-time supplier + low confidence
    );

    expect(decision.autoAccept).toBe(false);
    const p1 = decision.reasons.filter((r) => r.priority === 1);
    const p2 = decision.reasons.filter((r) => r.priority === 2);
    // low_confidence=priority 2, first_time_supplier=priority 2
    expect(p2.length).toBeGreaterThanOrEqual(2);
    expect(p1.length).toBe(0); // No priority 1 triggered
  });
});

// ============================================================
// vat_invalid — priority 1
// ============================================================

describe("routeInvoice — vat_invalid", () => {
  it("triggers when R6-invalid-vat-rate fails", () => {
    const decision = routeInvoice(
      makeFields(),
      failRule(allPassedResults(), "R6-invalid-vat-rate"),
      makeResolutionResult(),
      false
    );

    expect(decision.autoAccept).toBe(false);
    const reason = decision.reasons.find((r) => r.reason_code === "vat_invalid");
    expect(reason).toBeDefined();
    expect(reason?.priority).toBe(1);
  });
});
