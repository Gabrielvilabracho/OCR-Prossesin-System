import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Supabase singleton BEFORE importing persistence
const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();

// Build a chainable mock that returns itself for .select, .eq, etc.
const buildChain = () => {
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: mockSingle,
    maybeSingle: mockMaybeSingle,
  };
  return chain;
};

let mockChain = buildChain();

vi.mock("../supabase", () => ({
  supabase: {
    from: vi.fn(() => mockChain),
  },
}));

import { supabase } from "../supabase";
import {
  createAgentRun,
  updateAgentRun,
  getAgentRun,
  logAgentStep,
  requestApproval,
  checkApproval,
  resolveApproval,
  PersistenceError,
} from "../persistence";
import type { AgentStep } from "../agent-types";

const mockFrom = vi.mocked(supabase.from);

function resetChain() {
  mockChain = buildChain();
  mockFrom.mockReturnValue(mockChain as never);
}

describe("createAgentRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChain();
  });

  it("inserts a row into agent_runs and returns the UUID", async () => {
    mockSingle.mockResolvedValue({ data: { id: "run-uuid-123" }, error: null });

    const id = await createAgentRun({
      agentId: "lead-qualifier",
      triggerRunId: "trigger-run-1",
      input: { leadId: "1" },
    });

    expect(id).toBe("run-uuid-123");
    expect(mockFrom).toHaveBeenCalledWith("agent_runs");
  });

  it("throws PersistenceError on Supabase error", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: "connection refused" } });

    await expect(
      createAgentRun({
        agentId: "lead-qualifier",
        triggerRunId: "trigger-run-1",
        input: {},
      }),
    ).rejects.toThrow(PersistenceError);

    await expect(
      createAgentRun({
        agentId: "lead-qualifier",
        triggerRunId: "trigger-run-1",
        input: {},
      }),
    ).rejects.toThrow(/connection refused/);
  });
});

describe("updateAgentRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChain();
  });

  it("updates agent_runs without error on success", async () => {
    mockChain.eq.mockResolvedValue({ error: null });

    await expect(
      updateAgentRun({ runId: "run-1", status: "completed" }),
    ).resolves.toBeUndefined();

    expect(mockFrom).toHaveBeenCalledWith("agent_runs");
  });

  it("throws PersistenceError on Supabase error", async () => {
    mockChain.eq.mockResolvedValue({ error: { message: "timeout" } });

    await expect(
      updateAgentRun({ runId: "run-1", status: "failed", error: "LLM timeout" }),
    ).rejects.toThrow(PersistenceError);
  });
});

describe("getAgentRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChain();
  });

  it("returns mapped AgentRunRecord on success", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: "run-uuid-1",
        agent_id: "lead-qualifier",
        trigger_run_id: "trigger-1",
        status: "running",
        input: { leadId: "1" },
        output: null,
        error: null,
        token_usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        started_at: "2026-04-06T12:00:00Z",
        completed_at: null,
        metadata: null,
      },
      error: null,
    });

    const run = await getAgentRun("run-uuid-1");
    expect(run).not.toBeNull();
    expect(run?.id).toBe("run-uuid-1");
    expect(run?.agentId).toBe("lead-qualifier");
    expect(run?.triggerRunId).toBe("trigger-1");
  });

  it("returns null when row not found", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const run = await getAgentRun("nonexistent-id");
    expect(run).toBeNull();
  });

  it("throws PersistenceError on Supabase error", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: "query failed" } });

    await expect(getAgentRun("run-1")).rejects.toThrow(PersistenceError);
  });
});

describe("logAgentStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChain();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  const validStep: AgentStep = {
    stepName: "classify-lead",
    input: { data: "test" },
    output: { score: 0.9 },
    tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    durationMs: 500,
  };

  it("inserts into agent_steps on success", async () => {
    mockChain.insert.mockResolvedValue({ error: null });

    await expect(logAgentStep({ runId: "run-1", step: validStep })).resolves.toBeUndefined();
    expect(mockFrom).toHaveBeenCalledWith("agent_steps");
  });

  it("does NOT throw on Supabase error — calls console.warn instead", async () => {
    mockChain.insert.mockResolvedValue({ error: { message: "timeout" } });

    await expect(logAgentStep({ runId: "run-1", step: validStep })).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledOnce();
    expect(vi.mocked(console.warn).mock.calls[0][0]).toMatch(/timeout/);
  });
});

describe("requestApproval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChain();
  });

  it("inserts into approvals with pending status and returns ID", async () => {
    mockSingle.mockResolvedValue({ data: { id: "approval-uuid-456" }, error: null });

    const approvalId = await requestApproval({
      runId: "run-1",
      agentId: "invoice-generator",
      stepName: "approve-payment",
      payload: { amount: 5000 },
      reason: "Amount exceeds threshold",
    });

    expect(approvalId).toBe("approval-uuid-456");
    expect(mockFrom).toHaveBeenCalledWith("approvals");
    // Verify 'status: pending' was inserted
    expect(mockChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending" }),
    );
  });

  it("throws PersistenceError on Supabase error", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: "FK violation" } });

    await expect(
      requestApproval({
        runId: "run-1",
        agentId: "agent",
        stepName: "step",
        payload: {},
        reason: "reason",
      }),
    ).rejects.toThrow(PersistenceError);
  });
});

describe("checkApproval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChain();
  });

  it("returns current approval status", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { status: "approved", decided_by: "admin@example.com", decided_at: "2026-04-06T13:00:00Z" },
      error: null,
    });

    const result = await checkApproval("approval-uuid-456");
    expect(result.status).toBe("approved");
    expect(result.decidedBy).toBe("admin@example.com");
  });

  it("throws PersistenceError when approval not found", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(checkApproval("nonexistent-id")).rejects.toThrow(PersistenceError);
    await expect(checkApproval("nonexistent-id")).rejects.toThrow(/nonexistent-id/);
  });

  it("throws PersistenceError on Supabase error", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: "DB error" } });

    await expect(checkApproval("approval-1")).rejects.toThrow(PersistenceError);
  });
});

describe("resolveApproval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChain();
  });

  it("updates approvals with status, decidedBy, and decidedAt", async () => {
    mockChain.eq.mockResolvedValue({ error: null });

    await expect(
      resolveApproval({
        approvalId: "approval-1",
        status: "approved",
        decidedBy: "admin@example.com",
      }),
    ).resolves.toBeUndefined();

    expect(mockFrom).toHaveBeenCalledWith("approvals");
    expect(mockChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "approved",
        decided_by: "admin@example.com",
      }),
    );
  });

  it("throws PersistenceError on Supabase error", async () => {
    mockChain.eq.mockResolvedValue({ error: { message: "update failed" } });

    await expect(
      resolveApproval({ approvalId: "approval-1", status: "rejected", decidedBy: "admin" }),
    ).rejects.toThrow(PersistenceError);
  });
});

// =============================================================================
// Boundary assertion — central persistence scope
// =============================================================================
// REQ-004 / REQ-023: The central Supabase MUST only contain the following tables.
// This test ensures no new .from("…") call targets an unexpected table name.
// It is a STATIC assertion — no live DB required.
//
// ALLOWED_TABLES is the canonical allowlist. If a new table is added to the
// central schema, it MUST be explicitly added here AND justified in design.md.
// =============================================================================

const ALLOWED_TABLES = new Set([
  "agent_runs",
  "agent_steps",
  "approvals",
  "clients",
  "projects",
]);

describe("central persistence boundary (REQ-004 / REQ-023)", () => {
  it("every supabase.from() call in persistence.ts targets an allowed table", async () => {
    // Collect all table names passed to supabase.from() across existing tests
    // by inspecting the calls recorded by the mock.
    // We reset the mock fresh here and replay each public function once so the
    // spy captures the table names used at runtime.

    vi.clearAllMocks();
    resetChain();

    // Wire up minimal success responses so functions don't throw
    mockSingle.mockResolvedValue({ data: { id: "boundary-id" }, error: null });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockChain.eq.mockResolvedValue({ error: null });
    mockChain.insert.mockResolvedValue({ error: null });

    // Exercise every exported function to touch its table
    await createAgentRun({ agentId: "a", triggerRunId: "t", input: {} }).catch(() => undefined);
    await updateAgentRun({ runId: "r", status: "completed" }).catch(() => undefined);
    await getAgentRun("r").catch(() => undefined);
    await logAgentStep({ runId: "r", step: { stepName: "s" } }).catch(() => undefined);
    await requestApproval({ runId: "r", agentId: "a", stepName: "s", payload: {}, reason: "x" }).catch(() => undefined);
    await checkApproval("ap").catch(() => undefined);
    await resolveApproval({ approvalId: "ap", status: "approved", decidedBy: "admin" }).catch(() => undefined);

    // Extract every table name passed to supabase.from()
    const calledTables = mockFrom.mock.calls.map((call) => call[0] as string);

    for (const table of calledTables) {
      expect(
        ALLOWED_TABLES.has(table),
        `supabase.from("${table}") is NOT in the allowed central-schema table list. ` +
          `Add it to ALLOWED_TABLES only if it belongs to the central control-plane schema.`,
      ).toBe(true);
    }
  });

  it("ALLOWED_TABLES matches the documented central schema (static contract)", () => {
    // This test documents the exact set. Any addition is a deliberate contract change.
    expect([...ALLOWED_TABLES].sort()).toEqual([
      "agent_runs",
      "agent_steps",
      "approvals",
      "clients",
      "projects",
    ]);
  });
});
