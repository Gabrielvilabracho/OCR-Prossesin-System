import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================
// Mocks — all external dependencies of manual-test.task.ts
// ============================================================

vi.mock("../python-service/client", () => ({
  processInvoiceViaPython: vi.fn(),
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

// Trigger.dev SDK mock — v4 import path
vi.mock("@trigger.dev/sdk", () => ({
  schemaTask: (config: { run: (p: unknown) => unknown }) => config,
  logger: {
    info:  vi.fn(),
    error: vi.fn(),
    trace: vi.fn().mockImplementation((_name: string, fn: () => unknown) => fn()),
  },
}));

// ============================================================
// Imports after mocks
// ============================================================

import { processInvoiceViaPython, PythonServiceError } from "../python-service/client";
import { sampleManualTest as _sampleManualTest } from "../manual-test.task";

// TaskWithSchema doesn't expose .run in its type — cast to add it for test access
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sampleManualTest = _sampleManualTest as typeof _sampleManualTest & { run: (...args: any[]) => any };

// ============================================================
// Shared fixtures
// ============================================================

const INVOICE_ID  = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CLIENT_ID   = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const STORAGE_KEY = "invoices/sample-accounting/2026/05/test.pdf";

const successResult = {
  invoice_id: INVOICE_ID,
  status: "success" as const,
  errors: [],
};

// ============================================================
// Tests
// ============================================================

describe("sampleManualTest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------
  // Case 1: success — Python service returns success
  // -------------------------------------------------------
  it("success — forwards result from Python service", async () => {
    vi.mocked(processInvoiceViaPython).mockResolvedValue(successResult);

    const result = await sampleManualTest.run({
      invoiceId:  INVOICE_ID,
      storageKey: STORAGE_KEY,
      client_id:  CLIENT_ID,
      dryRun:     false,
    });

    expect(processInvoiceViaPython).toHaveBeenCalledOnce();
    expect(processInvoiceViaPython).toHaveBeenCalledWith({
      invoiceId:  INVOICE_ID,
      storageKey: STORAGE_KEY,
      clientId:   CLIENT_ID,
      dryRun:     false,
    });

    expect(result).toEqual({
      invoiceId: INVOICE_ID,
      status:    "success",
      errors:    [],
    });
  });

  // -------------------------------------------------------
  // Case 2: dryRun=true — passes dryRun flag to Python service
  // -------------------------------------------------------
  it("dryRun=true — passes dryRun=true to processInvoiceViaPython", async () => {
    vi.mocked(processInvoiceViaPython).mockResolvedValue({
      invoice_id: null,
      status: "dry_run",
      errors: [],
    });

    const result = await sampleManualTest.run({
      invoiceId:  INVOICE_ID,
      storageKey: STORAGE_KEY,
      client_id:  CLIENT_ID,
      dryRun:     true,
    });

    expect(processInvoiceViaPython).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true })
    );
    expect(result.status).toBe("dry_run");
  });

  // -------------------------------------------------------
  // Case 3: Python service returns errors — propagated in output
  // -------------------------------------------------------
  it("failed status — propagates errors array from Python service", async () => {
    const errors = ["math error: totals mismatch", "nif invalid"];
    vi.mocked(processInvoiceViaPython).mockResolvedValue({
      invoice_id: INVOICE_ID,
      status: "failed",
      errors,
    });

    const result = await sampleManualTest.run({
      invoiceId:  INVOICE_ID,
      storageKey: STORAGE_KEY,
      client_id:  CLIENT_ID,
      dryRun:     false,
    });

    expect(result.status).toBe("failed");
    expect(result.errors).toEqual(errors);
  });

  // -------------------------------------------------------
  // Case 4: PythonServiceError — task re-throws
  // -------------------------------------------------------
  it("PythonServiceError — task re-throws the error", async () => {
    vi.mocked(processInvoiceViaPython).mockRejectedValue(
      new PythonServiceError("Python service returned HTTP 500: internal error", { statusCode: 500, retryable: true })
    );

    await expect(
      sampleManualTest.run({
        invoiceId:  INVOICE_ID,
        storageKey: STORAGE_KEY,
        client_id:  CLIENT_ID,
        dryRun:     false,
      })
    ).rejects.toThrow("HTTP 500");
  });
});
