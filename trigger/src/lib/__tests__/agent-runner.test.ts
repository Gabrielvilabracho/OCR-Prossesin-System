import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @trigger.dev/sdk BEFORE importing agent-runner
// We capture the run function passed to schemaTask for direct testing
let capturedRunFn: ((input: unknown, ctx: { ctx: { run: { id: string } } }) => Promise<unknown>) | null = null;
let capturedSchemaTaskArgs: Record<string, unknown> | null = null;

vi.mock("@trigger.dev/sdk", () => ({
  schemaTask: vi.fn((args: Record<string, unknown>) => {
    capturedSchemaTaskArgs = args;
    capturedRunFn = args.run as typeof capturedRunFn;
    return { id: args.id, schema: args.schema, _isMockTask: true };
  }),
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("../persistence", () => ({
  createAgentRun: vi.fn(),
  updateAgentRun: vi.fn(),
  logAgentStep: vi.fn(),
}));

import { schemaTask } from "@trigger.dev/sdk";
import { createAgentRun, updateAgentRun, logAgentStep } from "../persistence";
import { createAgentTask } from "../agent-runner";
import { AgentConfigSchema } from "../agent-types";
import { z } from "zod";

const mockSchemaTask = vi.mocked(schemaTask);
const mockCreateAgentRun = vi.mocked(createAgentRun);
const mockUpdateAgentRun = vi.mocked(updateAgentRun);
const mockLogAgentStep = vi.mocked(logAgentStep);

const validConfig = AgentConfigSchema.parse({
  id: "test-agent",
  name: "Test Agent",
  provider: "anthropic",
  model: "claude-sonnet-4-5",
});

const InputSchema = z.object({ userId: z.string() });

const mockCtx = { ctx: { run: { id: "trigger-run-abc" } } };

// Helper to execute the captured run function
async function executeRun(input: unknown = { userId: "user-1" }) {
  if (!capturedRunFn) throw new Error("run function was not captured");
  return capturedRunFn(input, mockCtx);
}

describe("createAgentTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedRunFn = null;
    capturedSchemaTaskArgs = null;
    mockCreateAgentRun.mockResolvedValue("run-uuid-123");
    mockUpdateAgentRun.mockResolvedValue(undefined);
    mockLogAgentStep.mockResolvedValue(undefined);
  });

  it("calls schemaTask with the correct id and schema", () => {
    createAgentTask({ config: validConfig, inputSchema: InputSchema, handler: vi.fn() });

    expect(mockSchemaTask).toHaveBeenCalledOnce();
    expect(capturedSchemaTaskArgs?.id).toBe("test-agent");
    expect(capturedSchemaTaskArgs?.schema).toBe(InputSchema);
  });

  it("uses default maxDuration of 300", () => {
    createAgentTask({ config: validConfig, inputSchema: InputSchema, handler: vi.fn() });
    expect(capturedSchemaTaskArgs?.maxDuration).toBe(300);
  });

  it("accepts custom maxDuration", () => {
    createAgentTask({ config: validConfig, inputSchema: InputSchema, handler: vi.fn(), maxDuration: 600 });
    expect(capturedSchemaTaskArgs?.maxDuration).toBe(600);
  });

  it("uses config retry settings when provided", () => {
    const configWithRetry = AgentConfigSchema.parse({
      ...validConfig,
      retry: { maxAttempts: 5, factor: 3, minTimeoutInMs: 500, maxTimeoutInMs: 60000 },
    });
    createAgentTask({ config: configWithRetry, inputSchema: InputSchema, handler: vi.fn() });
    expect(capturedSchemaTaskArgs?.retry).toEqual({
      maxAttempts: 5,
      factor: 3,
      minTimeoutInMs: 500,
      maxTimeoutInMs: 60000,
    });
  });

  it("uses default retry settings when config.retry is undefined", () => {
    createAgentTask({ config: validConfig, inputSchema: InputSchema, handler: vi.fn() });
    expect(capturedSchemaTaskArgs?.retry).toEqual({
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 30000,
    });
  });

  it("returns the result of schemaTask", () => {
    const task = createAgentTask({ config: validConfig, inputSchema: InputSchema, handler: vi.fn() });
    expect(task).toEqual({ id: "test-agent", schema: InputSchema, _isMockTask: true });
  });
});

describe("createAgentTask — run function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedRunFn = null;
    capturedSchemaTaskArgs = null;
    mockCreateAgentRun.mockResolvedValue("run-uuid-123");
    mockUpdateAgentRun.mockResolvedValue(undefined);
    mockLogAgentStep.mockResolvedValue(undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("calls createAgentRun at start with correct params", async () => {
    const handler = vi.fn().mockResolvedValue({ result: "ok" });
    createAgentTask({ config: validConfig, inputSchema: InputSchema, handler });

    await executeRun({ userId: "user-1" });

    expect(mockCreateAgentRun).toHaveBeenCalledOnce();
    expect(mockCreateAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "test-agent",
        triggerRunId: "trigger-run-abc",
        input: { userId: "user-1" },
      }),
    );
  });

  it("passes correct AgentContext to the handler", async () => {
    let receivedCtx: unknown;
    const handler = vi.fn().mockImplementation(async (_input, ctx) => {
      receivedCtx = ctx;
      return {};
    });
    createAgentTask({ config: validConfig, inputSchema: InputSchema, handler });

    await executeRun();

    expect((receivedCtx as { runId: string }).runId).toBe("run-uuid-123");
    expect((receivedCtx as { triggerRunId: string }).triggerRunId).toBe("trigger-run-abc");
    expect((receivedCtx as { config: unknown }).config).toEqual(validConfig);
    expect(typeof (receivedCtx as { logStep: unknown }).logStep).toBe("function");
  });

  it("calls updateAgentRun with status 'completed' on success", async () => {
    const handler = vi.fn().mockResolvedValue({ score: 0.9 });
    createAgentTask({ config: validConfig, inputSchema: InputSchema, handler });

    await executeRun();

    expect(mockUpdateAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-uuid-123",
        status: "completed",
        output: { score: 0.9 },
      }),
    );
  });

  it("calls updateAgentRun with status 'failed' when handler throws, then re-throws", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("LLM timeout"));
    createAgentTask({ config: validConfig, inputSchema: InputSchema, handler });

    await expect(executeRun()).rejects.toThrow("LLM timeout");

    expect(mockUpdateAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-uuid-123",
        status: "failed",
        error: "LLM timeout",
      }),
    );
  });

  it("accumulates tokenUsage from multiple logStep calls", async () => {
    const handler = vi.fn().mockImplementation(async (_input, ctx) => {
      await ctx.logStep({
        stepName: "step-1",
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });
      await ctx.logStep({
        stepName: "step-2",
        tokenUsage: { promptTokens: 200, completionTokens: 80, totalTokens: 280 },
      });
      return {};
    });
    createAgentTask({ config: validConfig, inputSchema: InputSchema, handler });

    await executeRun();

    expect(mockUpdateAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenUsage: {
          promptTokens: 300,
          completionTokens: 130,
          totalTokens: 430,
        },
      }),
    );
  });

  it("calls logAgentStep for each ctx.logStep call", async () => {
    const handler = vi.fn().mockImplementation(async (_input, ctx) => {
      await ctx.logStep({ stepName: "step-1" });
      await ctx.logStep({ stepName: "step-2" });
      await ctx.logStep({ stepName: "step-3" });
      return {};
    });
    createAgentTask({ config: validConfig, inputSchema: InputSchema, handler });

    await executeRun();

    expect(mockLogAgentStep).toHaveBeenCalledTimes(3);
  });

  it("uses fallback runId and warns when createAgentRun throws", async () => {
    mockCreateAgentRun.mockRejectedValue(new Error("DB connection refused"));
    const handler = vi.fn().mockResolvedValue({ ok: true });
    createAgentTask({ config: validConfig, inputSchema: InputSchema, handler });

    const result = await executeRun();

    expect(result).toEqual({ ok: true });
    expect(console.warn).toHaveBeenCalledOnce();
    expect(vi.mocked(console.warn).mock.calls[0][0]).toMatch(/DB connection refused/);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("does not accumulate tokenUsage for steps without tokenUsage", async () => {
    const handler = vi.fn().mockImplementation(async (_input, ctx) => {
      await ctx.logStep({ stepName: "step-no-tokens" });
      return {};
    });
    createAgentTask({ config: validConfig, inputSchema: InputSchema, handler });

    await executeRun();

    expect(mockUpdateAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      }),
    );
  });
});

describe("createAgentTask — no side effects at import time (REQ-20)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedRunFn = null;
    capturedSchemaTaskArgs = null;
    mockCreateAgentRun.mockResolvedValue("run-uuid-123");
    mockUpdateAgentRun.mockResolvedValue(undefined);
    mockLogAgentStep.mockResolvedValue(undefined);
  });

  it("calling createAgentTask factory (without executing the task) does not invoke persistence", () => {
    // Creating the task factory should not trigger any DB calls.
    // Only executing the returned task's run function should do that.
    createAgentTask({ config: validConfig, inputSchema: InputSchema, handler: vi.fn() });

    // schemaTask is called (that's the factory), but persistence is NOT
    expect(mockSchemaTask).toHaveBeenCalledOnce();
    expect(mockCreateAgentRun).not.toHaveBeenCalled();
    expect(mockUpdateAgentRun).not.toHaveBeenCalled();
    expect(mockLogAgentStep).not.toHaveBeenCalled();
  });
});
