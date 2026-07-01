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

import { n8nEngineerAgentConfig, n8nEngineerAgentTask } from "../task.js";
import { N8nEngineerInputSchema } from "../schema.js";

describe("n8nEngineerAgentTask — Task Config", () => {
  it("has correct id 'n8n-engineer'", () => {
    expect(n8nEngineerAgentConfig.id).toBe("n8n-engineer");
  });

  it("has correct provider 'anthropic'", () => {
    expect(n8nEngineerAgentConfig.provider).toBe("anthropic");
  });

  it("has correct model", () => {
    expect(n8nEngineerAgentConfig.model).toBe("claude-sonnet-4-20250514");
  });

  it("has correct temperature 0.2", () => {
    expect(n8nEngineerAgentConfig.temperature).toBe(0.2);
  });

  it("has correct maxTokens 8192", () => {
    expect(n8nEngineerAgentConfig.maxTokens).toBe(8192);
  });

  it("has n8n and f3 tags", () => {
    expect(n8nEngineerAgentConfig.tags).toContain("n8n");
    expect(n8nEngineerAgentConfig.tags).toContain("f3");
  });

  it("task is defined", () => {
    expect(n8nEngineerAgentTask).toBeDefined();
  });

  it("task has the expected shape (id + schema from schemaTask mock)", () => {
    expect((n8nEngineerAgentTask as { id?: string }).id).toBe("n8n-engineer");
    expect((n8nEngineerAgentTask as { schema?: unknown }).schema).toBe(N8nEngineerInputSchema);
  });
});

describe("N8nEngineerInputSchema — via task import", () => {
  it("accepts valid input", () => {
    const result = N8nEngineerInputSchema.safeParse({
      proposalText: "This is a valid proposal text with more than twenty characters.",
      clientSlug: "acme-corp",
      workflowDescription: "Email automation workflow",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid input (missing fields)", () => {
    const result = N8nEngineerInputSchema.safeParse({
      proposalText: "short",
    });
    expect(result.success).toBe(false);
  });
});
