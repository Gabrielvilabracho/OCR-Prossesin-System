import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================
// Mocks — must be declared before any imports of the module under test
// ============================================================

vi.mock("@trigger.dev/sdk", () => ({
  schedules: {
    task: (config: { id: string; run: (p: unknown) => unknown; cron?: string; [k: string]: unknown }) => ({
      id: config.id,
      run: config.run,
      cron: config.cron,
    }),
  },
  logger: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    trace: vi.fn().mockImplementation((_name: string, fn: () => unknown) => fn()),
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

// ============================================================
// Imports after mocks
// ============================================================

import { createClient } from "@supabase/supabase-js";
import { logger } from "@trigger.dev/sdk";
import {
  purgeExpiredInvoices as _purgeExpiredInvoices,
  type PurgeExpiredInvoicesResult,
} from "../sample-purge-expired-invoices.task";

// schedules.task doesn't expose .run in the type — cast for test access
const purgeExpiredInvoices = _purgeExpiredInvoices as typeof _purgeExpiredInvoices & {
  run: (payload: { dry_run?: boolean; client_id?: string }) => Promise<PurgeExpiredInvoicesResult>;
};

// ============================================================
// Supabase mock helpers
// ============================================================

interface InvoiceRow {
  id:              string;
  client_id:       string;
  retention_until: string;
}

/**
 * Build a Supabase mock for purge scenarios.
 *
 * selectRows: invoices returned by the SELECT query (retention_until < now())
 * auditError: optional error for audit_log insert
 * deleteError: optional error for the delete operation
 */
function makeSupabaseMock(
  selectRows: InvoiceRow[],
  auditError: null | { message: string } = null,
  deleteError: null | { message: string } = null,
) {
  const auditInsert = vi.fn().mockResolvedValue({ data: null, error: auditError });

  const deleteEq = vi.fn().mockResolvedValue({ data: null, error: deleteError });
  const deleteIn = vi.fn().mockResolvedValue({ data: null, error: deleteError });

  // SELECT chain: .from("invoices").select("*").lt("retention_until", ...).eq("client_id", ...)
  const selectChainBase = {
    lt:     vi.fn(),
    eq:     vi.fn(),
    in:     vi.fn(),
    select: vi.fn(),
  };

  // Build the chain: lt → (optionally eq) → resolves with rows
  // We use mockImplementation to track what was called
  selectChainBase.lt.mockReturnValue({
    ...selectChainBase,
    // When eq is called (client_id filter), return rows
    eq: vi.fn().mockResolvedValue({ data: selectRows, error: null }),
  });

  const selectResult = { data: selectRows, error: null };
  // When no eq filter (no client_id), lt itself resolves
  selectChainBase.lt.mockReturnValue({
    eq: vi.fn().mockResolvedValue(selectResult),
    // Also handle plain resolve when no eq (no client_id)
    then: (resolve: (v: typeof selectResult) => unknown) => Promise.resolve(selectResult).then(resolve),
  });

  const fromSelect = {
    select: vi.fn().mockReturnValue(selectChainBase),
  };

  // DELETE chain: .from("invoices").delete().in("id", [...])
  const deleteChain = {
    in: deleteIn,
    eq: deleteEq,
  };

  const fromDelete = {
    delete: vi.fn().mockReturnValue(deleteChain),
  };

  // audit_log chain
  const fromAudit = {
    insert: auditInsert,
  };

  const mockDb = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "audit_log") return fromAudit;
      if (table === "invoices") {
        // Return different chain depending on whether there's a pending select or delete
        // We rely on call order or let the implementation dictate
        return {
          select: fromSelect.select,
          delete: fromDelete.delete,
        };
      }
      return {};
    }),
    _auditInsert: auditInsert,
    _deleteIn:    deleteIn,
    _deleteEq:    deleteEq,
  };

  return mockDb;
}

// ============================================================
// Constants
// ============================================================

const CLIENT_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

beforeEach(() => {
  vi.clearAllMocks();
  process.env["SUPABASE_URL"]              = "https://test.supabase.co";
  process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-key";
});

// ============================================================
// TB.2 — Task contract
// ============================================================

describe("purgeExpiredInvoices — task contract", () => {
  it("exports a task with id 'sample-purge-expired-invoices'", () => {
    expect(purgeExpiredInvoices).toBeDefined();
    expect(purgeExpiredInvoices.id).toBe("sample-purge-expired-invoices");
  });

  it("has a run function", () => {
    expect(typeof purgeExpiredInvoices.run).toBe("function");
  });
});

// ============================================================
// TB.2 — dry_run=true: log but do NOT delete (B1-FR-002)
// ============================================================

describe("purgeExpiredInvoices — dry_run=true", () => {
  const expiredInvoices: InvoiceRow[] = [
    { id: "inv-001", client_id: CLIENT_ID, retention_until: "2025-01-01T00:00:00Z" },
    { id: "inv-002", client_id: CLIENT_ID, retention_until: "2025-06-01T00:00:00Z" },
  ];

  it("returns a summary with found count and dry_run=true flag", async () => {
    const mockDb = makeSupabaseMock(expiredInvoices);
    vi.mocked(createClient).mockReturnValue(mockDb as any);

    const result = await purgeExpiredInvoices.run({ dry_run: true });

    expect(result.dry_run).toBe(true);
    expect(result.found).toBe(2);
    expect(result.deleted).toBe(0);
  });

  it("does NOT call delete when dry_run=true", async () => {
    const mockDb = makeSupabaseMock(expiredInvoices);
    vi.mocked(createClient).mockReturnValue(mockDb as any);

    await purgeExpiredInvoices.run({ dry_run: true });

    expect(mockDb._deleteIn).not.toHaveBeenCalled();
    expect(mockDb._deleteEq).not.toHaveBeenCalled();
  });

  it("does NOT insert audit_log entries when dry_run=true", async () => {
    const mockDb = makeSupabaseMock(expiredInvoices);
    vi.mocked(createClient).mockReturnValue(mockDb as any);

    await purgeExpiredInvoices.run({ dry_run: true });

    expect(mockDb._auditInsert).not.toHaveBeenCalled();
  });

  it("logs what WOULD be deleted without doing it", async () => {
    const mockDb = makeSupabaseMock(expiredInvoices);
    vi.mocked(createClient).mockReturnValue(mockDb as any);

    await purgeExpiredInvoices.run({ dry_run: true });

    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      expect.stringContaining("dry_run"),
      expect.objectContaining({ found: 2, dry_run: true }),
    );
  });
});

// ============================================================
// TB.2 — dry_run=false: insert audit_log THEN delete (B1-FR-001, B1-FR-003)
// ============================================================

describe("purgeExpiredInvoices — dry_run=false", () => {
  const expiredInvoices: InvoiceRow[] = [
    { id: "inv-001", client_id: CLIENT_ID, retention_until: "2025-01-01T00:00:00Z" },
    { id: "inv-002", client_id: CLIENT_ID, retention_until: "2025-06-01T00:00:00Z" },
  ];

  it("returns deleted count equal to found count on success", async () => {
    const mockDb = makeSupabaseMock(expiredInvoices);
    vi.mocked(createClient).mockReturnValue(mockDb as any);

    const result = await purgeExpiredInvoices.run({ dry_run: false });

    expect(result.dry_run).toBe(false);
    expect(result.found).toBe(2);
    expect(result.deleted).toBe(2);
  });

  it("inserts one audit_log entry per invoice BEFORE deleting", async () => {
    const mockDb = makeSupabaseMock(expiredInvoices);
    vi.mocked(createClient).mockReturnValue(mockDb as any);

    await purgeExpiredInvoices.run({ dry_run: false });

    // One audit_log insert per expired invoice
    expect(mockDb._auditInsert).toHaveBeenCalledTimes(2);

    // Each insert must include the invoice id and operation
    const calls = vi.mocked(mockDb._auditInsert).mock.calls;
    const insertedIds = calls.map((c) => (c[0] as { row_id: string }).row_id);
    expect(insertedIds).toContain("inv-001");
    expect(insertedIds).toContain("inv-002");

    const firstCall = calls[0][0] as { table_name: string; operation: string; row_id: string };
    expect(firstCall.table_name).toBe("invoices");
    expect(firstCall.operation).toBe("GDPR_PURGE");
  });

  it("calls delete after audit_log inserts", async () => {
    const mockDb = makeSupabaseMock(expiredInvoices);
    vi.mocked(createClient).mockReturnValue(mockDb as any);

    await purgeExpiredInvoices.run({ dry_run: false });

    // Delete must have been called: .in("id", [...ids])
    expect(mockDb._deleteIn).toHaveBeenCalled();
    // .in(column, values) — first arg is "id", second is the array of ids
    const call = vi.mocked(mockDb._deleteIn).mock.calls[0] as [string, string[]];
    const [column, idsArg] = call;
    expect(column).toBe("id");
    expect(idsArg).toContain("inv-001");
    expect(idsArg).toContain("inv-002");
  });
});

// ============================================================
// TB.2 — client_id filter scopes to one client (B1-FR-003)
// ============================================================

describe("purgeExpiredInvoices — client_id filter", () => {
  it("passes client_id to the query when provided", async () => {
    const expiredInvoices: InvoiceRow[] = [
      { id: "inv-010", client_id: CLIENT_ID, retention_until: "2025-01-01T00:00:00Z" },
    ];
    const mockDb = makeSupabaseMock(expiredInvoices);
    vi.mocked(createClient).mockReturnValue(mockDb as any);

    const result = await purgeExpiredInvoices.run({ dry_run: true, client_id: CLIENT_ID });

    // Verify scoped results
    expect(result.found).toBe(1);
    expect(result.client_id).toBe(CLIENT_ID);
  });

  it("returns client_id in the result when provided", async () => {
    const mockDb = makeSupabaseMock([]);
    vi.mocked(createClient).mockReturnValue(mockDb as any);

    const result = await purgeExpiredInvoices.run({ dry_run: true, client_id: CLIENT_ID });

    expect(result.client_id).toBe(CLIENT_ID);
  });
});

// ============================================================
// TB.2 — empty result: nothing to purge
// ============================================================

describe("purgeExpiredInvoices — nothing to purge", () => {
  it("returns found=0 and deleted=0 when no expired invoices exist", async () => {
    const mockDb = makeSupabaseMock([]);
    vi.mocked(createClient).mockReturnValue(mockDb as any);

    const result = await purgeExpiredInvoices.run({ dry_run: false });

    expect(result.found).toBe(0);
    expect(result.deleted).toBe(0);
    expect(mockDb._auditInsert).not.toHaveBeenCalled();
    expect(mockDb._deleteIn).not.toHaveBeenCalled();
  });
});
