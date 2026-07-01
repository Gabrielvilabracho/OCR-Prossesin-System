import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================
// Mocks
// ============================================================

vi.mock("@trigger.dev/sdk", () => ({
  schemaTask: (config: { id: string; run: (p: unknown) => unknown; queue?: unknown; [k: string]: unknown }) => ({
    id:    config.id,
    run:   config.run,
    queue: config.queue,
  }),
  logger: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    trace: vi.fn().mockImplementation((_name: string, fn: () => unknown) => fn()),
  },
}));

vi.mock("../python-service/client", () => ({
  processInvoiceViaPython: vi.fn().mockResolvedValue({
    invoice_id: "python-invoice-uuid",
    status: "success",
    errors: [],
  }),
  PythonServiceError: class PythonServiceError extends Error {
    statusCode?: number;
    retryable: boolean;
    constructor(msg: string, opts?: { statusCode?: number; retryable?: boolean }) {
      super(msg);
      this.name = "PythonServiceError";
      this.statusCode = opts?.statusCode;
      this.retryable = opts?.retryable ?? false;
    }
  },
}));

vi.mock("../repository", () => ({
  getInvoiceIdByStoragePath: vi.fn().mockResolvedValue("cccccccc-cccc-cccc-cccc-cccccccccccc"),
}));

vi.mock("../utils/pii-mask", () => ({
  maskNif:    (nif: string) => nif.slice(0, 2) + "****",
  maskAmount: (_amount: number) => "***.**",
}));

// ============================================================
// Imports after mocks
// ============================================================

import { processInvoiceViaPython, PythonServiceError } from "../python-service/client";
import { getInvoiceIdByStoragePath } from "../repository";
import { processSingleInvoice as _processSingleInvoice, ProcessSingleInvoiceSchema } from "../process-single-invoice.task";
import type { ProcessSingleInvoiceResult } from "../process-single-invoice.task";
import { z } from "zod";

// TaskWithSchema doesn't expose .run in its type — cast to add it for test access
const processSingleInvoice = _processSingleInvoice as typeof _processSingleInvoice & {
  run: (payload: z.infer<typeof ProcessSingleInvoiceSchema>) => Promise<ProcessSingleInvoiceResult>;
};

// ============================================================
// Fixtures
// ============================================================

const CLIENT_ID   = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const STORAGE_KEY = "invoices/sample-accounting/2026/05/test.pdf";
const INVOICE_UUID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

// ============================================================
// Schema validation
// ============================================================

describe("processSingleInvoice — schema: client_id is required UUID", () => {
  it("rejects a payload without client_id (real schema requires the field)", () => {
    const result = ProcessSingleInvoiceSchema.safeParse({
      sourceType: "drive",
      sourceRef:  "file-1",
      fileName:   "f.pdf",
      dryRun:     false,
      // client_id intentionally MISSING
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      expect(fieldErrors["client_id"]).toBeDefined();
    }
  });

  it("rejects a payload with invalid client_id (not a UUID format)", () => {
    const result = ProcessSingleInvoiceSchema.safeParse({
      sourceType: "drive",
      sourceRef:  "file-1",
      fileName:   "f.pdf",
      dryRun:     false,
      client_id:  "not-a-uuid",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      expect(fieldErrors["client_id"]).toBeDefined();
    }
  });

  it("accepts a payload with valid client_id UUID (real schema passes)", () => {
    const result = ProcessSingleInvoiceSchema.safeParse({
      sourceType: "drive",
      sourceRef:  "file-1",
      fileName:   "f.pdf",
      dryRun:     false,
      client_id:  "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.client_id).toBe("550e8400-e29b-41d4-a716-446655440000");
      expect(result.data.sourceType).toBe("drive");
    }
  });
});

describe("processSingleInvoice — schema accepts sourceType=storage", () => {
  it("ProcessSingleInvoiceSchema accepts sourceType='storage'", () => {
    const result = ProcessSingleInvoiceSchema.safeParse({
      sourceType: "storage",
      sourceRef:  "invoices/client-uuid-001/factura01.pdf",
      fileName:   "factura01.pdf",
      dryRun:     false,
      client_id:  CLIENT_ID,
      storageKey: "invoices/client-uuid-001/factura01.pdf",
    });
    expect(result.success).toBe(true);
  });

  it("ProcessSingleInvoiceSchema rejects unknown sourceType values", () => {
    const result = ProcessSingleInvoiceSchema.safeParse({
      sourceType: "ftp",
      sourceRef:  "some-ref",
      fileName:   "file.pdf",
      dryRun:     false,
      client_id:  CLIENT_ID,
    });
    expect(result.success).toBe(false);
  });

  it("ProcessSingleInvoiceSchema still accepts drive and gmail", () => {
    const drive = ProcessSingleInvoiceSchema.safeParse({
      sourceType: "drive",
      sourceRef:  "file-id-001",
      fileName:   "f.pdf",
      dryRun:     false,
      client_id:  CLIENT_ID,
    });
    const gmail = ProcessSingleInvoiceSchema.safeParse({
      sourceType:   "gmail",
      sourceRef:    "msg-1",
      fileName:     "f.pdf",
      dryRun:       false,
      client_id:    CLIENT_ID,
      attachmentId: "att-1",
    });
    expect(drive.success).toBe(true);
    expect(gmail.success).toBe(true);
  });
});

// ============================================================
// Task contract
// ============================================================

describe("processSingleInvoice — task contract", () => {
  it("exports a task with id 'sample-process-single-invoice'", () => {
    expect(processSingleInvoice).toBeDefined();
    expect(processSingleInvoice.id).toBe("sample-process-single-invoice");
  });

  it("has a run function", () => {
    expect(typeof processSingleInvoice.run).toBe("function");
  });

  it("defines queue concurrencyLimit of 10 at task config level", () => {
    expect((processSingleInvoice as unknown as { queue: unknown }).queue).toEqual({ concurrencyLimit: 10 });
  });
});

// ============================================================
// dryRun
// ============================================================

describe("processSingleInvoice — dryRun early return", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns { skipped: true } immediately when dryRun=true without calling Python service", async () => {
    const result = await processSingleInvoice.run({
      sourceType: "storage",
      sourceRef:  STORAGE_KEY,
      fileName:   "factura.pdf",
      dryRun:     true,
      client_id:  CLIENT_ID,
      storageKey: STORAGE_KEY,
    });

    expect(result).toMatchObject({ skipped: true });
    expect(processInvoiceViaPython).not.toHaveBeenCalled();
  });

  it("returns skipped when sourceType=storage and dryRun=true", async () => {
    const result = await processSingleInvoice.run({
      sourceType: "storage",
      sourceRef:  STORAGE_KEY,
      fileName:   "factura01.pdf",
      dryRun:     true,
      client_id:  CLIENT_ID,
      storageKey: STORAGE_KEY,
    });
    expect(result).toMatchObject({ status: "skipped", skipped: true });
  });
});

// ============================================================
// Python service path
// ============================================================

describe("processSingleInvoice — Python service delegation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves invoiceId from storageKey and calls processInvoiceViaPython", async () => {
    vi.mocked(getInvoiceIdByStoragePath).mockResolvedValue(INVOICE_UUID);
    vi.mocked(processInvoiceViaPython).mockResolvedValue({
      invoice_id: INVOICE_UUID,
      status: "success",
      errors: [],
    });

    await processSingleInvoice.run({
      sourceType: "storage",
      sourceRef:  STORAGE_KEY,
      fileName:   "test.pdf",
      dryRun:     false,
      client_id:  CLIENT_ID,
      storageKey: STORAGE_KEY,
    });

    expect(getInvoiceIdByStoragePath).toHaveBeenCalledWith(STORAGE_KEY);
    expect(processInvoiceViaPython).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId:  INVOICE_UUID,
        storageKey: STORAGE_KEY,
        clientId:   CLIENT_ID,
      })
    );
  });

  it("returns ok status when Python service returns success", async () => {
    vi.mocked(getInvoiceIdByStoragePath).mockResolvedValue(INVOICE_UUID);
    vi.mocked(processInvoiceViaPython).mockResolvedValue({
      invoice_id: INVOICE_UUID,
      status: "success",
      errors: [],
    });

    const result = await processSingleInvoice.run({
      sourceType: "storage",
      sourceRef:  STORAGE_KEY,
      fileName:   "test.pdf",
      dryRun:     false,
      client_id:  CLIENT_ID,
      storageKey: STORAGE_KEY,
    });

    expect(result.status).toBe("ok");
    expect(result.invoiceId).toBe(INVOICE_UUID);
  });

  it("returns error status when Python service returns failed", async () => {
    vi.mocked(getInvoiceIdByStoragePath).mockResolvedValue(INVOICE_UUID);
    vi.mocked(processInvoiceViaPython).mockResolvedValue({
      invoice_id: INVOICE_UUID,
      status: "failed",
      errors: ["math error"],
    });

    const result = await processSingleInvoice.run({
      sourceType: "storage",
      sourceRef:  STORAGE_KEY,
      fileName:   "test.pdf",
      dryRun:     false,
      client_id:  CLIENT_ID,
      storageKey: STORAGE_KEY,
    });

    expect(result.status).toBe("error");
    expect(result.error).toContain("math error");
  });

  it("returns error when invoice not found by storage_path", async () => {
    vi.mocked(getInvoiceIdByStoragePath).mockResolvedValue(null);

    const result = await processSingleInvoice.run({
      sourceType: "storage",
      sourceRef:  STORAGE_KEY,
      fileName:   "test.pdf",
      dryRun:     false,
      client_id:  CLIENT_ID,
      storageKey: STORAGE_KEY,
    });

    expect(result.status).toBe("error");
    expect(result.error).toContain("Invoice not found");
    expect(processInvoiceViaPython).not.toHaveBeenCalled();
  });

  it("uses sourceRef as storageKey fallback when storageKey is not provided", async () => {
    vi.mocked(getInvoiceIdByStoragePath).mockResolvedValue(INVOICE_UUID);
    vi.mocked(processInvoiceViaPython).mockResolvedValue({
      invoice_id: INVOICE_UUID,
      status: "success",
      errors: [],
    });

    const sourceRef = "invoices/sample-accounting/2026/05/fallback.pdf";

    await processSingleInvoice.run({
      sourceType: "storage",
      sourceRef,
      fileName:   "fallback.pdf",
      dryRun:     false,
      client_id:  CLIENT_ID,
      // no storageKey — should fall back to sourceRef
    });

    expect(getInvoiceIdByStoragePath).toHaveBeenCalledWith(sourceRef);
  });

  it("returns error status when Python service throws PythonServiceError", async () => {
    vi.mocked(getInvoiceIdByStoragePath).mockResolvedValue(INVOICE_UUID);
    vi.mocked(processInvoiceViaPython).mockRejectedValue(
      new PythonServiceError("Python service returned HTTP 500: internal error", { statusCode: 500 })
    );

    const result = await processSingleInvoice.run({
      sourceType: "storage",
      sourceRef:  STORAGE_KEY,
      fileName:   "test.pdf",
      dryRun:     false,
      client_id:  CLIENT_ID,
      storageKey: STORAGE_KEY,
    });

    expect(result.status).toBe("error");
    expect(result.error).toContain("HTTP 500");
  });

  it("passes client_id from payload to Python service as clientId", async () => {
    const clientId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    vi.mocked(getInvoiceIdByStoragePath).mockResolvedValue(INVOICE_UUID);
    vi.mocked(processInvoiceViaPython).mockResolvedValue({
      invoice_id: INVOICE_UUID,
      status: "success",
      errors: [],
    });

    await processSingleInvoice.run({
      sourceType: "storage",
      sourceRef:  STORAGE_KEY,
      fileName:   "test.pdf",
      dryRun:     false,
      client_id:  clientId,
      storageKey: STORAGE_KEY,
    });

    expect(processInvoiceViaPython).toHaveBeenCalledWith(
      expect.objectContaining({ clientId })
    );
  });
});
