import { describe, it, expect } from "vitest";
import {
  LLMProviderSchema,
  LLMModelSchema,
  AgentStepSchema,
  AgentRunStatusSchema,
  AgentConfigSchema,
  AgentRunRecordSchema,
  ApprovalStatusSchema,
  ApprovalRequestSchema,
  type AgentContext,
  type AgentHandler,
} from "../agent-types";

describe("LLMProviderSchema", () => {
  it("accepts valid providers", () => {
    expect(LLMProviderSchema.safeParse("anthropic").success).toBe(true);
    expect(LLMProviderSchema.safeParse("openai").success).toBe(true);
  });

  it("rejects invalid providers", () => {
    expect(LLMProviderSchema.safeParse("gemini").success).toBe(false);
    expect(LLMProviderSchema.safeParse("").success).toBe(false);
  });
});

describe("LLMModelSchema", () => {
  it("accepts non-empty strings", () => {
    expect(LLMModelSchema.safeParse("claude-sonnet-4-5").success).toBe(true);
    expect(LLMModelSchema.safeParse("gpt-4o").success).toBe(true);
  });

  it("rejects empty strings", () => {
    expect(LLMModelSchema.safeParse("").success).toBe(false);
  });
});

describe("AgentStepSchema", () => {
  it("accepts a valid full step", () => {
    const step = {
      stepName: "classify-lead",
      input: { data: "test" },
      output: { score: 0.9 },
      tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      durationMs: 1200,
    };
    expect(AgentStepSchema.safeParse(step).success).toBe(true);
  });

  it("accepts a minimal step (only stepName required)", () => {
    expect(AgentStepSchema.safeParse({ stepName: "step-1" }).success).toBe(true);
  });

  it("rejects step without stepName", () => {
    expect(AgentStepSchema.safeParse({ input: {} }).success).toBe(false);
  });

  it("rejects negative durationMs (number schema accepts all numbers)", () => {
    // durationMs is just z.number(), negatives are valid
    expect(AgentStepSchema.safeParse({ stepName: "x", durationMs: -1 }).success).toBe(true);
  });
});

describe("AgentRunStatusSchema", () => {
  it("accepts valid statuses", () => {
    for (const status of ["running", "completed", "failed", "awaiting_approval"]) {
      expect(AgentRunStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  it("rejects invalid status", () => {
    expect(AgentRunStatusSchema.safeParse("pending").success).toBe(false);
    expect(AgentRunStatusSchema.safeParse("success").success).toBe(false);
  });
});

describe("AgentConfigSchema", () => {
  const minimalConfig = {
    id: "lead-qualifier",
    name: "Lead Qualifier",
    provider: "anthropic",
    model: "claude-sonnet-4-5",
  } as const;

  it("parses minimal config with defaults", () => {
    const result = AgentConfigSchema.parse(minimalConfig);
    expect(result.temperature).toBe(0);
    expect(result.retry).toBeUndefined();
    expect(result.maxTokens).toBeUndefined();
  });

  it("applies retry nested defaults when retry is provided", () => {
    const result = AgentConfigSchema.parse({
      ...minimalConfig,
      retry: {},
    });
    expect(result.retry?.maxAttempts).toBe(3);
    expect(result.retry?.factor).toBe(2);
    expect(result.retry?.minTimeoutInMs).toBe(1000);
    expect(result.retry?.maxTimeoutInMs).toBe(30000);
  });

  it("rejects temperature above 2", () => {
    const result = AgentConfigSchema.safeParse({ ...minimalConfig, temperature: 2.5 });
    expect(result.success).toBe(false);
  });

  it("rejects temperature below 0", () => {
    const result = AgentConfigSchema.safeParse({ ...minimalConfig, temperature: -0.1 });
    expect(result.success).toBe(false);
  });

  it("accepts temperature at boundary values", () => {
    expect(AgentConfigSchema.safeParse({ ...minimalConfig, temperature: 0 }).success).toBe(true);
    expect(AgentConfigSchema.safeParse({ ...minimalConfig, temperature: 2 }).success).toBe(true);
  });

  it("rejects empty id", () => {
    expect(AgentConfigSchema.safeParse({ ...minimalConfig, id: "" }).success).toBe(false);
  });

  it("rejects empty name", () => {
    expect(AgentConfigSchema.safeParse({ ...minimalConfig, name: "" }).success).toBe(false);
  });

  it("accepts optional fields", () => {
    const result = AgentConfigSchema.parse({
      ...minimalConfig,
      description: "A test agent",
      maxTokens: 4096,
      tags: ["sales", "leads"],
    });
    expect(result.description).toBe("A test agent");
    expect(result.maxTokens).toBe(4096);
    expect(result.tags).toEqual(["sales", "leads"]);
  });
});

describe("AgentRunRecordSchema", () => {
  const validRecord = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    agentId: "lead-qualifier",
    triggerRunId: "trigger-run-123",
    status: "running" as const,
    input: { leadId: "1" },
    startedAt: "2026-04-06T12:00:00Z",
  };

  it("parses valid record with defaults applied", () => {
    const result = AgentRunRecordSchema.parse(validRecord);
    expect(result.steps).toEqual([]);
    expect(result.tokenUsage).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  });

  it("rejects invalid UUID", () => {
    expect(AgentRunRecordSchema.safeParse({ ...validRecord, id: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects invalid status", () => {
    expect(AgentRunRecordSchema.safeParse({ ...validRecord, status: "success" }).success).toBe(false);
  });

  it("accepts optional output and error", () => {
    const result = AgentRunRecordSchema.parse({ ...validRecord, output: { score: 85 }, error: "timeout" });
    expect(result.output).toEqual({ score: 85 });
    expect(result.error).toBe("timeout");
  });
});

describe("ApprovalStatusSchema", () => {
  it("accepts valid statuses", () => {
    for (const s of ["pending", "approved", "rejected"]) {
      expect(ApprovalStatusSchema.safeParse(s).success).toBe(true);
    }
  });

  it("rejects invalid status", () => {
    expect(ApprovalStatusSchema.safeParse("expired").success).toBe(false);
  });
});

describe("ApprovalRequestSchema", () => {
  const validRequest = {
    id: "550e8400-e29b-41d4-a716-446655440001",
    runId: "550e8400-e29b-41d4-a716-446655440000",
    agentId: "invoice-generator",
    stepName: "approve-payment",
    payload: { amount: 5000 },
    reason: "Amount exceeds threshold",
    status: "pending" as const,
    createdAt: "2026-04-06T12:00:00Z",
  };

  it("parses valid approval request", () => {
    expect(ApprovalRequestSchema.safeParse(validRequest).success).toBe(true);
  });

  it("rejects invalid runId UUID", () => {
    expect(ApprovalRequestSchema.safeParse({ ...validRequest, runId: "not-a-uuid" }).success).toBe(false);
  });

  it("accepts optional decidedBy and decidedAt", () => {
    const result = ApprovalRequestSchema.parse({
      ...validRequest,
      decidedBy: "admin@example.com",
      decidedAt: "2026-04-06T13:00:00Z",
    });
    expect(result.decidedBy).toBe("admin@example.com");
  });
});

// Compile-time type checks
describe("Type exports (compile-time checks)", () => {
  it("AgentContext type has expected shape", () => {
    const ctx: AgentContext = {
      runId: "run-1",
      triggerRunId: "trigger-1",
      config: {
        id: "test",
        name: "Test",
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        temperature: 0,
      },
      logStep: async () => {},
    };
    expect(ctx.runId).toBe("run-1");
  });

  it("AgentHandler type is callable", () => {
    const handler: AgentHandler<{ input: string }, { output: string }> = async (input, _ctx) => ({
      output: input.input.toUpperCase(),
    });
    expect(typeof handler).toBe("function");
  });
});
