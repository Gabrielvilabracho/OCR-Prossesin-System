import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock @trigger.dev/sdk before any imports ---
vi.mock("@trigger.dev/sdk", () => ({
  batch: {
    triggerAndWait: vi.fn(),
    triggerByTaskAndWait: vi.fn(),
  },
  wait: {
    createToken: vi.fn(),
    forToken: vi.fn(),
  },
  tasks: {
    triggerAndWait: vi.fn(),
  },
  // agent-runner.ts uses schemaTask and logger
  schemaTask: vi.fn((args: Record<string, unknown>) => ({
    id: args.id,
    schema: args.schema,
    _isMockTask: true,
  })),
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("../../../lib/llm", () => ({
  llmGenerateObject: vi.fn(),
}));

vi.mock("../../../lib/prompts", () => ({
  loadPrompt: vi.fn(),
}));

vi.mock("../../../lib/persistence", () => ({
  createAgentRun: vi.fn(),
  updateAgentRun: vi.fn(),
  logAgentStep: vi.fn(),
  requestApproval: vi.fn(),
}));

import { batch, wait, tasks } from "@trigger.dev/sdk";
import { llmGenerateObject } from "../../../lib/llm";
import { loadPrompt } from "../../../lib/prompts";
import { requestApproval } from "../../../lib/persistence";
import {
  routeIntent,
  dispatchAgent,
  dispatchParallel,
  dispatchSequential,
  OrchestratorInputSchema,
  RoutingDecisionSchema,
} from "../workflow-orchestrator";
import type { AgentContext } from "../../../lib/agent-types";

const mockBatch = vi.mocked(batch);
const mockWait = vi.mocked(wait);
const mockTasks = vi.mocked(tasks);
const mockLlmGenerateObject = vi.mocked(llmGenerateObject);
const mockLoadPrompt = vi.mocked(loadPrompt);
const mockRequestApproval = vi.mocked(requestApproval);

// --- Test registry entries (2 fake agents, simple schemas) ---
// We inject them into the live AGENT_REGISTRY via the module for tests that need them.
// For registry-dependent tests we use getAgentById lookups which pull from the live registry.
// Since mock-agent is already in the registry (Block 1 entry), we test against it.

// --- Mock AgentContext factory ---
function makeCtx(overrides?: Partial<AgentContext>): AgentContext {
  return {
    runId: "run-test-001",
    triggerRunId: "trigger-run-test-001",
    config: {
      id: "workflow-orchestrator",
      name: "Workflow Orchestrator",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      temperature: 0,
    },
    logStep: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// --- Schema Tests ---

describe("OrchestratorInputSchema", () => {
  it("accepts valid input with intent only", () => {
    const result = OrchestratorInputSchema.safeParse({ intent: "do something" });
    expect(result.success).toBe(true);
  });

  it("rejects empty intent (REQ-07)", () => {
    const result = OrchestratorInputSchema.safeParse({ intent: "" });
    expect(result.success).toBe(false);
  });

  it("accepts optional context and requestedAgentId", () => {
    const result = OrchestratorInputSchema.safeParse({
      intent: "run this",
      context: { key: "value" },
      requestedAgentId: "mock-agent",
    });
    expect(result.success).toBe(true);
  });

  it("requestedAgentId is undefined when absent", () => {
    const parsed = OrchestratorInputSchema.parse({ intent: "test" });
    expect(parsed.requestedAgentId).toBeUndefined();
  });
});

describe("RoutingDecisionSchema", () => {
  it("accepts valid routing decision", () => {
    const result = RoutingDecisionSchema.safeParse({
      selectedAgents: [{ taskId: "mock-agent", reasoning: "fits", input: {} }],
      strategy: "sequential",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid strategy", () => {
    const result = RoutingDecisionSchema.safeParse({
      selectedAgents: [],
      strategy: "random",
    });
    expect(result.success).toBe(false);
  });
});

// --- routeIntent: direct path ---

describe("routeIntent — direct dispatch path (REQ-09)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadPrompt.mockResolvedValue("system prompt");
    mockLlmGenerateObject.mockResolvedValue({
      object: {
        selectedAgents: [{ taskId: "mock-agent", reasoning: "test", input: {} }],
        strategy: "sequential" as const,
      },
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      finishReason: "stop",
    });
  });

  it("returns direct routing decision without calling llmGenerateObject (REQ-09)", async () => {
    const ctx = makeCtx();
    const input = { intent: "test intent", requestedAgentId: "mock-agent" };

    const decision = await routeIntent(input, ctx);

    expect(mockLlmGenerateObject).not.toHaveBeenCalled();
    expect(decision.selectedAgents[0]?.taskId).toBe("mock-agent");
    expect(decision.strategy).toBe("sequential");
  });

  it("throws when requestedAgentId is not in registry (REQ-09, REQ-12)", async () => {
    const ctx = makeCtx();
    const input = { intent: "test intent", requestedAgentId: "ghost-agent" };

    await expect(routeIntent(input, ctx)).rejects.toThrow("ghost-agent");
    expect(mockLlmGenerateObject).not.toHaveBeenCalled();
  });

  it("passes input.context as agent input in direct dispatch", async () => {
    const ctx = makeCtx();
    const input = {
      intent: "test",
      requestedAgentId: "mock-agent",
      context: { leadId: "123" },
    };

    const decision = await routeIntent(input, ctx);
    expect(decision.selectedAgents[0]?.input).toEqual({ leadId: "123" });
  });

  it("uses empty object when context is absent in direct dispatch", async () => {
    const ctx = makeCtx();
    const input = { intent: "test", requestedAgentId: "mock-agent" };

    const decision = await routeIntent(input, ctx);
    expect(decision.selectedAgents[0]?.input).toEqual({});
  });

  it("logs route-intent step", async () => {
    const ctx = makeCtx();
    const input = { intent: "test", requestedAgentId: "mock-agent" };

    await routeIntent(input, ctx);

    expect(ctx.logStep).toHaveBeenCalledWith(
      expect.objectContaining({ stepName: "route-intent" }),
    );
  });
});

// --- routeIntent: LLM path ---

describe("routeIntent — LLM routing path (REQ-10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadPrompt.mockResolvedValue("system prompt with registry");
  });

  it("calls llmGenerateObject when requestedAgentId is absent (REQ-10)", async () => {
    const ctx = makeCtx();
    mockLlmGenerateObject.mockResolvedValue({
      object: {
        selectedAgents: [{ taskId: "mock-agent", reasoning: "fits", input: {} }],
        strategy: "sequential" as const,
      },
      tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      finishReason: "stop",
    });

    await routeIntent({ intent: "process something" }, ctx);

    expect(mockLlmGenerateObject).toHaveBeenCalledOnce();
  });

  it("calls loadPrompt with 'orchestrator' agent name (REQ-10)", async () => {
    const ctx = makeCtx();
    mockLlmGenerateObject.mockResolvedValue({
      object: {
        selectedAgents: [{ taskId: "mock-agent", reasoning: "test", input: {} }],
        strategy: "sequential" as const,
      },
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      finishReason: "stop",
    });

    await routeIntent({ intent: "do something" }, ctx);

    expect(mockLoadPrompt).toHaveBeenCalledWith(
      "orchestrator",
      expect.objectContaining({
        registrySummary: expect.any(String),
        intent: "do something",
      }),
    );
  });

  it("throws when LLM returns an ID not in the registry (REQ-11)", async () => {
    const ctx = makeCtx();
    mockLlmGenerateObject.mockResolvedValue({
      object: {
        selectedAgents: [{ taskId: "hallucinated-agent", reasoning: "made up", input: {} }],
        strategy: "sequential" as const,
      },
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      finishReason: "stop",
    });

    await expect(routeIntent({ intent: "do something" }, ctx)).rejects.toThrow(
      "hallucinated-agent",
    );
  });

  it("returns valid routing decision for known agent ID", async () => {
    const ctx = makeCtx();
    mockLlmGenerateObject.mockResolvedValue({
      object: {
        selectedAgents: [{ taskId: "mock-agent", reasoning: "fits", input: { message: "hi" } }],
        strategy: "parallel" as const,
      },
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      finishReason: "stop",
    });

    const decision = await routeIntent({ intent: "do something" }, ctx);

    expect(decision.selectedAgents[0]?.taskId).toBe("mock-agent");
    expect(decision.strategy).toBe("parallel");
  });
});

// --- dispatchAgent: success path ---

describe("dispatchAgent — success (REQ-13)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequestApproval.mockResolvedValue("approval-id-001");
  });

  it("returns status completed with result on ok: true (REQ-13)", async () => {
    const ctx = makeCtx();
    mockTasks.triggerAndWait.mockResolvedValue({ ok: true, output: { data: 42 } } as never);

    const result = await dispatchAgent("mock-agent", { message: "test" }, ctx);

    expect(result.status).toBe("completed");
    expect(result.result).toEqual({ data: 42 });
    expect(result.agentId).toBe("mock-agent");
  });

  it("logs dispatch step on success", async () => {
    const ctx = makeCtx();
    mockTasks.triggerAndWait.mockResolvedValue({ ok: true, output: { score: 0.9 } } as never);

    await dispatchAgent("mock-agent", {}, ctx);

    expect(ctx.logStep).toHaveBeenCalledWith(
      expect.objectContaining({ stepName: "dispatch-mock-agent" }),
    );
  });
});

// --- dispatchAgent: failure path ---

describe("dispatchAgent — failure (REQ-13)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns status failed on ok: false — never swallows (REQ-13)", async () => {
    const ctx = makeCtx();
    mockTasks.triggerAndWait.mockResolvedValue({
      ok: false,
      error: "Agent exploded",
    } as never);

    const result = await dispatchAgent("mock-agent", {}, ctx);

    expect(result.status).toBe("failed");
    expect(JSON.stringify(result.result)).toContain("Agent exploded");
  });

  it("throws when the taskId is not in the registry (REQ-12)", async () => {
    const ctx = makeCtx();

    await expect(dispatchAgent("not-in-registry", {}, ctx)).rejects.toThrow("not-in-registry");
    expect(mockTasks.triggerAndWait).not.toHaveBeenCalled();
  });
});

// --- dispatchAgent: approval gate ---

describe("dispatchAgent — approval gate (REQ-14, REQ-15, REQ-16, REQ-17)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequestApproval.mockResolvedValue("approval-record-001");
  });

  it("enters approval gate when output.status is awaiting_approval (REQ-14)", async () => {
    const ctx = makeCtx();
    mockTasks.triggerAndWait.mockResolvedValue({
      ok: true,
      output: { status: "awaiting_approval", reason: "needs sign-off" },
    } as never);
    mockWait.createToken.mockResolvedValue({ id: "tok_abc123" } as never);
    mockWait.forToken.mockResolvedValue(undefined as never);

    const result = await dispatchAgent("mock-agent", {}, ctx);

    expect(mockWait.createToken).toHaveBeenCalledWith({ timeout: "10m" });
    expect(mockRequestApproval).toHaveBeenCalledWith(
      expect.objectContaining({ stepName: "tok_abc123" }),
    );
    expect(result.approvalTokenId).toBe("tok_abc123");
    expect(result.status).toBe("awaiting_approval");
  });

  it("returns approvalTokenId in output when gate is entered (REQ-15)", async () => {
    const ctx = makeCtx();
    mockTasks.triggerAndWait.mockResolvedValue({
      ok: true,
      output: { status: "awaiting_approval" },
    } as never);
    mockWait.createToken.mockResolvedValue({ id: "tok_xyz789" } as never);
    mockWait.forToken.mockResolvedValue(undefined as never);

    const result = await dispatchAgent("mock-agent", {}, ctx);

    expect(result.approvalTokenId).toBeTruthy();
    expect(result.approvalTokenId).toBe("tok_xyz789");
  });

  it("calls requestApproval with correct params (REQ-16)", async () => {
    const ctx = makeCtx();
    const agentOutput = { status: "awaiting_approval", reason: "manual review required" };
    mockTasks.triggerAndWait.mockResolvedValue({ ok: true, output: agentOutput } as never);
    mockWait.createToken.mockResolvedValue({ id: "tok_approval" } as never);
    mockWait.forToken.mockResolvedValue(undefined as never);

    await dispatchAgent("mock-agent", {}, ctx);

    expect(mockRequestApproval).toHaveBeenCalledWith({
      runId: ctx.runId,
      agentId: "mock-agent",
      stepName: "tok_approval",
      payload: agentOutput,
      reason: "manual review required",
    });
  });

  it("returns status failed with timeout message when wait.forToken times out (REQ-17)", async () => {
    const ctx = makeCtx();
    mockTasks.triggerAndWait.mockResolvedValue({
      ok: true,
      output: { status: "awaiting_approval" },
    } as never);
    mockWait.createToken.mockResolvedValue({ id: "tok_timeout" } as never);
    mockWait.forToken.mockRejectedValue(new Error("Token timed out"));

    const result = await dispatchAgent("mock-agent", {}, ctx);

    expect(result.status).toBe("failed");
    expect(JSON.stringify(result.result)).toContain("timeout");
  });

  it("does not return awaiting_approval status indefinitely on timeout (REQ-17)", async () => {
    const ctx = makeCtx();
    mockTasks.triggerAndWait.mockResolvedValue({
      ok: true,
      output: { status: "awaiting_approval" },
    } as never);
    mockWait.createToken.mockResolvedValue({ id: "tok_timedout" } as never);
    mockWait.forToken.mockRejectedValue(new Error("Token timed out"));

    const result = await dispatchAgent("mock-agent", {}, ctx);

    // Run must NOT be left in awaiting_approval — it must be failed
    expect(result.status).not.toBe("awaiting_approval");
    expect(result.status).toBe("failed");
  });
});

// --- dispatchParallel ---

describe("dispatchParallel (AD-4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls batch.triggerAndWait — never Promise.all of individual triggerAndWait", async () => {
    const ctx = makeCtx();
    mockBatch.triggerAndWait.mockResolvedValue({
      runs: [
        { ok: true, output: { processed: true }, id: "run-1", taskIdentifier: "mock-agent" },
      ],
    } as never);

    await dispatchParallel(
      [{ taskId: "mock-agent", reasoning: "test", input: { message: "hello" } }],
      ctx,
    );

    expect(mockBatch.triggerAndWait).toHaveBeenCalledOnce();
    // tasks.triggerAndWait should NOT have been called for parallel dispatch
    expect(mockTasks.triggerAndWait).not.toHaveBeenCalled();
  });

  it("returns completed outputs for all successful runs", async () => {
    const ctx = makeCtx();
    mockBatch.triggerAndWait.mockResolvedValue({
      runs: [
        { ok: true, output: { score: 1 }, id: "run-1", taskIdentifier: "mock-agent" },
        { ok: true, output: { score: 2 }, id: "run-2", taskIdentifier: "mock-agent" },
      ],
    } as never);

    const results = await dispatchParallel(
      [
        { taskId: "mock-agent", reasoning: "a", input: { message: "a" } },
        { taskId: "mock-agent", reasoning: "b", input: { message: "b" } },
      ],
      ctx,
    );

    expect(results).toHaveLength(2);
    expect(results[0]?.status).toBe("completed");
    expect(results[1]?.status).toBe("completed");
  });

  it("marks individual runs as failed when batch run has ok: false", async () => {
    const ctx = makeCtx();
    mockBatch.triggerAndWait.mockResolvedValue({
      runs: [
        { ok: false, error: "failed internally", id: "run-1", taskIdentifier: "mock-agent" },
      ],
    } as never);

    const results = await dispatchParallel(
      [{ taskId: "mock-agent", reasoning: "test", input: {} }],
      ctx,
    );

    expect(results[0]?.status).toBe("failed");
  });

  it("returns empty array when no agents are provided", async () => {
    const ctx = makeCtx();

    const results = await dispatchParallel([], ctx);

    expect(results).toHaveLength(0);
    expect(mockBatch.triggerAndWait).not.toHaveBeenCalled();
  });
});

// --- dispatchSequential ---

describe("dispatchSequential", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls tasks.triggerAndWait for each agent in order (REQ-13)", async () => {
    const ctx = makeCtx();
    mockTasks.triggerAndWait
      .mockResolvedValueOnce({ ok: true, output: { step: 1 } } as never)
      .mockResolvedValueOnce({ ok: true, output: { step: 2 } } as never);

    const results = await dispatchSequential(
      [
        { taskId: "mock-agent", reasoning: "first", input: { message: "a" } },
        { taskId: "mock-agent", reasoning: "second", input: { message: "b" } },
      ],
      ctx,
    );

    expect(mockTasks.triggerAndWait).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(2);
    expect(results[0]?.status).toBe("completed");
    expect(results[1]?.status).toBe("completed");
  });

  it("stops early on failure (REQ-13)", async () => {
    const ctx = makeCtx();
    mockTasks.triggerAndWait.mockResolvedValue({
      ok: false,
      error: "first failed",
    } as never);

    const results = await dispatchSequential(
      [
        { taskId: "mock-agent", reasoning: "a", input: {} },
        { taskId: "mock-agent", reasoning: "b", input: {} },
      ],
      ctx,
    );

    // Should stop after first failure
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe("failed");
    expect(mockTasks.triggerAndWait).toHaveBeenCalledOnce();
  });

  it("stops early on awaiting_approval (REQ-14)", async () => {
    const ctx = makeCtx();
    mockTasks.triggerAndWait.mockResolvedValue({
      ok: true,
      output: { status: "awaiting_approval" },
    } as never);
    mockWait.createToken.mockResolvedValue({ id: "tok_seq" } as never);
    mockWait.forToken.mockResolvedValue(undefined as never);
    mockRequestApproval.mockResolvedValue("approval-seq-001");

    const results = await dispatchSequential(
      [
        { taskId: "mock-agent", reasoning: "a", input: {} },
        { taskId: "mock-agent", reasoning: "b", input: {} },
      ],
      ctx,
    );

    // Should stop after awaiting_approval
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe("awaiting_approval");
  });

  it("passes previous output as _previousOutput in next agent's input", async () => {
    const ctx = makeCtx();
    mockTasks.triggerAndWait
      .mockResolvedValueOnce({ ok: true, output: { enrichedData: "abc" } } as never)
      .mockResolvedValueOnce({ ok: true, output: { sent: true } } as never);

    await dispatchSequential(
      [
        { taskId: "mock-agent", reasoning: "enrich", input: { message: "start" } },
        { taskId: "mock-agent", reasoning: "send", input: { message: "send" } },
      ],
      ctx,
    );

    // Second call should have _previousOutput from first
    const secondCallArgs = mockTasks.triggerAndWait.mock.calls[1];
    expect(secondCallArgs?.[1]).toEqual(
      expect.objectContaining({ _previousOutput: { enrichedData: "abc" } }),
    );
  });
});

// --- Integration skeleton (inline, no describe.skip needed here — full integration is in separate file) ---

describe("workflowOrchestrator — integration smoke (all mocked)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequestApproval.mockResolvedValue("approval-smoke-001");
  });

  it("full flow: intent → LLM route → dispatch → completed result", async () => {
    const ctx = makeCtx();

    mockLoadPrompt.mockResolvedValue("system prompt");
    mockLlmGenerateObject.mockResolvedValue({
      object: {
        selectedAgents: [{ taskId: "mock-agent", reasoning: "fits", input: { message: "hi" } }],
        strategy: "sequential" as const,
      },
      tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      finishReason: "stop",
    });
    mockTasks.triggerAndWait.mockResolvedValue({ ok: true, output: { processed: true } } as never);

    const decision = await routeIntent({ intent: "process a lead" }, ctx);
    expect(decision.selectedAgents[0]?.taskId).toBe("mock-agent");

    const [agent] = decision.selectedAgents;
    if (!agent) throw new Error("No agent in decision");
    const dispatchResult = await dispatchAgent(agent.taskId, agent.input, ctx);

    expect(dispatchResult.status).toBe("completed");
    expect(dispatchResult.result).toEqual({ processed: true });
  });

  it("full flow: intent → direct route → dispatch → completed result (REQ-09)", async () => {
    const ctx = makeCtx();
    mockTasks.triggerAndWait.mockResolvedValue({ ok: true, output: { direct: true } } as never);

    const decision = await routeIntent({ intent: "direct", requestedAgentId: "mock-agent" }, ctx);
    expect(mockLlmGenerateObject).not.toHaveBeenCalled();

    const [agent] = decision.selectedAgents;
    if (!agent) throw new Error("No agent in decision");
    const result = await dispatchAgent(agent.taskId, agent.input, ctx);
    expect(result.status).toBe("completed");
  });
});
