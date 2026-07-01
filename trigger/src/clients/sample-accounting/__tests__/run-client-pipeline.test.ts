import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================
// Mocks — declared before imports of module under test
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
  idempotencyKeys: {
    create: vi.fn().mockImplementation((key: string) => Promise.resolve(key)),
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

vi.mock("../process-single-invoice.task", () => ({
  processSingleInvoice: {
    id: "sample-process-single-invoice",
    batchTrigger: vi.fn().mockResolvedValue({ batchId: "batch-uuid-001", runCount: 0, publicAccessToken: "" }),
  },
}));

// ============================================================
// Imports after mocks
// ============================================================

import { createClient } from "@supabase/supabase-js";
import { idempotencyKeys } from "@trigger.dev/sdk";
import { processSingleInvoice } from "../process-single-invoice.task";
import { runClientPipeline as _runClientPipeline } from "../run-client-pipeline.task";
import type { RunClientPipelineResult } from "../run-client-pipeline.task";
import { z } from "zod";
import { RunClientPipelineSchema } from "../run-client-pipeline.task";

// TaskWithSchema doesn't expose .run in its type — cast to add it for test access
const runClientPipeline = _runClientPipeline as typeof _runClientPipeline & {
  run: (payload: z.infer<typeof RunClientPipelineSchema>) => Promise<RunClientPipelineResult>;
};

// ============================================================
// Helpers to build Supabase mock chain
// ============================================================

function makeAuditInsertChain(error: null | { message: string } = null) {
  return {
    insert: vi.fn().mockResolvedValue({ data: null, error }),
  };
}

/**
 * Build a 3-level mock: root → year subdirs → month subdirs → files.
 * Pass files as { name, year, month } tuples.
 * The mock .list() returns different results depending on the path prefix.
 *
 * For empty bucket pass: []
 */
function makeSupabaseMock(
  files: { name: string; year?: string; month?: string }[],
  auditError: null | { message: string } = null
) {
  const auditFrom = makeAuditInsertChain(auditError);

  // Build a map of prefix → entries for multi-level listing
  const listMap: Record<string, { name: string; id: string | null; metadata: Record<string, unknown> }[]> = {};

  if (files.length === 0) {
    // Empty bucket: root returns []
    listMap["__root__"] = [];
  } else {
    // Group files by year/month
    const byYear: Record<string, Record<string, string[]>> = {};
    for (const f of files) {
      const year  = f.year  ?? "2026";
      const month = f.month ?? "04";
      if (!byYear[year]) byYear[year] = {};
      if (!byYear[year][month]) byYear[year][month] = [];
      byYear[year][month].push(f.name);
    }

    // Root returns year directory entries (no id = placeholder dir)
    listMap["__root__"] = Object.keys(byYear).map((y) => ({ name: y, id: null, metadata: {} }));

    for (const [year, months] of Object.entries(byYear)) {
      // Year level returns month directory entries
      listMap[year] = Object.keys(months).map((m) => ({ name: m, id: null, metadata: {} }));

      for (const [month, fileNames] of Object.entries(months)) {
        const key = `${year}/${month}`;
        // Month level returns actual file entries (with id)
        listMap[key] = fileNames.map((n, i) => ({
          name:     n,
          id:       `file-id-${year}-${month}-${i}`,
          metadata: {},
        }));
      }
    }
  }

  // The .list() mock dispatches based on the path suffix
  const CLIENT_ID_PLACEHOLDER = "__CLIENT_ID__";
  const storageList = vi.fn().mockImplementation((prefix: string) => {
    // Strip the client_id prefix to get the path key
    // prefix is like "invoices/{client_id}" or "invoices/{client_id}/2026" etc.
    const parts = prefix.split("/");
    // parts[0] = "invoices", parts[1] = client_id, parts[2+] = year/month/...
    const suffix = parts.slice(2).join("/"); // "" for root, "2026" for year, "2026/04" for month

    const key = suffix === "" ? "__root__" : suffix;
    const data = listMap[key] ?? [];
    return Promise.resolve({ data, error: null });
  });

  return {
    storage: {
      from: vi.fn().mockReturnValue({ list: storageList }),
    },
    from: vi.fn().mockReturnValue(auditFrom),
    _storageList: storageList,
    _auditInsert: auditFrom.insert,
  };
}

// ============================================================
// Setup
// ============================================================

const CLIENT_ID    = "client-uuid-001";
const TRIGGERED_BY = "staff-uuid-001";
const BATCH_ID     = "batch-uuid-001";

beforeEach(() => {
  vi.clearAllMocks();
  process.env["SUPABASE_URL"]              = "https://test.supabase.co";
  process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-key";
});

// ============================================================
// T0.7 — Task contract
// ============================================================

describe("runClientPipeline — task contract", () => {
  it("exports a task with id 'sample-run-client-pipeline'", () => {
    expect(runClientPipeline).toBeDefined();
    expect(runClientPipeline.id).toBe("sample-run-client-pipeline");
  });

  it("has a run function", () => {
    expect(typeof runClientPipeline.run).toBe("function");
  });
});

// ============================================================
// T0.7 — Storage listing + batchTrigger dispatch
// ============================================================

describe("runClientPipeline — dispatches files from Storage (nested year/month)", () => {
  it("finds files at invoices/{clientId}/2026/04/ and batchTriggers one per file", async () => {
    const mockDb = makeSupabaseMock([
      { name: "uuid-factura01.pdf", year: "2026", month: "04" },
      { name: "uuid-factura02.pdf", year: "2026", month: "04" },
    ]);
    vi.mocked(createClient).mockReturnValue(mockDb as any);

    const result = await runClientPipeline.run({
      client_id:    CLIENT_ID,
      triggered_by: TRIGGERED_BY,
    });

    // Storage listing called on correct bucket
    expect(mockDb.storage.from).toHaveBeenCalledWith("noxx-invoices");
    // Root prefix called
    expect(mockDb._storageList).toHaveBeenCalledWith(
      `invoices/${CLIENT_ID}`,
      expect.any(Object)
    );

    // batchTrigger called once with 2 items
    expect(processSingleInvoice.batchTrigger).toHaveBeenCalledTimes(1);
    const items = vi.mocked(processSingleInvoice.batchTrigger).mock.calls[0][0] as {
      payload: { sourceType: string; storageKey: string; fileName: string; client_id: string };
    }[];
    expect(items).toHaveLength(2);
    expect(items[0].payload.sourceType).toBe("storage");
    expect(items[0].payload.client_id).toBe(CLIENT_ID);
    expect(items[0].payload.fileName).toBe("uuid-factura01.pdf");
    expect(items[0].payload.storageKey).toBe(`invoices/${CLIENT_ID}/2026/04/uuid-factura01.pdf`);
    expect(items[1].payload.fileName).toBe("uuid-factura02.pdf");

    expect(result).toMatchObject({ dispatched: 2 });
  });

  it("finds files across multiple year/month combos", async () => {
    const mockDb = makeSupabaseMock([
      { name: "jan-file.pdf", year: "2026", month: "01" },
      { name: "apr-file.pdf", year: "2026", month: "04" },
    ]);
    vi.mocked(createClient).mockReturnValue(mockDb as any);

    const result = await runClientPipeline.run({
      client_id:    CLIENT_ID,
      triggered_by: TRIGGERED_BY,
    });

    expect(result).toMatchObject({ dispatched: 2 });
    const items = vi.mocked(processSingleInvoice.batchTrigger).mock.calls[0][0] as {
      payload: { storageKey: string };
    }[];
    const keys = items.map(i => i.payload.storageKey);
    expect(keys).toContain(`invoices/${CLIENT_ID}/2026/01/jan-file.pdf`);
    expect(keys).toContain(`invoices/${CLIENT_ID}/2026/04/apr-file.pdf`);
  });

  it("passes batch_id in each payload when provided", async () => {
    const mockDb = makeSupabaseMock([
      { name: "uuid-factura01.pdf", year: "2026", month: "04" },
    ]);
    vi.mocked(createClient).mockReturnValue(mockDb as any);

    await runClientPipeline.run({
      client_id:    CLIENT_ID,
      triggered_by: TRIGGERED_BY,
      batch_id:     BATCH_ID,
    });

    const items = vi.mocked(processSingleInvoice.batchTrigger).mock.calls[0][0] as {
      payload: { batch_id?: string };
    }[];
    expect(items[0].payload.batch_id).toBe(BATCH_ID);
  });
});

// ============================================================
// T0.7 — Empty bucket: no dispatch, no error
// ============================================================

describe("runClientPipeline — empty bucket", () => {
  it("does NOT call batchTrigger when no files are found", async () => {
    const mockDb = makeSupabaseMock([]);
    vi.mocked(createClient).mockReturnValue(mockDb as any);

    const { logger } = await import("@trigger.dev/sdk");
    const result = await runClientPipeline.run({
      client_id:    CLIENT_ID,
      triggered_by: TRIGGERED_BY,
    });

    expect(processSingleInvoice.batchTrigger).not.toHaveBeenCalled();
    expect(result).toMatchObject({ dispatched: 0 });

    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      "run-client-pipeline: no files found",
      expect.objectContaining({ client_id: CLIENT_ID })
    );
  });
});

// ============================================================
// T0.7 — audit_log INSERT (CRITICAL-6 Round 2: aligned contract)
// ============================================================

describe("runClientPipeline — audit_log insert (CRITICAL-6: portal contract)", () => {
  it("uses table_name='pipeline_trigger' so the portal can filter correctly", async () => {
    const mockDb = makeSupabaseMock([{ name: "uuid-factura01.pdf" }]);
    vi.mocked(createClient).mockReturnValue(mockDb as any);

    await runClientPipeline.run({
      client_id:    CLIENT_ID,
      triggered_by: TRIGGERED_BY,
    });

    expect(mockDb.from).toHaveBeenCalledWith("audit_log");
    expect(mockDb._auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        table_name: "pipeline_trigger",
      })
    );
  });

  it("includes new_data.client_id and new_data.files_found for portal display", async () => {
    const mockDb = makeSupabaseMock([
      { name: "uuid-factura01.pdf" },
      { name: "uuid-factura02.pdf" },
    ]);
    vi.mocked(createClient).mockReturnValue(mockDb as any);

    await runClientPipeline.run({
      client_id:    CLIENT_ID,
      triggered_by: TRIGGERED_BY,
    });

    expect(mockDb._auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        table_name: "pipeline_trigger",
        operation:  "TRIGGER",
        row_id:     CLIENT_ID,
        new_data:   expect.objectContaining({
          client_id:   CLIENT_ID,
          files_found: 2,
        }),
      })
    );
  });

  it("sets staff_user_id from triggered_by payload", async () => {
    const mockDb = makeSupabaseMock([{ name: "uuid-factura01.pdf" }]);
    vi.mocked(createClient).mockReturnValue(mockDb as any);

    await runClientPipeline.run({
      client_id:    CLIENT_ID,
      triggered_by: TRIGGERED_BY,
    });

    expect(mockDb._auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        staff_user_id: TRIGGERED_BY,
      })
    );
  });

  it("inserts audit_log with files_found=0 when bucket is empty", async () => {
    const mockDb = makeSupabaseMock([]);
    vi.mocked(createClient).mockReturnValue(mockDb as any);

    await runClientPipeline.run({
      client_id:    CLIENT_ID,
      triggered_by: TRIGGERED_BY,
    });

    expect(mockDb._auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        table_name:    "pipeline_trigger",
        operation:     "TRIGGER",
        row_id:        CLIENT_ID,
        staff_user_id: TRIGGERED_BY,
        new_data:      expect.objectContaining({
          client_id:   CLIENT_ID,
          files_found: 0,
        }),
      })
    );
  });
});

// ============================================================
// T0.7 — Payload validation
// ============================================================

describe("runClientPipeline — payload schema", () => {
  it("accepts valid payload with just client_id and triggered_by", async () => {
    const mockDb = makeSupabaseMock([]);
    vi.mocked(createClient).mockReturnValue(mockDb as any);

    await expect(
      runClientPipeline.run({ client_id: CLIENT_ID, triggered_by: TRIGGERED_BY })
    ).resolves.toBeDefined();
  });

  it("accepts optional batch_id", async () => {
    const mockDb = makeSupabaseMock([]);
    vi.mocked(createClient).mockReturnValue(mockDb as any);

    await expect(
      runClientPipeline.run({ client_id: CLIENT_ID, triggered_by: TRIGGERED_BY, batch_id: BATCH_ID })
    ).resolves.toBeDefined();
  });
});

// ============================================================
// TA.3 — Idempotency keys in batchTrigger dispatch (A3-FR-001)
// ============================================================

describe("runClientPipeline — idempotency keys on batchTrigger items (A3-FR-001)", () => {
  it("creates an idempotency key using client_id and batch_id when batch_id is provided", async () => {
    const mockDb = makeSupabaseMock([
      { name: "uuid-factura01.pdf", year: "2026", month: "04" },
    ]);
    vi.mocked(createClient).mockReturnValue(mockDb as any);

    await runClientPipeline.run({
      client_id:    CLIENT_ID,
      triggered_by: TRIGGERED_BY,
      batch_id:     BATCH_ID,
    });

    expect(vi.mocked(idempotencyKeys.create)).toHaveBeenCalledWith(
      `sample-pipeline-${CLIENT_ID}-${BATCH_ID}`
    );
  });

  it("creates an idempotency key using client_id and timestamp when no batch_id provided", async () => {
    const mockDb = makeSupabaseMock([
      { name: "uuid-factura01.pdf", year: "2026", month: "04" },
    ]);
    vi.mocked(createClient).mockReturnValue(mockDb as any);

    await runClientPipeline.run({
      client_id:    CLIENT_ID,
      triggered_by: TRIGGERED_BY,
    });

    const calls = vi.mocked(idempotencyKeys.create).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const keyArg = calls[0][0] as string;
    expect(keyArg).toMatch(/^sample-pipeline-client-uuid-001-\d+$/);
  });

  it("passes idempotencyKey and idempotencyKeyTTL to each batchTrigger item", async () => {
    const mockDb = makeSupabaseMock([
      { name: "uuid-factura01.pdf", year: "2026", month: "04" },
      { name: "uuid-factura02.pdf", year: "2026", month: "04" },
    ]);
    vi.mocked(createClient).mockReturnValue(mockDb as any);

    await runClientPipeline.run({
      client_id:    CLIENT_ID,
      triggered_by: TRIGGERED_BY,
      batch_id:     BATCH_ID,
    });

    const items = vi.mocked(processSingleInvoice.batchTrigger).mock.calls[0][0] as {
      payload: { fileName: string };
      options?: { idempotencyKey: string; idempotencyKeyTTL: string };
    }[];

    expect(items).toHaveLength(2);
    // Each item must have idempotency options scoped per-file
    for (const item of items) {
      expect(item.options).toBeDefined();
      expect(item.options?.idempotencyKey).toContain(CLIENT_ID);
      expect(item.options?.idempotencyKeyTTL).toBe("1h");
    }
    // Keys must differ per file (scoped to fileName)
    expect(items[0].options?.idempotencyKey).not.toBe(items[1].options?.idempotencyKey);
  });

  it("does NOT call idempotencyKeys.create when no files are found (empty bucket)", async () => {
    const mockDb = makeSupabaseMock([]);
    vi.mocked(createClient).mockReturnValue(mockDb as any);

    await runClientPipeline.run({
      client_id:    CLIENT_ID,
      triggered_by: TRIGGERED_BY,
    });

    expect(vi.mocked(idempotencyKeys.create)).not.toHaveBeenCalled();
  });
});
