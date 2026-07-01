/**
 * Integration smoke test for agent-runner with mocked external dependencies.
 * Verifies the full happy path and error path of a complete agent task.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all external dependencies
let capturedRunFn: ((input: unknown, ctx: { ctx: { run: { id: string } } }) => Promise<unknown>) | null = null;

vi.mock("@trigger.dev/sdk", () => ({
  schemaTask: vi.fn((args: Record<string, unknown>) => {
    capturedRunFn = args.run as typeof capturedRunFn;
    return { id: args.id, schema: args.schema };
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

vi.mock("ai", () => ({
  generateText: vi.fn(),
  generateObject: vi.fn(),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: vi.fn(() => vi.fn((modelId: string) => ({ provider: "anthropic", modelId }))),
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => vi.fn((modelId: string) => ({ provider: "openai", modelId }))),
}));

import { generateText } from "ai";
import { createAgentRun, updateAgentRun, logAgentStep } from "../persistence";
import { createAgentTask } from "../agent-runner";
import { AgentConfigSchema } from "../agent-types";
import { z } from "zod";

const mockGenerateText = vi.mocked(generateText);
const mockCreateAgentRun = vi.mocked(createAgentRun);
const mockUpdateAgentRun = vi.mocked(updateAgentRun);
const mockLogAgentStep = vi.mocked(logAgentStep);

const agentConfig = AgentConfigSchema.parse({
  id: "lead-qualifier-integration",
  name: "Lead Qualifier Integration",
  provider: "anthropic",
  model: "claude-sonnet-4-5",
  tags: ["sales"],
});

const InputSchema = z.object({
  companyName: z.string(),
  industry: z.string(),
});

const mockCtx = { ctx: { run: { id: "trigger-run-integration-1" } } };

async function executeRun(input: unknown = { companyName: "Acme Corp", industry: "SaaS" }) {
  if (!capturedRunFn) throw new Error("run function not captured");
  return capturedRunFn(input, mockCtx);
}

describe("Agent factory integration (happy path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedRunFn = null;
    mockCreateAgentRun.mockResolvedValue("integration-run-uuid");
    mockUpdateAgentRun.mockResolvedValue(undefined);
    mockLogAgentStep.mockResolvedValue(undefined);
    mockGenerateText.mockResolvedValue({
      text: "Acme Corp is a strong lead in the SaaS sector.",
      usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
      finishReason: "stop",
    } as never);
  });

  it("full happy path: run is created, handler invoked, step logged, run completed", async () => {
    const handler = vi.fn().mockImplementation(async (input, ctx) => {
      // Simulate calling llmGenerateText and logging the step
      await ctx.logStep({
        stepName: "qualify-lead",
        input: { companyName: input.companyName },
        output: { score: 85, action: "follow_up" },
        tokenUsage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
      });
      return { score: 85, action: "follow_up", reasoning: "Strong SaaS company" };
    });

    createAgentTask({ config: agentConfig, inputSchema: InputSchema, handler });

    const result = await executeRun({ companyName: "Acme Corp", industry: "SaaS" });

    // createAgentRun called once with running status shape
    expect(mockCreateAgentRun).toHaveBeenCalledOnce();
    expect(mockCreateAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "lead-qualifier-integration",
        triggerRunId: "trigger-run-integration-1",
      }),
    );

    // Handler invoked with correct AgentContext
    expect(handler).toHaveBeenCalledOnce();
    const [inputArg, ctxArg] = handler.mock.calls[0];
    expect(inputArg).toEqual({ companyName: "Acme Corp", industry: "SaaS" });
    expect(ctxArg.runId).toBe("integration-run-uuid");
    expect(ctxArg.triggerRunId).toBe("trigger-run-integration-1");
    expect(ctxArg.config.id).toBe("lead-qualifier-integration");

    // logAgentStep called once for the step
    expect(mockLogAgentStep).toHaveBeenCalledOnce();

    // updateAgentRun called with completed status and accumulated tokenUsage
    expect(mockUpdateAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "integration-run-uuid",
        status: "completed",
        output: { score: 85, action: "follow_up", reasoning: "Strong SaaS company" },
        tokenUsage: {
          promptTokens: 50,
          completionTokens: 30,
          totalTokens: 80,
        },
      }),
    );

    expect(result).toEqual({ score: 85, action: "follow_up", reasoning: "Strong SaaS company" });
  });

  it("multi-step: token usage accumulates across multiple logStep calls", async () => {
    const handler = vi.fn().mockImplementation(async (_input, ctx) => {
      await ctx.logStep({
        stepName: "step-1",
        tokenUsage: { promptTokens: 100, completionTokens: 40, totalTokens: 140 },
      });
      await ctx.logStep({
        stepName: "step-2",
        tokenUsage: { promptTokens: 200, completionTokens: 60, totalTokens: 260 },
      });
      return { done: true };
    });

    createAgentTask({ config: agentConfig, inputSchema: InputSchema, handler });
    await executeRun();

    expect(mockLogAgentStep).toHaveBeenCalledTimes(2);
    expect(mockUpdateAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenUsage: {
          promptTokens: 300,
          completionTokens: 100,
          totalTokens: 400,
        },
      }),
    );
  });
});

describe("Agent factory integration (error path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedRunFn = null;
    mockCreateAgentRun.mockResolvedValue("integration-run-uuid");
    mockUpdateAgentRun.mockResolvedValue(undefined);
    mockLogAgentStep.mockResolvedValue(undefined);
  });

  it("handler throws: updateAgentRun called with failed status, error is re-thrown", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("LLM rate limit exceeded"));

    createAgentTask({ config: agentConfig, inputSchema: InputSchema, handler });

    await expect(executeRun()).rejects.toThrow("LLM rate limit exceeded");

    expect(mockUpdateAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "integration-run-uuid",
        status: "failed",
        error: "LLM rate limit exceeded",
      }),
    );
  });

  it("persistence failure at start: handler still runs, task succeeds", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mockCreateAgentRun.mockRejectedValue(new Error("DB unavailable"));
    const handler = vi.fn().mockResolvedValue({ result: "fallback success" });

    createAgentTask({ config: agentConfig, inputSchema: InputSchema, handler });

    const result = await executeRun();

    expect(result).toEqual({ result: "fallback success" });
    expect(handler).toHaveBeenCalledOnce();
    expect(console.warn).toHaveBeenCalledOnce();
  });
});
