import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================
// Mocks — must be declared before any imports of the module under test
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

vi.mock("../config", () => ({
  getGoogleAuthClient: vi.fn().mockReturnValue({}),
  getGmailUser:        vi.fn().mockReturnValue("operator@example.com"),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

vi.mock("../sources/drive", () => ({
  listPdfFiles: vi.fn(),
  downloadPdf:  vi.fn(),
}));

vi.mock("../sources/gmail", () => ({
  listMessagesWithPdfAttachments: vi.fn(),
  downloadAttachment:             vi.fn(),
}));

// Mock process-single-invoice task so batchTrigger can be spied on
vi.mock("../process-single-invoice.task", () => ({
  processSingleInvoice: {
    id: "sample-process-single-invoice",
    batchTrigger: vi.fn().mockResolvedValue({ batchId: "batch-uuid-001", runCount: 0, publicAccessToken: "" } as any),
  },
}));

// ============================================================
// Imports after mocks
// ============================================================

import { createClient } from "@supabase/supabase-js";
import { listPdfFiles } from "../sources/drive";
import { listMessagesWithPdfAttachments } from "../sources/gmail";
import { collectInvoices as _collectInvoices } from "../collect-invoices.task";
import { processSingleInvoice } from "../process-single-invoice.task";

// TaskWithSchema doesn't expose .run in its type — cast to add it for test access
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const collectInvoices = _collectInvoices as typeof _collectInvoices & { run: (...args: any[]) => any };

// ============================================================
// Fixtures
// ============================================================

const fakeDriveFile = { id: "file-drive-1", name: "factura01.pdf", mimeType: "application/pdf" as const };
const fakeDriveFile2 = { id: "file-drive-2", name: "factura02.pdf", mimeType: "application/pdf" as const };
const fakeGmailMsg = { messageId: "msg-gmail-1", attachmentId: "att-1", fileName: "recibo01.pdf" };

// Default mock client row — used by existing tests that don't care about multi-client
const defaultClient = { id: "client-uuid-default", legal_name: "Default Client Lda", drive_folder_id: "folder-id" };

function makeSupabaseChainWith(rows: Array<{ id: string; legal_name: string; drive_folder_id: string }>) {
  const chain = {
    select:  vi.fn().mockReturnThis(),
    eq:      vi.fn().mockReturnThis(),
    not:     vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
  return { from: vi.fn().mockReturnValue(chain) };
}

function setupDefaultSupabaseMock() {
  process.env["SUPABASE_URL"] = "https://test.supabase.co";
  process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-key";
  vi.mocked(createClient).mockReturnValue(makeSupabaseChainWith([defaultClient]) as any);
}

// ============================================================
// Tests — T1: collect-invoices collector task
// ============================================================

describe("collectInvoices — task contract", () => {
  it("exports a task with id 'sample-invoice-pipeline'", () => {
    expect(collectInvoices).toBeDefined();
    expect(collectInvoices.id).toBe("sample-invoice-pipeline");
  });

  it("has a run function", () => {
    expect(typeof collectInvoices.run).toBe("function");
  });
});

describe("collectInvoices — dispatch on discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultSupabaseMock();
    vi.mocked(listPdfFiles).mockResolvedValue([fakeDriveFile]);
    vi.mocked(listMessagesWithPdfAttachments).mockResolvedValue([fakeGmailMsg]);
    vi.mocked(processSingleInvoice.batchTrigger).mockResolvedValue({ batchId: "batch-001", runCount: 0, publicAccessToken: "" } as any);
  });

  it("calls batchTrigger only for drive items (gmail refs without client_id are skipped)", async () => {
    // Drive refs have client_id (from noxx_clients). Gmail refs have no client_id and are guarded.
    const result = await collectInvoices.run({
      sources: ["drive", "gmail"],
      dryRun: false,
      previewOnly: false,
    });

    expect(processSingleInvoice.batchTrigger).toHaveBeenCalledTimes(1);
    const batchArgs = vi.mocked(processSingleInvoice.batchTrigger).mock.calls[0][0] as { payload: { sourceType: string } }[];
    expect(batchArgs).toHaveLength(1); // only the drive item — gmail skipped (no client_id)
    expect(batchArgs[0].payload.sourceType).toBe("drive");
    expect(result).toMatchObject({ dispatched: 1, dryRun: false });
  });

  it("dispatches drive items with sourceType='drive'", async () => {
    await collectInvoices.run({
      sources: ["drive"],
      dryRun: false,
      previewOnly: false,
    });

    const batchArgs = vi.mocked(processSingleInvoice.batchTrigger).mock.calls[0][0] as { payload: { sourceType: string; sourceRef: string } }[];
    const driveItem = batchArgs.find(i => i.payload.sourceType === "drive");
    expect(driveItem).toBeDefined();
    expect(driveItem!.payload.sourceRef).toBe("file-drive-1");
  });

  it("does NOT dispatch gmail items without client_id (skips and logs warning)", async () => {
    // Gmail source is OUT OF SCOPE for multi-client — refs have no client_id.
    // The guard must skip them and log a structured warn instead of dispatching.
    vi.mocked(listPdfFiles).mockResolvedValue([]);

    const { logger } = await import("@trigger.dev/sdk");

    const result = await collectInvoices.run({
      sources: ["gmail"],
      dryRun: false,
      previewOnly: false,
    });

    // No items dispatched — all gmail refs lack client_id
    expect(processSingleInvoice.batchTrigger).not.toHaveBeenCalled();
    expect(result).toMatchObject({ dispatched: 0, dryRun: false });

    // A structured warning must be emitted for the skipped ref
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      "Skipping ref without client_id (Gmail source not yet multi-client)",
      expect.objectContaining({ sourceType: "gmail" })
    );
  });
});

describe("collectInvoices — previewOnly returns refs without dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultSupabaseMock();
    vi.mocked(listPdfFiles).mockResolvedValue([fakeDriveFile]);
    vi.mocked(listMessagesWithPdfAttachments).mockResolvedValue([fakeGmailMsg]);
  });

  it("does NOT call batchTrigger when previewOnly is true", async () => {
    await collectInvoices.run({
      sources: ["drive", "gmail"],
      dryRun: false,
      previewOnly: true,
    });

    expect(processSingleInvoice.batchTrigger).not.toHaveBeenCalled();
  });

  it("returns previewed array with all discovered refs when previewOnly is true", async () => {
    const result = await collectInvoices.run({
      sources: ["drive", "gmail"],
      dryRun: false,
      previewOnly: true,
    });

    expect(result).toHaveProperty("previewed");
    const r = result as { previewed: { sourceType: string; sourceRef: string }[]; dryRun: boolean };
    expect(r.previewed).toHaveLength(2);
    expect(r.dryRun).toBe(false);
    const refs = r.previewed.map(p => p.sourceRef);
    expect(refs).toContain("file-drive-1");
    expect(refs).toContain("msg-gmail-1");
  });
});

describe("collectInvoices — sourceRefAllowlist filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultSupabaseMock();
    vi.mocked(listPdfFiles).mockResolvedValue([fakeDriveFile, fakeDriveFile2]);
    vi.mocked(listMessagesWithPdfAttachments).mockResolvedValue([]);
    vi.mocked(processSingleInvoice.batchTrigger).mockResolvedValue({ batchId: "batch-002", runCount: 0, publicAccessToken: "" } as any);
  });

  it("only dispatches files whose sourceRef is in the allowlist", async () => {
    const result = await collectInvoices.run({
      sources: ["drive"],
      dryRun: false,
      previewOnly: false,
      sourceRefAllowlist: ["file-drive-1"], // only first file
    });

    const batchArgs = vi.mocked(processSingleInvoice.batchTrigger).mock.calls[0][0] as { payload: { sourceRef: string } }[];
    expect(batchArgs).toHaveLength(1);
    expect(batchArgs[0].payload.sourceRef).toBe("file-drive-1");
    expect(result).toMatchObject({ dispatched: 1 });
  });

  it("dispatches all files when allowlist is empty (no filter)", async () => {
    const result = await collectInvoices.run({
      sources: ["drive"],
      dryRun: false,
      previewOnly: false,
    });

    const batchArgs = vi.mocked(processSingleInvoice.batchTrigger).mock.calls[0][0] as { payload: unknown }[];
    expect(batchArgs).toHaveLength(2);
    expect(result).toMatchObject({ dispatched: 2 });
  });
});

describe("collectInvoices — maxPerSource without artificial cap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultSupabaseMock();
    // Return 25 drive files (previously was capped at 20)
    const manyFiles = Array.from({ length: 25 }, (_, i) => ({
      id: `file-drive-${i + 1}`,
      name: `factura${i + 1}.pdf`,
      mimeType: "application/pdf" as const,
    }));
    vi.mocked(listPdfFiles).mockResolvedValue(manyFiles);
    vi.mocked(listMessagesWithPdfAttachments).mockResolvedValue([]);
    vi.mocked(processSingleInvoice.batchTrigger).mockResolvedValue({ batchId: "batch-003", runCount: 0, publicAccessToken: "" } as any);
  });

  it("dispatches all 25 files when maxPerSource is 25 (no cap at 20)", async () => {
    const result = await collectInvoices.run({
      sources: ["drive"],
      dryRun: false,
      previewOnly: false,
      maxPerSource: 25,
    });

    const batchArgs = vi.mocked(processSingleInvoice.batchTrigger).mock.calls[0][0] as { payload: unknown }[];
    expect(batchArgs).toHaveLength(25);
    expect(result).toMatchObject({ dispatched: 25 });
  });

  it("respects maxPerSource=5 by only dispatching 5 out of 25 files", async () => {
    const result = await collectInvoices.run({
      sources: ["drive"],
      dryRun: false,
      previewOnly: false,
      maxPerSource: 5,
    });

    const batchArgs = vi.mocked(processSingleInvoice.batchTrigger).mock.calls[0][0] as { payload: unknown }[];
    expect(batchArgs).toHaveLength(5);
    expect(result).toMatchObject({ dispatched: 5 });
  });
});

describe("collectInvoices — structured logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultSupabaseMock();
    vi.mocked(listPdfFiles).mockResolvedValue([fakeDriveFile]);
    vi.mocked(listMessagesWithPdfAttachments).mockResolvedValue([fakeGmailMsg]);
    vi.mocked(processSingleInvoice.batchTrigger).mockResolvedValue({ batchId: "batch-log-001", runCount: 0, publicAccessToken: "" } as any);
  });

  it("logs start event with task, sources, and dryRun fields", async () => {
    const { logger } = await import("@trigger.dev/sdk");

    await collectInvoices.run({
      sources: ["drive", "gmail"],
      dryRun: false,
      previewOnly: false,
    });

    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      "collect-invoices: start",
      expect.objectContaining({
        task:    "collect-invoices",
        client:  "sample-accounting",
        sources: ["drive", "gmail"],
        dryRun:  false,
      })
    );
  });

  it("logs end event with task, client, sources, dispatched, and duration_ms fields", async () => {
    const { logger } = await import("@trigger.dev/sdk");

    await collectInvoices.run({
      sources: ["drive", "gmail"],
      dryRun: false,
      previewOnly: false,
    });

    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      "collect-invoices: complete",
      expect.objectContaining({
        task:        "collect-invoices",
        client:      "sample-accounting",
        sources:     ["drive", "gmail"],
        dispatched:  expect.any(Number),
        duration_ms: expect.any(Number),
      })
    );
  });
});

describe("collectInvoices — dryRun passthrough", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultSupabaseMock();
    vi.mocked(listPdfFiles).mockResolvedValue([fakeDriveFile]);
    vi.mocked(listMessagesWithPdfAttachments).mockResolvedValue([]);
    vi.mocked(processSingleInvoice.batchTrigger).mockResolvedValue({ batchId: "batch-004", runCount: 0, publicAccessToken: "" } as any);
  });

  it("passes dryRun=true to each dispatched invoice payload", async () => {
    await collectInvoices.run({
      sources: ["drive"],
      dryRun: true,
      previewOnly: false,
    });

    const batchArgs = vi.mocked(processSingleInvoice.batchTrigger).mock.calls[0][0] as { payload: { dryRun: boolean } }[];
    expect(batchArgs[0].payload.dryRun).toBe(true);
  });

  it("passes dryRun=false to each dispatched invoice payload when not dryRun", async () => {
    await collectInvoices.run({
      sources: ["drive"],
      dryRun: false,
      previewOnly: false,
    });

    const batchArgs = vi.mocked(processSingleInvoice.batchTrigger).mock.calls[0][0] as { payload: { dryRun: boolean } }[];
    expect(batchArgs[0].payload.dryRun).toBe(false);
  });
});

// ============================================================
// T4.1 RED: collector queries noxx_clients and passes client_id
// ============================================================

function makeSupabaseChain(rows: Array<{ id: string; legal_name: string; drive_folder_id: string }>) {
  const chain = {
    select:  vi.fn().mockReturnThis(),
    eq:      vi.fn().mockReturnThis(),
    not:     vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
  return { from: vi.fn().mockReturnValue(chain) };
}

describe("collectInvoices — multi-client: queries noxx_clients", () => {
  const fakeClient1 = { id: "client-uuid-aaa", legal_name: "Client A Lda", drive_folder_id: "folder-aaa" };
  const fakeClient2 = { id: "client-uuid-bbb", legal_name: "Client B Lda", drive_folder_id: "folder-bbb" };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SUPABASE_URL"] = "https://test.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-key";
    vi.mocked(processSingleInvoice.batchTrigger).mockResolvedValue({ batchId: "batch-multi-001", runCount: 0, publicAccessToken: "" } as any);
  });

  it("queries Supabase noxx_clients with status=active and drive_folder_id IS NOT NULL", async () => {
    const mockDb = makeSupabaseChain([fakeClient1]);
    vi.mocked(createClient).mockReturnValue(mockDb as any);
    vi.mocked(listPdfFiles).mockResolvedValue([fakeDriveFile]);
    vi.mocked(listMessagesWithPdfAttachments).mockResolvedValue([]);

    await collectInvoices.run({ sources: ["drive"], dryRun: false, previewOnly: false });

    const fromCalls = mockDb.from.mock.calls.map((c: unknown[]) => c[0]);
    expect(fromCalls).toContain("noxx_clients");
    const chain = mockDb.from.mock.results[0].value;
    expect(chain.eq).toHaveBeenCalledWith("status", "active");
    expect(chain.not).toHaveBeenCalledWith("drive_folder_id", "is", null);
  });

  it("passes client_id from noxx_clients row into each dispatched drive payload", async () => {
    const mockDb = makeSupabaseChain([fakeClient1]);
    vi.mocked(createClient).mockReturnValue(mockDb as any);
    vi.mocked(listPdfFiles).mockResolvedValue([fakeDriveFile]);
    vi.mocked(listMessagesWithPdfAttachments).mockResolvedValue([]);

    await collectInvoices.run({ sources: ["drive"], dryRun: false, previewOnly: false });

    const batchArgs = vi.mocked(processSingleInvoice.batchTrigger).mock.calls[0][0] as { payload: { client_id: string; folderRef: string } }[];
    expect(batchArgs[0].payload.client_id).toBe("client-uuid-aaa");
    expect(batchArgs[0].payload.folderRef).toBe("folder-aaa");
  });

  it("iterates over multiple clients and dispatches files from each folder", async () => {
    const mockDb = makeSupabaseChain([fakeClient1, fakeClient2]);
    vi.mocked(createClient).mockReturnValue(mockDb as any);
    vi.mocked(listPdfFiles)
      .mockResolvedValueOnce([fakeDriveFile])
      .mockResolvedValueOnce([fakeDriveFile2]);
    vi.mocked(listMessagesWithPdfAttachments).mockResolvedValue([]);

    const result = await collectInvoices.run({ sources: ["drive"], dryRun: false, previewOnly: false });

    expect(result).toMatchObject({ dispatched: 2 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const batchArgs = (vi.mocked(processSingleInvoice.batchTrigger).mock.calls as any[]).flat().flatMap(
      (call: { payload: { client_id: string } }[]) => call
    ) as { payload: { client_id: string } }[];
    const clientIds = batchArgs.map(a => a.payload.client_id);
    expect(clientIds).toContain("client-uuid-aaa");
    expect(clientIds).toContain("client-uuid-bbb");
  });

  it("logs clients_found at task start", async () => {
    const mockDb = makeSupabaseChain([fakeClient1, fakeClient2]);
    vi.mocked(createClient).mockReturnValue(mockDb as any);
    vi.mocked(listPdfFiles).mockResolvedValue([]);
    vi.mocked(listMessagesWithPdfAttachments).mockResolvedValue([]);

    const { logger } = await import("@trigger.dev/sdk");
    await collectInvoices.run({ sources: ["drive"], dryRun: false, previewOnly: false });

    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      "collect-invoices: start",
      expect.objectContaining({ clients_found: 2 })
    );
  });
});
