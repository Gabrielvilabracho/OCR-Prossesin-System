/**
 * T010 — Lock v4 SDK contract for Sample Accounting task exports.
 *
 * These tests assert that collect-invoices.task.ts, process-single-invoice.task.ts
 * and manual-test.task.ts import from `@trigger.dev/sdk` (not `@trigger.dev/sdk/v3`).
 *
 * Updated after sample-pipeline-scalability split:
 *   - collector: collect-invoices.task.ts (id: sample-invoice-pipeline)
 *   - processor: process-single-invoice.task.ts (id: sample-process-single-invoice)
 */
import { describe, it, expect, vi } from "vitest";

// ============================================================
// Mock @trigger.dev/sdk (v4 path — NOT /v3)
// ============================================================

vi.mock("@trigger.dev/sdk", () => ({
  schemaTask: (config: { id: string; run: (p: unknown) => unknown; [k: string]: unknown }) => ({
    id: config.id,
    run: config.run,
  }),
  logger: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    trace: vi.fn().mockImplementation((_name: string, fn: () => unknown) => fn()),
  },
}));

// ============================================================
// Stub all heavy dependencies so the module can be imported
// ============================================================

vi.mock("../config", () => ({
  getGoogleAuthClient: vi.fn().mockReturnValue({}),
  getDriveFolderId:    vi.fn().mockReturnValue("folder-id"),
  getGmailUser:        vi.fn().mockReturnValue("operator@example.com"),
}));

vi.mock("../sources/drive", () => ({
  listPdfFiles: vi.fn().mockResolvedValue([]),
  downloadPdf:  vi.fn(),
}));

vi.mock("../sources/gmail", () => ({
  listMessagesWithPdfAttachments: vi.fn().mockResolvedValue([]),
  downloadAttachment:             vi.fn(),
}));

vi.mock("../sources/normalize", () => ({
  normalizeSource: vi.fn(),
}));

vi.mock("../extractor", () => ({
  extractFields:  vi.fn(),
  ExtractorError: class ExtractorError extends Error {
    kind: string;
    constructor(msg: string, kind: string) { super(msg); this.kind = kind; }
  },
}));

vi.mock("../hash", () => ({
  computeHash: vi.fn().mockReturnValue("abc123hash"),
}));

vi.mock("../repository", () => ({
  checkDuplicate:      vi.fn().mockResolvedValue({ isDuplicate: false }),
  saveInvoice:         vi.fn().mockResolvedValue("inv-id"),
  updateInvoiceStatus: vi.fn().mockResolvedValue(undefined),
  buildInvoiceInsert:  vi.fn().mockReturnValue({ processing_status: "ok" }),
  upsertSupplier:      vi.fn().mockResolvedValue("sup-id"),
  saveInvoiceItems:    vi.fn().mockResolvedValue(undefined),
  resolveClientId:     vi.fn().mockResolvedValue(null),
}));

vi.mock("../efactura-mock", () => ({
  mockEfacturaValidate: vi.fn().mockReturnValue({ status: "matched" }),
}));

vi.mock("../classifier", () => ({
  classify: vi.fn().mockReturnValue({ status: "ok" }),
}));

vi.mock("../math-validator", () => ({
  validateInvoiceMath: vi.fn().mockReturnValue({ valid: true, errors: [] }),
}));

// Mock process-single-invoice so collect-invoices can import it without issues
vi.mock("../process-single-invoice.task", () => ({
  processSingleInvoice: {
    id: "sample-process-single-invoice",
    batchTrigger: vi.fn().mockResolvedValue({ batchId: "batch-test", runs: [] }),
  },
}));

// ============================================================
// Imports after mocks
// ============================================================

import { collectInvoices as _collectInvoices } from "../collect-invoices.task";
import { processSingleInvoice } from "../process-single-invoice.task";
import { sampleManualTest as _sampleManualTest } from "../manual-test.task";

// TaskWithSchema doesn't expose .run in its type — cast to add it for test access
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const collectInvoices = _collectInvoices as typeof _collectInvoices & { run: (...args: any[]) => any };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sampleManualTest = _sampleManualTest as typeof _sampleManualTest & { run: (...args: any[]) => any };

// ============================================================
// T010 — v4 contract assertions (updated for split architecture)
// ============================================================

describe("Sample Accounting v4 SDK contract — T010 (split architecture)", () => {
  describe("collectInvoices (collector)", () => {
    it("exports an object with id 'sample-invoice-pipeline'", () => {
      expect(collectInvoices).toBeDefined();
      expect(collectInvoices.id).toBe("sample-invoice-pipeline");
    });

    it("has a run function", () => {
      expect(typeof collectInvoices.run).toBe("function");
    });
  });

  describe("processSingleInvoice (processor)", () => {
    it("exports an object with id 'sample-process-single-invoice'", () => {
      expect(processSingleInvoice).toBeDefined();
      expect(processSingleInvoice.id).toBe("sample-process-single-invoice");
    });
  });

  describe("sampleManualTest", () => {
    it("exports an object with id 'sample-manual-test'", () => {
      expect(sampleManualTest).toBeDefined();
      expect(sampleManualTest.id).toBe("sample-manual-test");
    });

    it("has a run function", () => {
      expect(typeof sampleManualTest.run).toBe("function");
    });
  });
});
