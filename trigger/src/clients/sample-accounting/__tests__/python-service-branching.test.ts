import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("../python-service/client", () => ({
  processInvoiceViaPython: vi.fn().mockResolvedValue({
    invoice_id: "python-invoice-uuid",
    status: "success",
    errors: [],
  }),
  PythonServiceError: class PythonServiceError extends Error {},
}));

vi.mock("../repository", () => ({
  getInvoiceIdByStoragePath: vi.fn().mockResolvedValue("cccccccc-cccc-cccc-cccc-cccccccccccc"),
}));

vi.mock("@trigger.dev/sdk", () => ({
  schemaTask: (config: { id: string; run: (p: unknown) => unknown; queue?: unknown; [k: string]: unknown }) => ({
    id: config.id,
    run: config.run,
    queue: config.queue,
  }),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn().mockImplementation((_name: string, fn: () => unknown) => fn()),
  },
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { processSingleInvoice as _processSingleInvoice } from "../process-single-invoice.task";
import { processInvoiceViaPython } from "../python-service/client";
import { z } from "zod";
import type { ProcessSingleInvoiceResult } from "../process-single-invoice.task";
import { ProcessSingleInvoiceSchema } from "../process-single-invoice.task";

const processSingleInvoice = _processSingleInvoice as typeof _processSingleInvoice & {
  run: (payload: z.infer<typeof ProcessSingleInvoiceSchema>) => Promise<ProcessSingleInvoiceResult>;
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("process-single-invoice — Python service path", () => {
  beforeEach(() => vi.clearAllMocks());

  it("always calls processInvoiceViaPython for non-dryRun invocations", async () => {
    await processSingleInvoice.run({
      sourceType: "storage",
      sourceRef: "invoices/sample-accounting/2026/05/test.pdf",
      fileName: "test.pdf",
      dryRun: false,
      client_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      storageKey: "invoices/sample-accounting/2026/05/test.pdf",
    });

    expect(processInvoiceViaPython).toHaveBeenCalledOnce();
  });

  it("passes storageKey to processInvoiceViaPython", async () => {
    const storageKey = "invoices/sample-accounting/2026/05/specific.pdf";

    await processSingleInvoice.run({
      sourceType: "storage",
      sourceRef: storageKey,
      fileName: "specific.pdf",
      dryRun: false,
      client_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      storageKey,
    });

    expect(processInvoiceViaPython).toHaveBeenCalledWith(
      expect.objectContaining({ storageKey })
    );
  });

  it("passes client_id to processInvoiceViaPython", async () => {
    const clientId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

    await processSingleInvoice.run({
      sourceType: "storage",
      sourceRef: "invoices/sample-accounting/2026/05/test.pdf",
      fileName: "test.pdf",
      dryRun: false,
      client_id: clientId,
      storageKey: "invoices/sample-accounting/2026/05/test.pdf",
    });

    expect(processInvoiceViaPython).toHaveBeenCalledWith(
      expect.objectContaining({ clientId })
    );
  });

  it("returns skipped immediately when dryRun=true", async () => {
    const result = await processSingleInvoice.run({
      sourceType: "storage",
      sourceRef: "invoices/sample-accounting/2026/05/test.pdf",
      fileName: "test.pdf",
      dryRun: true,
      client_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      storageKey: "invoices/sample-accounting/2026/05/test.pdf",
    });

    expect(result).toMatchObject({ skipped: true });
    expect(processInvoiceViaPython).not.toHaveBeenCalled();
  });
});
