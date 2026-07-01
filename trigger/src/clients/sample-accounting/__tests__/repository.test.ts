import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================
// Mock @supabase/supabase-js before importing repository
// Use factory to avoid hoisting issues with vi.fn() variables
// ============================================================

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@supabase/supabase-js";
import {
  addToReviewQueue,
  checkDuplicate,
  createSupplierAlias,
  getAgingReport,
  getAllSuppliersForFuzzy,
  getCashFlow,
  getInvoiceById,
  getInvoiceIdByStoragePath,
  getSupplierAliases,
  getSupplierByNif,
  getSupplierResolutionCount,
  resolveClientId,
  resolveIssuerNifByName,
  saveAccountingClassification,
  saveExtractionRun,
  saveInvoice,
  saveInvoiceItems,
  saveInvoiceOcrText,
  saveOcrDocument,
  saveInvoiceTaxes,
  savePayment,
  saveReview,
  saveValidationResults,
  updateInvoiceStatus,
  updatePaymentStatus,
  upsertSupplier,
} from "../repository";
import {
  checkDuplicate as checkDuplicateFromInvoiceRepository,
  getInvoiceById as getInvoiceByIdFromInvoiceRepository,
  getInvoiceIdByStoragePath as getInvoiceIdByStoragePathFromInvoiceRepository,
  updateInvoiceStatus as updateInvoiceStatusFromInvoiceRepository,
  saveInvoice as saveInvoiceFromInvoiceRepository,
  saveInvoiceItems as saveInvoiceItemsFromInvoiceRepository,
} from "../repositories/invoice.repository";
import {
  getSupplierByNif as getSupplierByNifFromSupplierRepository,
  getAllSuppliersForFuzzy as getAllSuppliersForFuzzyFromSupplierRepository,
  getSupplierAliases as getSupplierAliasesFromSupplierRepository,
  upsertSupplier as upsertSupplierFromSupplierRepository,
  createSupplierAlias as createSupplierAliasFromSupplierRepository,
  resolveIssuerNifByName as resolveIssuerNifByNameFromSupplierRepository,
} from "../repositories/supplier.repository";
import {
  addToReviewQueue as addToReviewQueueFromReviewQueueRepository,
  saveReview as saveReviewFromReviewQueueRepository,
} from "../repositories/review-queue.repository";
import {
  saveInvoiceTaxes as saveInvoiceTaxesFromTaxRepository,
} from "../repositories/tax.repository";
import {
  saveValidationResults as saveValidationResultsFromValidationRepository,
} from "../repositories/validation.repository";
import {
  savePayment as savePaymentFromPaymentRepository,
  updatePaymentStatus as updatePaymentStatusFromPaymentRepository,
} from "../repositories/payment.repository";
import {
  getAgingReport as getAgingReportFromAnalyticsRepository,
  getCashFlow as getCashFlowFromAnalyticsRepository,
  getSupplierResolutionCount as getSupplierResolutionCountFromAnalyticsRepository,
} from "../repositories/analytics.repository";
import {
  saveAccountingClassification as saveAccountingClassificationFromAccountingRepository,
} from "../repositories/accounting-classification.repository";
import {
  saveOcrDocument as saveOcrDocumentFromOcrRepository,
  saveExtractionRun as saveExtractionRunFromOcrRepository,
  saveInvoiceOcrText as saveInvoiceOcrTextFromOcrRepository,
} from "../repositories/ocr.repository";
import {
  resolveClientId as resolveClientIdFromClientRepository,
} from "../repositories/client.repository";
import { buildInvoiceInsert, buildInvoiceItemRows } from "../repositories/mappers";
import type { InvoiceFields, InvoiceItem, OcrDocumentInsert, ExtractionRunInsert } from "../schema";

const mockCreateClient = vi.mocked(createClient);

// ============================================================
// Helpers
// ============================================================

function makeChain(overrides: Record<string, unknown> = {}) {
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: "supplier-uuid-123" }, error: null }),
    ...overrides,
  };
}

function makeDb(chain: ReturnType<typeof makeChain>) {
  return { from: vi.fn().mockReturnValue(chain) };
}

const sampleItems: InvoiceItem[] = [
  {
    line_number:  1,
    description:  "Consultoria de sistemas",
    quantity:     2,
    unit:         null,
    unit_price:   500,
    net_amount:   1000,
    vat_rate:     23,
    vat_amount:   230,
    gross_amount: 1230,
  },
  {
    line_number:  2,
    description:  "Suporte técnico",
    quantity:     null,
    unit:         null,
    unit_price:   null,
    net_amount:   200,
    vat_rate:     23,
    vat_amount:   46,
    gross_amount: 246,
  },
];

const completeInvoiceFields: InvoiceFields = {
  invoice_number: "FT-2026-001",
  issuer_nif: "123456789",
  receiver_nif: "987654321",
  issuer_name: "Fornecedor Teste Lda",
  issue_date: "2026-01-15",
  total_with_vat: 1230,
  total_without_vat: 1000,
  vat_total: 230,
  vat_breakdown: [{ rate: 23, base: 1000, amount: 230 }],
  items: sampleItems,
  receiver_name: "Sample Accounting Client",
  due_date: "2026-02-15",
  currency: "EUR",
  document_type: "fatura",
  origin_country: "PT",
  atcud: "ATCUD-123",
  llm_confidence: 0.94,
  missing_fields: [],
  field_confidence: { invoice_number: 0.99 },
  extraction_error_categories: [],
};

const efacturaResult = {
  provider: "mock",
  check_id: "check-001",
  status: "matched" as const,
  matched_fields: ["invoice_number"],
  mismatch_reasons: [],
  checked_at: "2026-01-15T12:00:00.000Z",
  next_step: "continue",
};

describe("invoice.repository — Phase 3.5 split compatibility", () => {
  it("keeps repository.ts invoice query/status exports wired to the extracted module", () => {
    expect(checkDuplicate).toBe(checkDuplicateFromInvoiceRepository);
    expect(getInvoiceById).toBe(getInvoiceByIdFromInvoiceRepository);
    expect(getInvoiceIdByStoragePath).toBe(getInvoiceIdByStoragePathFromInvoiceRepository);
    expect(updateInvoiceStatus).toBe(updateInvoiceStatusFromInvoiceRepository);
  });
});

describe("invoice.repository — Phase 3.6 PR 2 split compatibility", () => {
  it("keeps repository.ts saveInvoice and saveInvoiceItems exports wired to the extracted module", () => {
    expect(saveInvoice).toBe(saveInvoiceFromInvoiceRepository);
    expect(saveInvoiceItems).toBe(saveInvoiceItemsFromInvoiceRepository);
  });
});

describe("supplier.repository — Phase 3.5 split compatibility", () => {
  it("keeps repository.ts supplier exports wired to the extracted module", () => {
    expect(getSupplierByNif).toBe(getSupplierByNifFromSupplierRepository);
    expect(getAllSuppliersForFuzzy).toBe(getAllSuppliersForFuzzyFromSupplierRepository);
    expect(getSupplierAliases).toBe(getSupplierAliasesFromSupplierRepository);
    expect(upsertSupplier).toBe(upsertSupplierFromSupplierRepository);
    expect(createSupplierAlias).toBe(createSupplierAliasFromSupplierRepository);
    expect(resolveIssuerNifByName).toBe(resolveIssuerNifByNameFromSupplierRepository);
  });
});

describe("review-queue.repository — Phase 3.5 split compatibility", () => {
  it("keeps repository.ts review-queue exports wired to the extracted module", () => {
    expect(addToReviewQueue).toBe(addToReviewQueueFromReviewQueueRepository);
  });
});

describe("review-queue.repository — Phase 3.6 PR 2 split compatibility", () => {
  it("keeps repository.ts saveReview export wired to the extracted module", () => {
    expect(saveReview).toBe(saveReviewFromReviewQueueRepository);
  });
});

describe("tax.repository — Phase 3.5 split compatibility", () => {
  it("keeps repository.ts tax exports wired to the extracted module", () => {
    expect(saveInvoiceTaxes).toBe(saveInvoiceTaxesFromTaxRepository);
  });
});

describe("validation.repository — Phase 3.5 split compatibility", () => {
  it("keeps repository.ts validation exports wired to the extracted module", () => {
    expect(saveValidationResults).toBe(saveValidationResultsFromValidationRepository);
  });
});

describe("payment.repository — Phase 3.5 split compatibility (Slice 5)", () => {
  it("keeps repository.ts payment exports wired to the extracted module", () => {
    expect(savePayment).toBe(savePaymentFromPaymentRepository);
    expect(updatePaymentStatus).toBe(updatePaymentStatusFromPaymentRepository);
  });
});

describe("analytics.repository — Phase 3.5 split compatibility (Slice 6)", () => {
  it("keeps repository.ts analytics exports wired to the extracted module", () => {
    expect(getAgingReport).toBe(getAgingReportFromAnalyticsRepository);
    expect(getCashFlow).toBe(getCashFlowFromAnalyticsRepository);
    expect(getSupplierResolutionCount).toBe(getSupplierResolutionCountFromAnalyticsRepository);
  });
});

describe("accounting-classification.repository — Phase 3.5 split compatibility (Slice 6)", () => {
  it("keeps repository.ts accounting-classification export wired to the extracted module", () => {
    expect(saveAccountingClassification).toBe(saveAccountingClassificationFromAccountingRepository);
  });
});

describe("ocr.repository — Phase 3.6 PR 2 split compatibility", () => {
  it("keeps repository.ts OCR exports wired to the extracted module", () => {
    expect(saveOcrDocument).toBe(saveOcrDocumentFromOcrRepository);
    expect(saveExtractionRun).toBe(saveExtractionRunFromOcrRepository);
    expect(saveInvoiceOcrText).toBe(saveInvoiceOcrTextFromOcrRepository);
  });
});

describe("client.repository — Phase 3.6 PR 2 split compatibility", () => {
  it("keeps repository.ts resolveClientId export wired to the extracted module", () => {
    expect(resolveClientId).toBe(resolveClientIdFromClientRepository);
  });
});

// ============================================================
// Phase 3.1 — repository characterization baseline
// ============================================================

describe("checkDuplicate — Phase 3.1 baseline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SUPABASE_URL"] = "https://test.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-key";
  });

  it("returns duplicate by document_hash before checking business key", async () => {
    const hashChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [{ id: "invoice-hash-1" }], error: null }),
    };
    const fromMock = vi.fn().mockReturnValue(hashChain);
    mockCreateClient.mockReturnValue({ from: fromMock } as unknown as ReturnType<typeof createClient>);

    const result = await checkDuplicate("hash-123", "123456789", "FT-1", "2026-01-15", 123);

    expect(result).toEqual({ isDuplicate: true, duplicateOf: "invoice-hash-1" });
    expect(hashChain.eq).toHaveBeenCalledWith("document_hash", "hash-123");
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to business key when document_hash has no match", async () => {
    const hashChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const businessChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [{ id: "invoice-business-1" }], error: null }),
    };
    const fromMock = vi.fn().mockReturnValueOnce(hashChain).mockReturnValueOnce(businessChain);
    mockCreateClient.mockReturnValue({ from: fromMock } as unknown as ReturnType<typeof createClient>);

    const result = await checkDuplicate("hash-456", "123456789", "FT-2", "2026-01-16", 456);

    expect(result).toEqual({ isDuplicate: true, duplicateOf: "invoice-business-1" });
    expect(businessChain.eq).toHaveBeenCalledWith("issuer_nif", "123456789");
    expect(businessChain.eq).toHaveBeenCalledWith("invoice_number", "FT-2");
    expect(businessChain.eq).toHaveBeenCalledWith("issue_date", "2026-01-16");
    expect(businessChain.eq).toHaveBeenCalledWith("total_with_vat", 456);
    expect(businessChain.neq).toHaveBeenCalledWith("processing_status", "duplicado");
  });

  it("returns non-duplicate when business key is incomplete", async () => {
    const hashChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const fromMock = vi.fn().mockReturnValue(hashChain);
    mockCreateClient.mockReturnValue({ from: fromMock } as unknown as ReturnType<typeof createClient>);

    const result = await checkDuplicate("hash-789", null, "FT-3", "2026-01-17", 789);

    expect(result).toEqual({ isDuplicate: false });
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it("excludes the provided invoice id from duplicate queries", async () => {
    const hashChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const businessChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValueOnce(hashChain).mockReturnValueOnce(businessChain),
    } as unknown as ReturnType<typeof createClient>);

    const result = await checkDuplicate("hash-x", "123456789", "FT-X", "2026-01-18", 100, "invoice-current");

    expect(result).toEqual({ isDuplicate: false });
    expect(hashChain.neq).toHaveBeenCalledWith("id", "invoice-current");
    expect(businessChain.neq).toHaveBeenCalledWith("id", "invoice-current");
  });
});

describe("saveInvoice — Phase 3.1 baseline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SUPABASE_URL"] = "https://test.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-key";
  });

  it("inserts the invoice payload and returns its id", async () => {
    const singleMock = vi.fn().mockResolvedValue({ data: { id: "invoice-new-1" }, error: null });
    const chain = { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: singleMock };
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue(chain) } as unknown as ReturnType<typeof createClient>);
    const payload = buildInvoiceInsert({
      sourceType: "drive",
      sourceRef: "file-1",
      fileName: "invoice.pdf",
      documentHash: "hash-save",
      fields: completeInvoiceFields,
      efacturaResult,
      classification: { status: "ok" },
    });

    const id = await saveInvoice(payload);

    expect(id).toBe("invoice-new-1");
    expect(chain.insert).toHaveBeenCalledWith(payload);
    expect(chain.select).toHaveBeenCalledWith("id");
  });

  it("throws current Supabase error message when insert fails", async () => {
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: "insert failed" } }),
    };
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue(chain) } as unknown as ReturnType<typeof createClient>);

    await expect(saveInvoice({ source_type: "drive", source_ref: "f", file_name: "f.pdf", document_hash: "h", processing_status: "ok" })).rejects.toThrow("insert failed");
  });
});

describe("updateInvoiceStatus — Phase 3.1 baseline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SUPABASE_URL"] = "https://test.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-key";
  });

  it("updates processing_status, updated_at, and extra fields", async () => {
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue({ update: updateMock }) } as unknown as ReturnType<typeof createClient>);

    await updateInvoiceStatus("invoice-1", "requires_review", { review_reason: "low_confidence" });

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      processing_status: "requires_review",
      review_reason: "low_confidence",
      updated_at: expect.any(String),
    }));
  });

  it("throws current Supabase error message when update fails", async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: { message: "update failed" } });
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue({ update: vi.fn().mockReturnValue({ eq: eqMock }) }) } as unknown as ReturnType<typeof createClient>);

    await expect(updateInvoiceStatus("invoice-2", "failed")).rejects.toThrow("update failed");
  });
});

describe("saveReview — Phase 3.1 baseline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SUPABASE_URL"] = "https://test.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-key";
  });

  it("inserts an invoice review decision", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue({ insert: insertMock }) } as unknown as ReturnType<typeof createClient>);

    await saveReview({ invoice_id: "invoice-1", decision: "approved", reviewed_by: "ops", reason: "ok" });

    expect(insertMock).toHaveBeenCalledWith({ invoice_id: "invoice-1", decision: "approved", reviewed_by: "ops", reason: "ok" });
  });

  it("throws current Supabase error message when review insert fails", async () => {
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: { message: "review failed" } }) }) } as unknown as ReturnType<typeof createClient>);

    await expect(saveReview({ invoice_id: "invoice-2", decision: "rejected", reviewed_by: "ops" })).rejects.toThrow("review failed");
  });
});

describe("buildInvoiceInsert — Phase 3.1/3.4 mapper baseline", () => {
  it("maps complete extracted fields into invoice insert payload", () => {
    const result = buildInvoiceInsert({
      sourceType: "drive",
      sourceRef: "file-1",
      fileName: "factura.pdf",
      documentHash: "hash-1",
      fields: completeInvoiceFields,
      efacturaResult,
      classification: { status: "requires_review", reason: "missing receiver", duplicate_of: "11111111-1111-4111-8111-111111111111" },
    });

    expect(result).toEqual(expect.objectContaining({
      source_type: "drive",
      source_ref: "file-1",
      file_name: "factura.pdf",
      document_hash: "hash-1",
      processing_status: "requires_review",
      invoice_number: "FT-2026-001",
      receiver_name: "Sample Accounting Client",
      due_date: "2026-02-15",
      currency: "EUR",
      document_type: "fatura",
      duplicate_of: "11111111-1111-4111-8111-111111111111",
      review_reason: "missing receiver",
      raw_extraction: completeInvoiceFields,
      efactura_result: efacturaResult,
    }));
  });

  it("normalizes optional extended fields and classification metadata to null", () => {
    const fields = { ...completeInvoiceFields, receiver_name: null, due_date: null, currency: null, document_type: null, origin_country: null, atcud: null };

    const result = buildInvoiceInsert({
      sourceType: "gmail",
      sourceRef: "msg-1",
      fileName: "gmail.pdf",
      documentHash: "hash-2",
      fields,
      efacturaResult,
      classification: { status: "ok" },
    });

    expect(result).toEqual(expect.objectContaining({
      receiver_name: null,
      due_date: null,
      currency: null,
      document_type: null,
      origin_country: null,
      atcud: null,
      duplicate_of: null,
      review_reason: null,
    }));
  });

  it("maps manual source and ok classification into insert payload", () => {
    const params = {
      sourceType: "manual" as const,
      sourceRef: "manual-1",
      fileName: "manual.pdf",
      documentHash: "hash-3",
      fields: completeInvoiceFields,
      efacturaResult,
      classification: { status: "ok" as const },
    };

    const result = buildInvoiceInsert(params);
    expect(result).toEqual(expect.objectContaining({
      source_type: "manual",
      source_ref: "manual-1",
      file_name: "manual.pdf",
      document_hash: "hash-3",
      processing_status: "ok",
    }));
  });

  it("preserves null-normalization behavior for optional fields", () => {
    const fields = { ...completeInvoiceFields, receiver_name: null, due_date: null, currency: null, document_type: null, origin_country: null, atcud: null };
    const params = {
      sourceType: "storage" as const,
      sourceRef: "storage-1",
      fileName: "storage.pdf",
      documentHash: "hash-4",
      fields,
      efacturaResult,
      classification: { status: "duplicado" as const, duplicate_of: "22222222-2222-4222-8222-222222222222" },
    };

    const result = buildInvoiceInsert(params);
    expect(result).toEqual(expect.objectContaining({
      source_type: "storage",
      processing_status: "duplicado",
      duplicate_of: "22222222-2222-4222-8222-222222222222",
      receiver_name: null,
      due_date: null,
      currency: null,
      document_type: null,
      origin_country: null,
      atcud: null,
    }));
  });
});

describe("tax, validation, review, and payment repositories — Phase 3.1 baseline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SUPABASE_URL"] = "https://test.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-key";
  });

  it("saveInvoiceTaxes replaces existing rows then inserts mapped tax rows", async () => {
    const deleteEqMock = vi.fn().mockResolvedValue({ error: null });
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const fromMock = vi.fn()
      .mockReturnValueOnce({ delete: vi.fn().mockReturnValue({ eq: deleteEqMock }) })
      .mockReturnValueOnce({ insert: insertMock });
    mockCreateClient.mockReturnValue({ from: fromMock } as unknown as ReturnType<typeof createClient>);

    await saveInvoiceTaxes([{ invoice_id: "invoice-1", tax_code: "IVA", rate: 23, taxable_base: 100, tax_amount: 23, is_valid: true }]);

    expect(fromMock).toHaveBeenCalledWith("invoice_taxes");
    expect(deleteEqMock).toHaveBeenCalledWith("invoice_id", "invoice-1");
    expect(insertMock).toHaveBeenCalledWith([{ invoice_id: "invoice-1", tax_code: "IVA", rate: 23, taxable_base: 100, tax_amount: 23, is_valid: true }]);
  });

  it("saveInvoiceTaxes is a no-op for empty tax rows", async () => {
    await saveInvoiceTaxes([]);

    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("saveValidationResults replaces existing rows then inserts validation details", async () => {
    const deleteEqMock = vi.fn().mockResolvedValue({ error: null });
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const fromMock = vi.fn()
      .mockReturnValueOnce({ delete: vi.fn().mockReturnValue({ eq: deleteEqMock }) })
      .mockReturnValueOnce({ insert: insertMock });
    mockCreateClient.mockReturnValue({ from: fromMock } as unknown as ReturnType<typeof createClient>);

    await saveValidationResults("invoice-1", [{ rule_code: "MATH_OK", rule_description: "Totals match", passed: true, detail: "ok" }]);

    expect(deleteEqMock).toHaveBeenCalledWith("invoice_id", "invoice-1");
    expect(insertMock).toHaveBeenCalledWith([{ invoice_id: "invoice-1", rule_code: "MATH_OK", rule_description: "Totals match", passed: true, detail: "ok" }]);
  });

  it("saveValidationResults is a no-op for empty validation results", async () => {
    await saveValidationResults("invoice-1", []);

    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("addToReviewQueue inserts pending status by default", async () => {
    const singleMock = vi.fn().mockResolvedValue({ data: { id: "review-queue-1" }, error: null });
    const insertMock = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleMock }) });
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue({ insert: insertMock }) } as unknown as ReturnType<typeof createClient>);

    const id = await addToReviewQueue({ invoice_id: "invoice-1", reason_code: "low_confidence", priority: 2 });

    expect(id).toBe("review-queue-1");
    expect(insertMock).toHaveBeenCalledWith({ invoice_id: "invoice-1", reason_code: "low_confidence", priority: 2, status: "pending" });
  });

  it("savePayment inserts optional payment fields with null defaults", async () => {
    const singleMock = vi.fn().mockResolvedValue({ data: { id: "payment-1" }, error: null });
    const insertMock = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleMock }) });
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue({ insert: insertMock }) } as unknown as ReturnType<typeof createClient>);

    const id = await savePayment({ invoice_id: "invoice-1", amount_paid: 123.45, payment_date: "2026-01-20" });

    expect(id).toBe("payment-1");
    expect(insertMock).toHaveBeenCalledWith({ invoice_id: "invoice-1", amount_paid: 123.45, payment_date: "2026-01-20", payment_method: null, reference: null });
  });

  it("updatePaymentStatus updates invoice payment fields and updated_at", async () => {
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue({ update: updateMock }) } as unknown as ReturnType<typeof createClient>);

    await updatePaymentStatus("invoice-1", "partial", 50, 73.45);

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ payment_status: "partial", amount_paid: 50, amount_due: 73.45, updated_at: expect.any(String) }));
  });

  it("updatePaymentStatus throws current Supabase error message on failure", async () => {
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: { message: "payment update failed" } }) });
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue({ update: updateMock }) } as unknown as ReturnType<typeof createClient>);

    await expect(updatePaymentStatus("invoice-2", "paid", 100, 0)).rejects.toThrow("payment update failed");
  });
});

describe("invoice lookup and supplier fuzzy helpers — Phase 3.1 baseline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SUPABASE_URL"] = "https://test.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-key";
  });

  it("getInvoiceById returns minimal invoice fields", async () => {
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: "invoice-1", issuer_nif: "123", issuer_name: "Supplier", supplier_id: "supplier-1" }, error: null }) };
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue(chain) } as unknown as ReturnType<typeof createClient>);

    const result = await getInvoiceById("invoice-1");

    expect(result).toEqual({ id: "invoice-1", issuer_nif: "123", issuer_name: "Supplier", supplier_id: "supplier-1" });
    expect(chain.select).toHaveBeenCalledWith("id, issuer_nif, issuer_name, supplier_id");
  });

  it("getInvoiceById returns null when no invoice exists", async () => {
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue(chain) } as unknown as ReturnType<typeof createClient>);

    await expect(getInvoiceById("missing")).resolves.toBeNull();
  });

  it("getInvoiceById throws current Supabase error message", async () => {
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: "lookup failed" } }) };
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue(chain) } as unknown as ReturnType<typeof createClient>);

    await expect(getInvoiceById("invoice-err")).rejects.toThrow("lookup failed");
  });

  it("getAllSuppliersForFuzzy returns suppliers with normalized_name", async () => {
    const rows = [{ id: "supplier-1", normalized_name: "supplier one" }];
    const chain = { select: vi.fn().mockReturnThis(), not: vi.fn().mockResolvedValue({ data: rows, error: null }) };
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue(chain) } as unknown as ReturnType<typeof createClient>);

    const result = await getAllSuppliersForFuzzy();

    expect(result).toEqual(rows);
    expect(chain.not).toHaveBeenCalledWith("normalized_name", "is", null);
  });

  it("getAllSuppliersForFuzzy throws current Supabase error message", async () => {
    const chain = { select: vi.fn().mockReturnThis(), not: vi.fn().mockResolvedValue({ data: null, error: { message: "supplier scan failed" } }) };
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue(chain) } as unknown as ReturnType<typeof createClient>);

    await expect(getAllSuppliersForFuzzy()).rejects.toThrow("supplier scan failed");
  });
});

// ============================================================
// Phase 3.3 — P1/P2 repository characterization baseline
// ============================================================

describe("P1/P2 invoice and analytics repository helpers — Phase 3.3", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SUPABASE_URL"] = "https://test.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-key";
  });

  it("getInvoiceIdByStoragePath returns invoice id for existing storage_path", async () => {
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: "invoice-storage-1" }, error: null }) };
    const schemaMock = vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue(chain) });
    mockCreateClient.mockReturnValue({ schema: schemaMock } as unknown as ReturnType<typeof createClient>);

    await expect(getInvoiceIdByStoragePath("invoices/client/file.pdf")).resolves.toBe("invoice-storage-1");
    expect(schemaMock).toHaveBeenCalledWith("facturas");
    expect(chain.eq).toHaveBeenCalledWith("storage_path", "invoices/client/file.pdf");
  });

  it("getInvoiceIdByStoragePath returns null when no storage path matches", async () => {
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    mockCreateClient.mockReturnValue({ schema: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue(chain) }) } as unknown as ReturnType<typeof createClient>);

    await expect(getInvoiceIdByStoragePath("missing.pdf")).resolves.toBeNull();
  });

  it("getInvoiceIdByStoragePath throws current Supabase error message", async () => {
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: "storage lookup failed" } }) };
    mockCreateClient.mockReturnValue({ schema: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue(chain) }) } as unknown as ReturnType<typeof createClient>);

    await expect(getInvoiceIdByStoragePath("bad.pdf")).rejects.toThrow("storage lookup failed");
  });

  it("getAgingReport returns rows from v_aging_report", async () => {
    const rows = [{ bucket: "current", invoice_count: 2, total_amount_due: 300 }];
    const chain = { select: vi.fn().mockResolvedValue({ data: rows, error: null }) };
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue(chain) } as unknown as ReturnType<typeof createClient>);

    await expect(getAgingReport()).resolves.toEqual(rows);
  });

  it("getAgingReport returns empty array when data is null", async () => {
    const chain = { select: vi.fn().mockResolvedValue({ data: null, error: null }) };
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue(chain) } as unknown as ReturnType<typeof createClient>);

    await expect(getAgingReport()).resolves.toEqual([]);
  });

  it("getAgingReport throws current Supabase error message", async () => {
    const chain = { select: vi.fn().mockResolvedValue({ data: null, error: { message: "aging failed" } }) };
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue(chain) } as unknown as ReturnType<typeof createClient>);

    await expect(getAgingReport()).rejects.toThrow("aging failed");
  });

  it("getCashFlow returns rows from v_cash_flow", async () => {
    const rows = [{ month: "2026-01-01", invoice_count: 3, total_outflow: 450 }];
    const chain = { select: vi.fn().mockResolvedValue({ data: rows, error: null }) };
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue(chain) } as unknown as ReturnType<typeof createClient>);

    await expect(getCashFlow()).resolves.toEqual(rows);
  });

  it("getCashFlow returns empty array when data is null", async () => {
    const chain = { select: vi.fn().mockResolvedValue({ data: null, error: null }) };
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue(chain) } as unknown as ReturnType<typeof createClient>);

    await expect(getCashFlow()).resolves.toEqual([]);
  });

  it("getCashFlow throws current Supabase error message", async () => {
    const chain = { select: vi.fn().mockResolvedValue({ data: null, error: { message: "cash flow failed" } }) };
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue(chain) } as unknown as ReturnType<typeof createClient>);

    await expect(getCashFlow()).rejects.toThrow("cash flow failed");
  });

  it("getSupplierResolutionCount returns exact auto-resolution count", async () => {
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    chain.eq = vi.fn().mockReturnValueOnce(chain).mockResolvedValueOnce({ count: 2, error: null });
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue(chain) } as unknown as ReturnType<typeof createClient>);

    await expect(getSupplierResolutionCount("supplier-1")).resolves.toBe(2);
    expect(chain.select).toHaveBeenCalledWith("*", { count: "exact", head: true });
  });

  it("getSupplierResolutionCount returns 0 when count is null", async () => {
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    chain.eq = vi.fn().mockReturnValueOnce(chain).mockResolvedValueOnce({ count: null, error: null });
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue(chain) } as unknown as ReturnType<typeof createClient>);

    await expect(getSupplierResolutionCount("supplier-2")).resolves.toBe(0);
  });

  it("getSupplierResolutionCount throws current Supabase error message", async () => {
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    chain.eq = vi.fn().mockReturnValueOnce(chain).mockResolvedValueOnce({ count: null, error: { message: "count failed" } });
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue(chain) } as unknown as ReturnType<typeof createClient>);

    await expect(getSupplierResolutionCount("supplier-3")).rejects.toThrow("count failed");
  });

  it("saveAccountingClassification inserts explicit accounting classification fields", async () => {
    const singleMock = vi.fn().mockResolvedValue({ data: { id: "classification-1" }, error: null });
    const insertMock = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleMock }) });
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue({ insert: insertMock }) } as unknown as ReturnType<typeof createClient>);

    const id = await saveAccountingClassification({ invoice_id: "invoice-1", gl_account_id: "gl-1", category_id: "cat-1", amount: 100, classification_confidence: 0.91, classified_by: "human" });

    expect(id).toBe("classification-1");
    expect(insertMock).toHaveBeenCalledWith({ invoice_id: "invoice-1", gl_account_id: "gl-1", category_id: "cat-1", amount: 100, classification_confidence: 0.91, classified_by: "human" });
  });

  it("saveAccountingClassification defaults optional fields for auto classification", async () => {
    const singleMock = vi.fn().mockResolvedValue({ data: { id: "classification-2" }, error: null });
    const insertMock = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleMock }) });
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue({ insert: insertMock }) } as unknown as ReturnType<typeof createClient>);

    await saveAccountingClassification({ invoice_id: "invoice-2", gl_account_id: "gl-2", amount: 50 });

    expect(insertMock).toHaveBeenCalledWith({ invoice_id: "invoice-2", gl_account_id: "gl-2", category_id: null, amount: 50, classification_confidence: null, classified_by: "auto" });
  });

  it("saveAccountingClassification throws current Supabase error message", async () => {
    const singleMock = vi.fn().mockResolvedValue({ data: null, error: { message: "classification failed" } });
    const insertMock = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleMock }) });
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue({ insert: insertMock }) } as unknown as ReturnType<typeof createClient>);

    await expect(saveAccountingClassification({ invoice_id: "bad", gl_account_id: "gl", amount: 1 })).rejects.toThrow("classification failed");
  });
});

describe("buildInvoiceItemRows — Phase 3.4b mapper baseline", () => {
  it("maps invoice items to insert rows with invoice and supplier ids", () => {
    const result = buildInvoiceItemRows({ invoiceId: "invoice-1", supplierId: "supplier-1", items: sampleItems });

    expect(result).toEqual([
      { invoice_id: "invoice-1", supplier_id: "supplier-1", line_number: 1, description: "Consultoria de sistemas", quantity: 2, unit: null, unit_price: 500, net_amount: 1000, vat_rate: 23, vat_amount: 230, gross_amount: 1230 },
      { invoice_id: "invoice-1", supplier_id: "supplier-1", line_number: 2, description: "Suporte técnico", quantity: null, unit: null, unit_price: null, net_amount: 200, vat_rate: 23, vat_amount: 46, gross_amount: 246 },
    ]);
  });

  it("normalizes item units while preserving numeric values", () => {
    const result = buildInvoiceItemRows({
      invoiceId: "invoice-2",
      supplierId: "supplier-2",
      items: [{ ...sampleItems[0], unit: "kg" }],
    });

    expect(result[0]).toEqual(expect.objectContaining({ unit: "KG", quantity: 2, unit_price: 500, gross_amount: 1230 }));
  });
});

// ============================================================
// upsertSupplier — T-10
// ============================================================

describe("upsertSupplier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SUPABASE_URL"] = "https://test.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-key";
  });

  it("upserts a new supplier and returns its UUID", async () => {
    const chain = makeChain();
    mockCreateClient.mockReturnValue(makeDb(chain) as unknown as ReturnType<typeof createClient>);

    const id = await upsertSupplier("123456789", "Empresa Teste Lda");

    expect(chain.upsert).toHaveBeenCalled();
    expect(id).toBe("supplier-uuid-123");
  });

  it("returns existing supplier UUID when NIF already exists", async () => {
    const chain = makeChain({
      single: vi.fn().mockResolvedValue({ data: { id: "existing-uuid-456" }, error: null }),
    });
    mockCreateClient.mockReturnValue(makeDb(chain) as unknown as ReturnType<typeof createClient>);

    const id = await upsertSupplier("123456789", "Empresa Teste Lda");

    expect(id).toBe("existing-uuid-456");
  });

  it("generates UNKNOWN- NIF when nif is null", async () => {
    const chain = makeChain();
    mockCreateClient.mockReturnValue(makeDb(chain) as unknown as ReturnType<typeof createClient>);

    await upsertSupplier(null, "Fornecedor Desconhecido");

    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        nif: expect.stringMatching(/^UNKNOWN-/),
      }),
      expect.anything()
    );
  });

  it("throws error when Supabase upsert fails", async () => {
    const chain = makeChain({
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "connection refused" },
      }),
    });
    mockCreateClient.mockReturnValue(makeDb(chain) as unknown as ReturnType<typeof createClient>);

    await expect(upsertSupplier("123456789", "Test")).rejects.toThrow("connection refused");
  });
});

// ============================================================
// saveInvoiceItems — T-11
// ============================================================

describe("saveInvoiceItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SUPABASE_URL"] = "https://test.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-key";
  });

  it("inserts items with invoice_id and supplier_id", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const db = { from: vi.fn().mockReturnValue({ insert: insertMock }) };
    mockCreateClient.mockReturnValue(db as unknown as ReturnType<typeof createClient>);

    await saveInvoiceItems("invoice-uuid-111", "supplier-uuid-222", sampleItems);

    expect(db.from).toHaveBeenCalledWith("invoice_items");
    expect(insertMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          invoice_id:  "invoice-uuid-111",
          supplier_id: "supplier-uuid-222",
          line_number: 1,
          description: "Consultoria de sistemas",
        }),
        expect.objectContaining({
          invoice_id:  "invoice-uuid-111",
          supplier_id: "supplier-uuid-222",
          line_number: 2,
          description: "Suporte técnico",
        }),
      ])
    );
  });

  it("does not call Supabase when items array is empty", async () => {
    await saveInvoiceItems("invoice-uuid-111", "supplier-uuid-222", []);

    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("throws error when Supabase insert fails", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: { message: "insert failed" } });
    const db = { from: vi.fn().mockReturnValue({ insert: insertMock }) };
    mockCreateClient.mockReturnValue(db as unknown as ReturnType<typeof createClient>);

    await expect(
      saveInvoiceItems("invoice-uuid-111", "supplier-uuid-222", sampleItems)
    ).rejects.toThrow("insert failed");
  });
});

// ============================================================
// resolveClientId — T-Fase1
// ============================================================

describe("resolveClientId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SUPABASE_URL"] = "https://test.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-key";
  });

  it("returns client_id when source_client_map has a matching record", async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: { client_id: "client-uuid-abc" },
      error: null,
    });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: maybeSingleMock,
    };
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof createClient>);

    const result = await resolveClientId("drive", "folder-123");

    expect(result).toBe("client-uuid-abc");
    expect(chain.eq).toHaveBeenCalledWith("source_type", "drive");
    expect(chain.eq).toHaveBeenCalledWith("source_ref", "folder-123");
  });

  it("returns null when no record found in source_client_map", async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: maybeSingleMock,
    };
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof createClient>);

    const result = await resolveClientId("gmail", "msg-999");

    expect(result).toBeNull();
  });
});

// ============================================================
// saveOcrDocument — TASK-1-6 (idempotent upsert by document_hash)
// ============================================================

describe("saveOcrDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SUPABASE_URL"] = "https://test.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-key";
  });

  it("inserts a new ocr_document and returns its UUID", async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: { id: "ocr-doc-uuid-111" },
      error: null,
    });
    const chain = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: singleMock,
    };
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof createClient>);

    const data: OcrDocumentInsert = {
      source_type: "drive",
      source_ref: "file-abc",
      folder_ref: "folder-xyz",
      file_name: "factura.pdf",
      document_hash: "sha256hashvalue",
      client_id: "client-uuid-111",
    };
    const id = await saveOcrDocument(data);

    expect(id).toBe("ocr-doc-uuid-111");
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ document_hash: "sha256hashvalue", source_type: "drive" }),
      expect.objectContaining({ onConflict: "document_hash" })
    );
  });

  it("returns existing id when document_hash already exists (idempotent)", async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: { id: "existing-ocr-uuid-222" },
      error: null,
    });
    const chain = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: singleMock,
    };
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof createClient>);

    const data: OcrDocumentInsert = {
      source_type: "drive",
      source_ref: "file-abc",
      document_hash: "sha256hashvalue",
    };
    const id = await saveOcrDocument(data);

    // Returns the id regardless of whether it was a new insert or existing
    expect(id).toBe("existing-ocr-uuid-222");
  });

  it("throws when Supabase upsert fails", async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "unique constraint violation" },
    });
    const chain = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: singleMock,
    };
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof createClient>);

    await expect(
      saveOcrDocument({ source_type: "drive", source_ref: "f", document_hash: "h" })
    ).rejects.toThrow("unique constraint violation");
  });
});

// ============================================================
// saveExtractionRun — TASK-1-7 (insert per extraction attempt)
// ============================================================

describe("saveExtractionRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SUPABASE_URL"] = "https://test.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-key";
  });

  it("inserts an extraction run and returns its UUID", async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: { id: "run-uuid-aaa" },
      error: null,
    });
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: singleMock,
    };
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof createClient>);

    const data: ExtractionRunInsert = {
      ocr_document_id: "ocr-doc-uuid-111",
      raw_ocr_text: "Fatura de teste",
      confidence: 0.95,
      extractor_version: "v2-mistral",
      processing_time_ms: 1200,
    };
    const id = await saveExtractionRun(data);

    expect(id).toBe("run-uuid-aaa");
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        ocr_document_id: "ocr-doc-uuid-111",
        confidence: 0.95,
        extractor_version: "v2-mistral",
      })
    );
  });

  it("allows multiple extraction runs for same ocr_document_id (no uniqueness constraint)", async () => {
    const singleMock = vi.fn()
      .mockResolvedValueOnce({ data: { id: "run-uuid-111" }, error: null })
      .mockResolvedValueOnce({ data: { id: "run-uuid-222" }, error: null });
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: singleMock,
    };
    const db = { from: vi.fn().mockReturnValue(chain) };
    mockCreateClient.mockReturnValue(db as unknown as ReturnType<typeof createClient>);

    const base: ExtractionRunInsert = { ocr_document_id: "ocr-doc-uuid-111" };
    const id1 = await saveExtractionRun(base);
    const id2 = await saveExtractionRun(base);

    expect(id1).toBe("run-uuid-111");
    expect(id2).toBe("run-uuid-222");
    expect(chain.insert).toHaveBeenCalledTimes(2);
  });

  it("throws when Supabase insert fails", async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "FK violation" },
    });
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: singleMock,
    };
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof createClient>);

    await expect(
      saveExtractionRun({ ocr_document_id: "bad-id" })
    ).rejects.toThrow("FK violation");
  });
});

// ============================================================
// getSupplierByNif — TASK-2-4
// ============================================================

describe("getSupplierByNif", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SUPABASE_URL"] = "https://test.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-key";
  });

  it("returns supplier id and normalized_name when NIF matches", async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: { id: "supplier-uuid-aaa", nif: "123456789", normalized_name: "empresa teste" },
      error: null,
    });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: maybeSingleMock,
    };
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof createClient>);

    const result = await getSupplierByNif("123456789");

    expect(result).not.toBeNull();
    expect(result?.id).toBe("supplier-uuid-aaa");
    expect(result?.normalized_name).toBe("empresa teste");
    expect(chain.eq).toHaveBeenCalledWith("nif", "123456789");
  });

  it("returns null when no supplier has that NIF", async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: maybeSingleMock,
    };
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof createClient>);

    const result = await getSupplierByNif("999999999");

    expect(result).toBeNull();
  });
});

// ============================================================
// getSupplierAliases — TASK-2-4
// ============================================================

describe("getSupplierAliases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SUPABASE_URL"] = "https://test.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-key";
  });

  it("returns aliases filtered by alias_type", async () => {
    const fakeAliases = [
      { id: "alias-uuid-1", supplier_id: "supplier-uuid-aaa", alias_text: "123456789", alias_type: "nif", confidence: 1.0 },
    ];
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: undefined as unknown,
    };
    // Simulate data returned from chained call
    chain.eq = vi.fn().mockReturnValue({
      ...chain,
      then: undefined,
      // last .eq returns data directly on resolution
    });
    const innerChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    };
    // Build a proper mock that returns data when awaited
    const selectResult = {
      data: fakeAliases,
      error: null,
    };
    const eqMock = vi.fn().mockReturnThis();
    const chainFull = {
      select: vi.fn().mockReturnThis(),
      eq: eqMock,
      // make chainFull awaitable with data
    };
    // Second eq call returns a promise-like
    eqMock.mockReturnValueOnce(chainFull).mockResolvedValueOnce(selectResult);

    // Simpler approach: mock the whole chain as a thenable
    const thenableChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      // Vitest resolves thenables via Promise.resolve
    };
    Object.assign(thenableChain, selectResult); // attach data/error
    // Use a resolve function
    const resolveChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnValue(Promise.resolve(selectResult)),
    };

    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue(resolveChain),
    } as unknown as ReturnType<typeof createClient>);

    const result = await getSupplierAliases("nif");

    expect(result).toHaveLength(1);
    expect(result[0].alias_text).toBe("123456789");
  });

  it("returns all aliases when aliasType filter matches multiple", async () => {
    const fakeAliases = [
      { id: "a1", supplier_id: "s1", alias_text: "empresa teste lda", alias_type: "name_exact", confidence: 0.95 },
      { id: "a2", supplier_id: "s2", alias_text: "empresa testa lda", alias_type: "name_exact", confidence: 0.92 },
    ];
    const resolveChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnValue(Promise.resolve({ data: fakeAliases, error: null })),
    };
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue(resolveChain),
    } as unknown as ReturnType<typeof createClient>);

    const result = await getSupplierAliases("name_exact");

    expect(result).toHaveLength(2);
    expect(result[0].alias_text).toBe("empresa teste lda");
    expect(result[1].alias_text).toBe("empresa testa lda");
  });
});

// ============================================================
// createSupplierAlias — TASK-2-4
// ============================================================

describe("createSupplierAlias", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SUPABASE_URL"] = "https://test.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-key";
  });

  it("inserts a new alias and returns its UUID", async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: { id: "alias-uuid-new" },
      error: null,
    });
    const chain = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: singleMock,
    };
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof createClient>);

    const id = await createSupplierAlias({
      supplier_id: "supplier-uuid-aaa",
      alias_text: "123456789",
      alias_type: "nif",
      confidence: 1.0,
    });

    expect(id).toBe("alias-uuid-new");
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        supplier_id: "supplier-uuid-aaa",
        alias_text: "123456789",
        alias_type: "nif",
        confidence: 1.0,
      }),
      expect.objectContaining({ onConflict: "supplier_id,alias_text,alias_type" })
    );
  });

  it("is idempotent — returns existing alias UUID on conflict", async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: { id: "existing-alias-uuid" },
      error: null,
    });
    const chain = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: singleMock,
    };
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof createClient>);

    const id = await createSupplierAlias({
      supplier_id: "supplier-uuid-aaa",
      alias_text: "123456789",
      alias_type: "nif",
      confidence: 1.0,
    });

    expect(id).toBe("existing-alias-uuid");
  });

  it("throws when Supabase upsert fails", async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "FK violation" },
    });
    const chain = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: singleMock,
    };
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof createClient>);

    await expect(
      createSupplierAlias({ supplier_id: "bad", alias_text: "x", alias_type: "nif" })
    ).rejects.toThrow("FK violation");
  });
});

// ============================================================
// TC.2 — saveInvoiceOcrText (migration 044: satellite table)
// ============================================================

describe("saveInvoiceOcrText — TC.2 (satellite table)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SUPABASE_URL"]              = "https://test.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-key";
  });

  it("inserts into invoice_ocr_text table with invoice_id and raw_ocr_text", async () => {
    const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ insert: insertMock }),
    } as unknown as ReturnType<typeof createClient>);

    await saveInvoiceOcrText("invoice-uuid-001", "raw ocr text content here");

    expect(insertMock).toHaveBeenCalledWith({
      invoice_id:   "invoice-uuid-001",
      raw_ocr_text: "raw ocr text content here",
    });
  });

  it("targets the invoice_ocr_text table, not invoices", async () => {
    const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const fromMock   = vi.fn().mockReturnValue({ insert: insertMock });
    mockCreateClient.mockReturnValue({
      from: fromMock,
    } as unknown as ReturnType<typeof createClient>);

    await saveInvoiceOcrText("invoice-uuid-002", "some ocr text");

    expect(fromMock).toHaveBeenCalledWith("invoice_ocr_text");
  });

  it("throws when Supabase insert fails", async () => {
    const insertMock = vi.fn().mockResolvedValue({
      data:  null,
      error: { message: "FK violation: invoice not found" },
    });
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ insert: insertMock }),
    } as unknown as ReturnType<typeof createClient>);

    await expect(
      saveInvoiceOcrText("no-such-invoice", "text")
    ).rejects.toThrow("FK violation");
  });

  it("is a no-op when rawOcrText is null or empty string", async () => {
    const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ insert: insertMock }),
    } as unknown as ReturnType<typeof createClient>);

    await saveInvoiceOcrText("invoice-uuid-003", null);
    await saveInvoiceOcrText("invoice-uuid-004", "");

    // No DB call for null/empty ocr text
    expect(insertMock).not.toHaveBeenCalled();
  });
});
