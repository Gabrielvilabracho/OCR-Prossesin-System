import { describe, it, expect } from "vitest";
import {
  InvoiceFieldsSchema,
  InvoiceItemSchema,
  SourceDocumentSchema,
  EfacturaMockResultSchema,
  ClassificationResultSchema,
  ReviewActionSchema,
  ExtractionErrorCategorySchema,
  EXTRACTION_ERROR_CATEGORY,
  CONFIDENCE_REVIEW_THRESHOLD,
  INVOICE_FIELD_KEYS,
  normalizeFieldConfidence,
  deriveGlobalConfidence,
  computeReviewRequired,
  type InvoiceFields,
  type InvoiceItem,
  type SourceDocument,
  type EfacturaMockResult,
  type ClassificationResult,
  type ReviewAction,
  type ExtractionErrorCategory,
} from "../schema";

describe("InvoiceFieldsSchema", () => {
  const validInvoiceFields = {
    invoice_number: "FT-2026/001",
    issuer_nif: "A12345678",
    receiver_nif: "B87654321",
    issuer_name: "Empresa Ficticia SL",
    issue_date: "2026-01-15",
    total_with_vat: 1210.0,
    total_without_vat: 1000.0,
    vat_total: 210.0,
    vat_breakdown: [{ rate: 21, base: 1000, amount: 210 }],
    llm_confidence: 0.95,
    missing_fields: [],
  };

  it("parses a complete valid invoice fields object", () => {
    const result = InvoiceFieldsSchema.safeParse(validInvoiceFields);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.invoice_number).toBe("FT-2026/001");
      expect(result.data.llm_confidence).toBe(0.95);
      expect(result.data.missing_fields).toEqual([]);
    }
  });

  it("allows partial extraction with missing_fields populated", () => {
    const partial = {
      invoice_number: null,
      issuer_nif: null,
      receiver_nif: null,
      issuer_name: null,
      issue_date: null,
      total_with_vat: null,
      total_without_vat: null,
      vat_total: null,
      vat_breakdown: null,
      llm_confidence: 0.1,
      missing_fields: ["invoice_number", "issuer_nif", "total_with_vat"],
    };
    const result = InvoiceFieldsSchema.safeParse(partial);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.missing_fields).toContain("invoice_number");
      expect(result.data.missing_fields).toHaveLength(3);
    }
  });

  it("rejects llm_confidence outside 0-1 range", () => {
    const invalid = { ...validInvoiceFields, llm_confidence: 1.5 };
    const result = InvoiceFieldsSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects negative llm_confidence", () => {
    const invalid = { ...validInvoiceFields, llm_confidence: -0.1 };
    const result = InvoiceFieldsSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("SourceDocumentSchema", () => {
  const validSource = {
    source_type: "drive" as const,
    source_ref: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
    file_name: "invoice-2026-001.pdf",
    pdf_bytes: Buffer.from("fake-pdf-content"),
    metadata: { folderId: "root", createdAt: "2026-01-15" },
  };

  it("parses a drive source document", () => {
    const result = SourceDocumentSchema.safeParse(validSource);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.source_type).toBe("drive");
      expect(result.data.file_name).toBe("invoice-2026-001.pdf");
    }
  });

  it("parses a gmail source document", () => {
    const gmailSource = { ...validSource, source_type: "gmail" as const };
    const result = SourceDocumentSchema.safeParse(gmailSource);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.source_type).toBe("gmail");
    }
  });

  it("rejects unknown source_type", () => {
    const invalid = { ...validSource, source_type: "ftp" };
    const result = SourceDocumentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("EfacturaMockResultSchema", () => {
  const validEfactura = {
    provider: "mock-efactura-v1",
    check_id: "chk_abc123",
    status: "matched" as const,
    matched_fields: ["nif", "total"],
    mismatch_reasons: [],
    checked_at: "2026-01-15T10:00:00Z",
    next_step: "Factura validada. Ninguna acción requerida.",
  };

  it("parses a matched efactura result", () => {
    const result = EfacturaMockResultSchema.safeParse(validEfactura);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("matched");
      expect(result.data.matched_fields).toContain("nif");
    }
  });

  it("parses a mismatch efactura result", () => {
    const mismatch = {
      ...validEfactura,
      status: "mismatch" as const,
      mismatch_reasons: ["total_with_vat differs by 0.01"],
    };
    const result = EfacturaMockResultSchema.safeParse(mismatch);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("mismatch");
      expect(result.data.mismatch_reasons).toHaveLength(1);
    }
  });

  it("rejects invalid status value", () => {
    const invalid = { ...validEfactura, status: "pending" };
    const result = EfacturaMockResultSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("ClassificationResultSchema", () => {
  it("parses status ok without reason", () => {
    const result = ClassificationResultSchema.safeParse({ status: "ok" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("ok");
    }
  });

  it("parses duplicado status with duplicate_of uuid", () => {
    const dup = {
      status: "duplicado",
      reason: "Same NIF + number + date + total",
      duplicate_of: "550e8400-e29b-41d4-a716-446655440000",
    };
    const result = ClassificationResultSchema.safeParse(dup);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("duplicado");
      expect(result.data.duplicate_of).toBe("550e8400-e29b-41d4-a716-446655440000");
    }
  });

  it("parses requires_review status with reason", () => {
    const review = {
      status: "requires_review",
      reason: "low confidence: 0.45",
    };
    const result = ClassificationResultSchema.safeParse(review);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("requires_review");
      expect(result.data.reason).toBe("low confidence: 0.45");
    }
  });

  it("rejects unknown classification status", () => {
    const result = ClassificationResultSchema.safeParse({ status: "unknown" });
    expect(result.success).toBe(false);
  });
});

describe("ReviewActionSchema", () => {
  it("parses an approved review action", () => {
    const action = {
      decision: "approved",
      reason: "All fields match original invoice",
      reviewed_by: "reviewer@example.com",
    };
    const result = ReviewActionSchema.safeParse(action);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.decision).toBe("approved");
      expect(result.data.reviewed_by).toBe("reviewer@example.com");
    }
  });

  it("parses a rejected review action with optional reason", () => {
    const action = {
      decision: "rejected",
      reviewed_by: "reviewer@example.com",
    };
    const result = ReviewActionSchema.safeParse(action);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.decision).toBe("rejected");
      expect(result.data.reason).toBeUndefined();
    }
  });

  it("rejects invalid decision value", () => {
    const invalid = {
      decision: "ignored",
      reviewed_by: "reviewer@example.com",
    };
    const result = ReviewActionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

// ============================================================
// InvoiceItemSchema — T-03
// ============================================================
describe("InvoiceItemSchema", () => {
  const validItem = {
    line_number:  1,
    description:  "Consultoria de sistemas",
    quantity:     2,
    unit_price:   500.00,
    net_amount:   1000.00,
    vat_rate:     23,
    vat_amount:   230.00,
    gross_amount: 1230.00,
  };

  it("parses a complete valid invoice item", () => {
    const result = InvoiceItemSchema.safeParse(validItem);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe("Consultoria de sistemas");
      expect(result.data.net_amount).toBe(1000.00);
      expect(result.data.vat_rate).toBe(23);
    }
  });

  it("parses item without quantity and unit_price (service invoice)", () => {
    const serviceItem = {
      line_number:  1,
      description:  "Renda mensal outubro 2026",
      quantity:     null,
      unit: null,
      unit_price:   null,
      net_amount:   1000.00,
      vat_rate:     0,
      vat_amount:   0,
      gross_amount: 1000.00,
    };
    const result = InvoiceItemSchema.safeParse(serviceItem);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.quantity).toBeNull();
      expect(result.data.unit_price).toBeNull();
    }
  });

  it("parses item with PT reduced VAT rate 6%", () => {
    const item = { ...validItem, vat_rate: 6, vat_amount: 60, gross_amount: 1060 };
    const result = InvoiceItemSchema.safeParse(item);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.vat_rate).toBe(6);
  });

  it("parses item with PT intermediate VAT rate 13%", () => {
    const item = { ...validItem, vat_rate: 13, vat_amount: 130, gross_amount: 1130 };
    const result = InvoiceItemSchema.safeParse(item);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.vat_rate).toBe(13);
  });

  it("parses item with PT normal VAT rate 23%", () => {
    const result = InvoiceItemSchema.safeParse(validItem);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.vat_rate).toBe(23);
  });

  it("rejects item missing net_amount", () => {
    const { net_amount: _, ...withoutNet } = validItem;
    const result = InvoiceItemSchema.safeParse(withoutNet);
    expect(result.success).toBe(false);
  });

  it("rejects item missing gross_amount", () => {
    const { gross_amount: _, ...withoutGross } = validItem;
    const result = InvoiceItemSchema.safeParse(withoutGross);
    expect(result.success).toBe(false);
  });

  it("rejects item with empty description", () => {
    const result = InvoiceItemSchema.safeParse({ ...validItem, description: "" });
    expect(result.success).toBe(false);
  });

  it("rejects item with non-integer line_number", () => {
    const result = InvoiceItemSchema.safeParse({ ...validItem, line_number: 1.5 });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// InvoiceFieldsSchema with items — T-04
// ============================================================
describe("InvoiceFieldsSchema with items", () => {
  const baseFields = {
    invoice_number:    "FT-2026/001",
    issuer_nif:        "123456789",
    receiver_nif:      "987654321",
    issuer_name:       "Empresa Teste Lda",
    issue_date:        "2026-01-15",
    total_with_vat:    1230.00,
    total_without_vat: 1000.00,
    vat_total:         230.00,
    vat_breakdown:     [{ rate: 23, base: 1000, amount: 230 }],
    llm_confidence:    0.95,
    missing_fields:    [],
  };

  const sampleItem = {
    line_number:  1,
    description:  "Consultoria",
    quantity:     null,
    unit_price:   null,
    net_amount:   1000.00,
    vat_rate:     23,
    vat_amount:   230.00,
    gross_amount: 1230.00,
  };

  it("parses invoice with populated items array", () => {
    const result = InvoiceFieldsSchema.safeParse({
      ...baseFields,
      items: [sampleItem, { ...sampleItem, line_number: 2, description: "Suporte" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items).toHaveLength(2);
      expect(result.data.items[0].description).toBe("Consultoria");
    }
  });

  it("parses invoice with empty items array", () => {
    const result = InvoiceFieldsSchema.safeParse({ ...baseFields, items: [] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.items).toHaveLength(0);
  });

  it("defaults items to [] when field is absent", () => {
    const result = InvoiceFieldsSchema.safeParse(baseFields);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.items).toEqual([]);
  });

  it("rejects invoice with invalid item inside items array", () => {
    const result = InvoiceFieldsSchema.safeParse({
      ...baseFields,
      items: [{ ...sampleItem, net_amount: undefined }],
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// InvoiceFieldsSchema B1 — extended header fields
// ============================================================
describe("InvoiceFieldsSchema B1 extended fields", () => {
  const baseB1 = {
    invoice_number: "FT-2026/001",
    issuer_nif: "123456789",
    receiver_nif: "987654321",
    issuer_name: "Empresa Teste Lda",
    issue_date: "2026-01-15",
    total_with_vat: 1230.00,
    total_without_vat: 1000.00,
    vat_total: 230.00,
    vat_breakdown: [{ rate: 23, base: 1000, amount: 230 }],
    llm_confidence: 0.95,
    missing_fields: [],
    items: [],
    receiver_name: "Cliente Exemplo SA",
    due_date: "2026-02-15",
    currency: "EUR",
    document_type: "fatura",
    origin_country: "PT",
    atcud: "ABCD1234-1",
  };

  it("parses all B1 fields when present", () => {
    const result = InvoiceFieldsSchema.safeParse(baseB1);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.receiver_name).toBe("Cliente Exemplo SA");
      expect(result.data.due_date).toBe("2026-02-15");
      expect(result.data.currency).toBe("EUR");
      expect(result.data.document_type).toBe("fatura");
      expect(result.data.origin_country).toBe("PT");
      expect(result.data.atcud).toBe("ABCD1234-1");
    }
  });

  it("allows all B1 fields to be null", () => {
    const nullB1 = {
      ...baseB1,
      receiver_name: null,
      due_date: null,
      currency: null,
      document_type: null,
      origin_country: null,
      atcud: null,
    };
    const result = InvoiceFieldsSchema.safeParse(nullB1);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.receiver_name).toBeNull();
      expect(result.data.atcud).toBeNull();
    }
  });

  it("allows B1 fields to be absent (backward-compat with old data)", () => {
    const withoutB1 = {
      invoice_number: "FT-2026/001",
      issuer_nif: "123456789",
      receiver_nif: null,
      issuer_name: "Empresa Teste Lda",
      issue_date: "2026-01-15",
      total_with_vat: 1230.00,
      total_without_vat: 1000.00,
      vat_total: 230.00,
      vat_breakdown: null,
      llm_confidence: 0.90,
      missing_fields: [],
    };
    const result = InvoiceFieldsSchema.safeParse(withoutB1);
    expect(result.success).toBe(true);
  });

  it("rejects due_date as a number (type enforcement)", () => {
    const result = InvoiceFieldsSchema.safeParse({ ...baseB1, due_date: 20260215 });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// ExtractionErrorCategorySchema — T-01 REQ-01
// ============================================================

describe("ExtractionErrorCategorySchema", () => {
  it("parses all valid category values", () => {
    const validValues = ["ocr_quality", "semantic", "arithmetic", "format", "missing_field"];
    for (const v of validValues) {
      const result = ExtractionErrorCategorySchema.safeParse(v);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe(v);
    }
  });

  it("rejects invalid category values", () => {
    const invalid = ["api_error", "unknown", "", "LOW_CONFIDENCE", 42, null];
    for (const v of invalid) {
      const result = ExtractionErrorCategorySchema.safeParse(v);
      expect(result.success).toBe(false);
    }
  });

  it("EXTRACTION_ERROR_CATEGORY const-object has all 5 values", () => {
    expect(EXTRACTION_ERROR_CATEGORY.OCR_QUALITY).toBe("ocr_quality");
    expect(EXTRACTION_ERROR_CATEGORY.SEMANTIC).toBe("semantic");
    expect(EXTRACTION_ERROR_CATEGORY.ARITHMETIC).toBe("arithmetic");
    expect(EXTRACTION_ERROR_CATEGORY.FORMAT).toBe("format");
    expect(EXTRACTION_ERROR_CATEGORY.MISSING_FIELD).toBe("missing_field");
  });

  it("ExtractionErrorCategory type is inferred from const-object", () => {
    // compile-time: this should not error
    const cat: ExtractionErrorCategory = EXTRACTION_ERROR_CATEGORY.OCR_QUALITY;
    expect(cat).toBe("ocr_quality");
  });
});

// ============================================================
// CONFIDENCE_REVIEW_THRESHOLD — T-01 REQ-04
// ============================================================

describe("CONFIDENCE_REVIEW_THRESHOLD", () => {
  it("is exactly 0.7", () => {
    expect(CONFIDENCE_REVIEW_THRESHOLD).toBe(0.7);
  });
});

// ============================================================
// INVOICE_FIELD_KEYS — T-02 REQ-02
// ============================================================

describe("INVOICE_FIELD_KEYS", () => {
  it("has exactly 10 canonical fields", () => {
    expect(INVOICE_FIELD_KEYS).toHaveLength(10);
  });

  it("contains all expected canonical field names", () => {
    const expected = [
      "invoice_number", "issue_date", "issuer_name", "issuer_nif",
      "receiver_name", "receiver_nif", "total_without_vat", "vat_total",
      "total_with_vat", "currency",
    ];
    for (const f of expected) {
      expect(INVOICE_FIELD_KEYS).toContain(f);
    }
  });
});

// ============================================================
// normalizeFieldConfidence — T-01 REQ-03
// ============================================================

describe("normalizeFieldConfidence", () => {
  it("fills all 10 fields with 0.5 when raw is undefined", () => {
    const result = normalizeFieldConfidence(undefined);
    expect(Object.keys(result)).toHaveLength(10);
    for (const v of Object.values(result)) {
      expect(v).toBe(0.5);
    }
  });

  it("fills all 10 fields with 0.5 when raw is empty object", () => {
    const result = normalizeFieldConfidence({});
    expect(Object.keys(result)).toHaveLength(10);
    for (const v of Object.values(result)) {
      expect(v).toBe(0.5);
    }
  });

  it("preserves existing field values and fills missing ones with 0.5", () => {
    const raw = { invoice_number: 0.9, issue_date: 0.8 };
    const result = normalizeFieldConfidence(raw);
    expect(result.invoice_number).toBe(0.9);
    expect(result.issue_date).toBe(0.8);
    // all others must be 0.5
    const others = Object.entries(result).filter(([k]) => k !== "invoice_number" && k !== "issue_date");
    for (const [, v] of others) {
      expect(v).toBe(0.5);
    }
  });

  it("returns exactly 10 keys regardless of extra keys in raw", () => {
    const raw = { invoice_number: 0.9, extra_field_unknown: 0.1 };
    const result = normalizeFieldConfidence(raw);
    expect(Object.keys(result)).toHaveLength(10);
    // extra_field_unknown must NOT appear in output
    expect("extra_field_unknown" in result).toBe(false);
  });

  it("clamps raw values to [0, 1] range by preserving them unchanged", () => {
    const raw = { invoice_number: 0.0, issue_date: 1.0 };
    const result = normalizeFieldConfidence(raw);
    expect(result.invoice_number).toBe(0.0);
    expect(result.issue_date).toBe(1.0);
  });
});

// ============================================================
// deriveGlobalConfidence — T-02 REQ-04
// ============================================================

describe("deriveGlobalConfidence", () => {
  it("weights critical fields higher than standard fields", () => {
    // Critical fields (weight 2): invoice_number, issue_date, issuer_name, issuer_nif, total_with_vat
    // Standard fields (weight 1): receiver_name, receiver_nif, total_without_vat, vat_total, currency
    // All critical at 0.9, all standard at 0.6 → weighted avg > 0.6
    const fc = {
      invoice_number: 0.9, issue_date: 0.9, issuer_name: 0.9, issuer_nif: 0.9, total_with_vat: 0.9,
      receiver_name: 0.6, receiver_nif: 0.6, total_without_vat: 0.6, vat_total: 0.6, currency: 0.6,
    };
    const result = deriveGlobalConfidence(fc);
    // weighted: (5 * 0.9 * 2 + 5 * 0.6 * 1) / (5*2 + 5*1) = (9 + 3) / 15 = 0.8
    expect(result).toBeCloseTo(0.8, 5);
  });

  it("returns 1.0 when all canonical fields are 1.0", () => {
    const fc = {
      invoice_number: 1.0, issue_date: 1.0, issuer_name: 1.0, issuer_nif: 1.0, total_with_vat: 1.0,
      receiver_name: 1.0, receiver_nif: 1.0, total_without_vat: 1.0, vat_total: 1.0, currency: 1.0,
    };
    expect(deriveGlobalConfidence(fc)).toBeCloseTo(1.0, 5);
  });

  it("defaults missing canonical fields to 0.5", () => {
    // Only invoice_number provided at 1.0, rest default to 0.5
    // Result must be between 0.5 (all defaults) and 1.0, and higher than 0.5
    // because invoice_number (weight 2, critical) is at 1.0
    const result = deriveGlobalConfidence({ invoice_number: 1.0 });
    expect(result).toBeGreaterThan(0.5);
    expect(result).toBeLessThan(1.0);
  });
});

// ============================================================
// computeReviewRequired — T-01 REQ-05
// ============================================================

describe("computeReviewRequired", () => {
  it("returns true when any field confidence < 0.7", () => {
    const fc = normalizeFieldConfidence({ invoice_number: 0.69 });
    expect(computeReviewRequired(fc)).toBe(true);
  });

  it("returns false when all fields are >= 0.7", () => {
    const fc = normalizeFieldConfidence({ invoice_number: 0.7, issue_date: 0.8 });
    // remaining fields filled with 0.5 — must be < 0.7 so use explicit high values
    const fcHigh: Record<string, number> = {};
    for (const k of INVOICE_FIELD_KEYS) {
      fcHigh[k] = 0.9;
    }
    expect(computeReviewRequired(fcHigh)).toBe(false);
  });

  it("returns false when boundary value is exactly 0.7 (strict less-than — AC-05.4)", () => {
    const fcBoundary: Record<string, number> = {};
    for (const k of INVOICE_FIELD_KEYS) {
      fcBoundary[k] = 0.7; // exactly at threshold — must NOT trigger
    }
    expect(computeReviewRequired(fcBoundary)).toBe(false);
  });

  it("returns true when one field is 0.6999 (just below boundary)", () => {
    const fc: Record<string, number> = {};
    for (const k of INVOICE_FIELD_KEYS) {
      fc[k] = 0.9;
    }
    fc["invoice_number"] = 0.6999;
    expect(computeReviewRequired(fc)).toBe(true);
  });

  it("returns true when all fields are 0.5 (default fill)", () => {
    const fc = normalizeFieldConfidence(undefined);
    expect(computeReviewRequired(fc)).toBe(true);
  });
});

// ============================================================
// InvoiceFieldsSchema — new fields (field_confidence, extraction_error_categories)
// ============================================================

describe("InvoiceFieldsSchema — field_confidence and extraction_error_categories", () => {
  const baseWithNewFields = {
    invoice_number: "FT-2026/001",
    issuer_nif: "A12345678",
    receiver_nif: "B87654321",
    issuer_name: "Empresa Teste Lda",
    issue_date: "2026-01-15",
    total_with_vat: 1210.0,
    total_without_vat: 1000.0,
    vat_total: 210.0,
    vat_breakdown: null,
    missing_fields: [],
  };

  it("parses with field_confidence as record of strings to numbers", () => {
    const result = InvoiceFieldsSchema.safeParse({
      ...baseWithNewFields,
      field_confidence: { invoice_number: 0.9, issue_date: 0.8 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.field_confidence?.invoice_number).toBe(0.9);
    }
  });

  it("parses without field_confidence (optional field)", () => {
    const result = InvoiceFieldsSchema.safeParse(baseWithNewFields);
    expect(result.success).toBe(true);
  });

  it("parses with extraction_error_categories as array of valid categories", () => {
    const result = InvoiceFieldsSchema.safeParse({
      ...baseWithNewFields,
      extraction_error_categories: ["ocr_quality", "missing_field"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.extraction_error_categories).toContain("ocr_quality");
    }
  });

  it("defaults extraction_error_categories to [] when absent", () => {
    const result = InvoiceFieldsSchema.safeParse(baseWithNewFields);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.extraction_error_categories).toEqual([]);
    }
  });

  it("rejects extraction_error_categories with invalid category value", () => {
    const result = InvoiceFieldsSchema.safeParse({
      ...baseWithNewFields,
      extraction_error_categories: ["invalid_category"],
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// MathValidationResult type
// ============================================================
import { MathValidationResultSchema, type MathValidationResult } from "../schema";

describe("MathValidationResultSchema", () => {
  it("parses a valid result with errors", () => {
    const result = MathValidationResultSchema.safeParse({ valid: false, errors: ["R1: total_integrity off by 0.50"] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(false);
      expect(result.data.errors).toHaveLength(1);
      expect(result.data.errors[0]).toContain("R1");
    }
  });

  it("parses a valid result with no errors", () => {
    const result = MathValidationResultSchema.safeParse({ valid: true, errors: [] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(true);
      expect(result.data.errors).toEqual([]);
    }
  });

  it("rejects result without valid field", () => {
    const result = MathValidationResultSchema.safeParse({ errors: [] });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// document_type enum — S3 (sample-accuracy-sprint1)
// S3.1: z.enum([...]).nullable().optional().default(null)
// S3.2: invalid value fails safeParse
// S3.3: all 7 valid values pass safeParse
// S3.4: tests cover S3.2 and S3.3
// ============================================================

const baseForDocTypeTest = {
  invoice_number: null,
  issuer_nif: null,
  receiver_nif: null,
  issuer_name: null,
  issue_date: null,
  total_with_vat: null,
  total_without_vat: null,
  vat_total: null,
  vat_breakdown: null,
  items: [],
  missing_fields: [],
  extraction_error_categories: [],
};

describe("InvoiceFieldsSchema — document_type enum (S3)", () => {
  it("S3.2: rejects 'factura_invalida' (not in enum)", () => {
    const result = InvoiceFieldsSchema.safeParse({
      ...baseForDocTypeTest,
      document_type: "factura_invalida",
    });
    expect(result.success).toBe(false);
  });

  it("S3.2: rejects 'invoice' (English term, not in enum)", () => {
    const result = InvoiceFieldsSchema.safeParse({
      ...baseForDocTypeTest,
      document_type: "invoice",
    });
    expect(result.success).toBe(false);
  });

  const validDocumentTypes = [
    "fatura",
    "fatura_simplificada",
    "fatura_recibo",
    "nota_credito",
    "nota_debito",
    "recibo",
    "proforma",
  ] as const;

  for (const docType of validDocumentTypes) {
    it(`S3.3: accepts document_type: '${docType}'`, () => {
      const result = InvoiceFieldsSchema.safeParse({
        ...baseForDocTypeTest,
        document_type: docType,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.document_type).toBe(docType);
      }
    });
  }

  it("S3.1: defaults document_type to null when field is absent", () => {
    const result = InvoiceFieldsSchema.safeParse(baseForDocTypeTest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.document_type).toBeNull();
    }
  });

  it("S3.1: accepts document_type: null explicitly", () => {
    const result = InvoiceFieldsSchema.safeParse({
      ...baseForDocTypeTest,
      document_type: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.document_type).toBeNull();
    }
  });
});

// ============================================================
// Type inference smoke tests (compile-time verification)
// ============================================================
describe("Inferred types", () => {
  it("InvoiceFields type is correctly inferred", () => {
    const fields: InvoiceFields = {
      invoice_number:              "INV-001",
      issuer_nif:                  null,
      receiver_nif:                null,
      issuer_name:                 null,
      issue_date:                  null,
      total_with_vat:              null,
      total_without_vat:           null,
      vat_total:                   null,
      vat_breakdown:               null,
      items:                       [],
      extraction_error_categories: [],
      llm_confidence:              0.5,
      missing_fields:              ["issuer_nif"],
      receiver_name:               null,
      due_date:                    null,
      currency:                    null,
      document_type:               null,
      origin_country:              null,
      atcud:                       null,
    };
    expect(fields.llm_confidence).toBe(0.5);
  });

  it("ClassificationResult type allows ok without reason", () => {
    const result: ClassificationResult = { status: "ok" };
    expect(result.status).toBe("ok");
  });

  it("InvoiceItem type is correctly inferred", () => {
    const item: InvoiceItem = {
      line_number:  1,
      description:  "Test item",
      quantity:     null,
      unit: null,
      unit_price:   null,
      net_amount:   100,
      vat_rate:     23,
      vat_amount:   23,
      gross_amount: 123,
    };
    expect(item.gross_amount).toBe(123);
  });

  it("InvoiceFields items defaults to empty array", () => {
    const fields: InvoiceFields = {
      invoice_number:              null,
      issuer_nif:                  null,
      receiver_nif:                null,
      issuer_name:                 null,
      issue_date:                  null,
      total_with_vat:              null,
      total_without_vat:           null,
      vat_total:                   null,
      vat_breakdown:               null,
      llm_confidence:              0.5,
      missing_fields:              [],
      items:                       [],
      extraction_error_categories: [],
      receiver_name:               null,
      due_date:                    null,
      currency:                    null,
      document_type:               null,
      origin_country:              null,
      atcud:                       null,
    };
    expect(fields.items).toHaveLength(0);
  });
});
