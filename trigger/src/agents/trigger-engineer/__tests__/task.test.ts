import { describe, it, expect, vi } from "vitest";

// Mock @trigger.dev/sdk BEFORE importing task
vi.mock("@trigger.dev/sdk", () => ({
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

// Mock persistence to avoid Supabase initialization
vi.mock("../../../lib/persistence", () => ({
  createAgentRun: vi.fn().mockResolvedValue("run-uuid-123"),
  updateAgentRun: vi.fn().mockResolvedValue(undefined),
  logAgentStep: vi.fn().mockResolvedValue(undefined),
  requestApproval: vi.fn().mockResolvedValue("approval-uuid-123"),
}));

import { triggerEngineerAgentConfig, triggerEngineerAgentTask } from "../task.js";
import { TriggerEngineerInputSchema } from "../schema.js";

describe("triggerEngineerAgentTask — Task Config", () => {
  it("has correct id 'trigger-engineer'", () => {
    expect(triggerEngineerAgentConfig.id).toBe("trigger-engineer");
  });

  it("has correct provider 'anthropic'", () => {
    expect(triggerEngineerAgentConfig.provider).toBe("anthropic");
  });

  it("has correct model", () => {
    expect(triggerEngineerAgentConfig.model).toBe("claude-sonnet-4-20250514");
  });

  it("has correct temperature 0.2", () => {
    expect(triggerEngineerAgentConfig.temperature).toBe(0.2);
  });

  it("has correct maxTokens 8192", () => {
    expect(triggerEngineerAgentConfig.maxTokens).toBe(8192);
  });

  it("task is defined", () => {
    expect(triggerEngineerAgentTask).toBeDefined();
  });

  it("task has the expected shape (id + schema from schemaTask mock)", () => {
    expect((triggerEngineerAgentTask as { id?: string }).id).toBe("trigger-engineer");
    expect((triggerEngineerAgentTask as { schema?: unknown }).schema).toBe(TriggerEngineerInputSchema);
  });
});

describe("TriggerEngineerInputSchema — via task import", () => {
  it("accepts valid input", () => {
    const result = TriggerEngineerInputSchema.safeParse({
      proposalText: "This is a valid proposal text with more than twenty characters.",
      clientSlug: "acme-corp",
      taskDescription: "Email notification task for users",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid input (missing fields)", () => {
    const result = TriggerEngineerInputSchema.safeParse({
      proposalText: "short",
    });
    expect(result.success).toBe(false);
  });
});
