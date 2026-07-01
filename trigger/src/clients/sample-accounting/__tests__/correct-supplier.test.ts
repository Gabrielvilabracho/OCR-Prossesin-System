import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================
// correct-supplier.task.ts — T11 Auto-learning hook
// ============================================================
// Tests for the manual correction task that:
//   1. Updates invoices.supplier_id to the correct supplier
//   2. Creates a supplier_alias so future invoices resolve via alias
//   3. Logs to supplier_resolution_log with method='manual_correction'
// ============================================================

vi.mock("@trigger.dev/sdk", () => ({
  schemaTask: (config: { id: string; run: (p: unknown) => unknown; [k: string]: unknown }) => ({
    id:  config.id,
    run: config.run,
  }),
  logger: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    trace: vi.fn().mockImplementation((_name: string, fn: () => unknown) => fn()),
  },
}));

// Use inline vi.fn() in factory — top-level variables cannot be used due to hoisting
vi.mock("../repository", () => ({
  getInvoiceById:      vi.fn(),
  updateInvoiceStatus: vi.fn(),
  createSupplierAlias: vi.fn(),
}));

vi.mock("../intelligence/resolution-logger", () => ({
  logResolution: vi.fn(),
}));

// ============================================================
// Import AFTER mocks (required by vitest hoisting)
// ============================================================

import { correctSupplierTask } from "../correct-supplier.task";
import * as repo from "../repository";
import * as resolutionLogger from "../intelligence/resolution-logger";

// ============================================================
// Shared test data
// ============================================================

const INVOICE_ID   = "invoice-uuid-001";
const SUPPLIER_ID  = "supplier-uuid-correct";
const REVIEWER_ID  = "reviewer-uuid-001";
const ISSUER_NIF   = "123456789";
const ISSUER_NAME  = "Fornecedor Lda";

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id:          INVOICE_ID,
    issuer_nif:  ISSUER_NIF,
    issuer_name: ISSUER_NAME,
    supplier_id: "supplier-uuid-wrong",
    ...overrides,
  };
}

// ============================================================
// T11 GREEN tests — auto-learning hook
// ============================================================

describe("correctSupplierTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repo.getInvoiceById).mockResolvedValue(makeInvoice());
    vi.mocked(repo.updateInvoiceStatus).mockResolvedValue(undefined);
    vi.mocked(repo.createSupplierAlias).mockResolvedValue("alias-uuid-001");
    vi.mocked(resolutionLogger.logResolution).mockResolvedValue(undefined);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runTask = (payload: Parameters<typeof correctSupplierTask.trigger>[0]) =>
    // The mock replaces schemaTask with { id, run } at runtime; cast to bypass TS structural check
    (correctSupplierTask as unknown as { run: (p: typeof payload) => Promise<unknown> }).run(payload);

  // ---- Happy path: NIF-based alias ----
  it("creates a supplier alias using issuer_nif when invoice has a valid NIF", async () => {
    await runTask({
      invoiceId:         INVOICE_ID,
      correctSupplierId: SUPPLIER_ID,
      reviewerId:        REVIEWER_ID,
    });

    expect(repo.createSupplierAlias).toHaveBeenCalledOnce();
    expect(repo.createSupplierAlias).toHaveBeenCalledWith({
      supplier_id: SUPPLIER_ID,
      alias_text:  ISSUER_NIF,
      alias_type:  "manual",
      confidence:  1.0,
      created_by:  REVIEWER_ID,
    });
  });

  // ---- Happy path: updates invoice.supplier_id ----
  it("updates the invoice supplier_id to the correct supplier", async () => {
    await runTask({
      invoiceId:         INVOICE_ID,
      correctSupplierId: SUPPLIER_ID,
      reviewerId:        REVIEWER_ID,
    });

    expect(repo.updateInvoiceStatus).toHaveBeenCalledOnce();
    // updateInvoiceStatus is called with (id, status, extra) where extra includes supplier_id
    const [id, , extra] = vi.mocked(repo.updateInvoiceStatus).mock.calls[0] as [string, string, Record<string, string>];
    expect(id).toBe(INVOICE_ID);
    expect(extra).toMatchObject({ supplier_id: SUPPLIER_ID });
  });

  // ---- Triangulate: name-based alias when NIF is null ----
  it("creates a manual alias using issuer_name when invoice has no NIF", async () => {
    vi.mocked(repo.getInvoiceById).mockResolvedValue(makeInvoice({ issuer_nif: null }));

    await runTask({
      invoiceId:         INVOICE_ID,
      correctSupplierId: SUPPLIER_ID,
      reviewerId:        REVIEWER_ID,
    });

    expect(repo.createSupplierAlias).toHaveBeenCalledOnce();
    expect(repo.createSupplierAlias).toHaveBeenCalledWith({
      supplier_id: SUPPLIER_ID,
      alias_text:  ISSUER_NAME,
      alias_type:  "manual",
      confidence:  1.0,
      created_by:  REVIEWER_ID,
    });
  });

  // ---- Logs manual_correction to supplier_resolution_log ----
  it("logs the correction to supplier_resolution_log with method=manual_correction", async () => {
    await runTask({
      invoiceId:         INVOICE_ID,
      correctSupplierId: SUPPLIER_ID,
      reviewerId:        REVIEWER_ID,
    });

    expect(resolutionLogger.logResolution).toHaveBeenCalledOnce();
    const logCall = vi.mocked(resolutionLogger.logResolution).mock.calls[0][0];
    expect(logCall).toMatchObject({
      resolved_supplier_id: SUPPLIER_ID,
      resolution_method:    "manual_correction",
      input_nif:            ISSUER_NIF,
    });
  });
});
