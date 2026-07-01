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

import { validationQaAgentConfig, validationQaAgentTask } from "../task.js";
import { ValidationQaInputSchema } from "../schema.js";

describe("validationQaAgentTask — Task Config", () => {
  it("has correct id 'validation-qa'", () => {
    expect(validationQaAgentConfig.id).toBe("validation-qa");
  });

  it("has correct provider 'anthropic'", () => {
    expect(validationQaAgentConfig.provider).toBe("anthropic");
  });

  it("has correct model 'claude-sonnet-4-20250514'", () => {
    expect(validationQaAgentConfig.model).toBe("claude-sonnet-4-20250514");
  });

  it("has temperature 0 (deterministic QA)", () => {
    expect(validationQaAgentConfig.temperature).toBe(0);
  });

  it("has maxTokens 4096", () => {
    expect(validationQaAgentConfig.maxTokens).toBe(4096);
  });

  it("task is defined", () => {
    expect(validationQaAgentTask).toBeDefined();
  });

  it("task has the expected shape (id + schema from schemaTask mock)", () => {
    expect((validationQaAgentTask as { id?: string }).id).toBe("validation-qa");
    expect((validationQaAgentTask as { schema?: unknown }).schema).toBe(ValidationQaInputSchema);
  });
});

describe("ValidationQaInputSchema — via task import", () => {
  it("accepts valid input", () => {
    const result = ValidationQaInputSchema.safeParse({
      implementationSummary: "This is a detailed implementation summary with more than twenty characters.",
      clientSlug: "acme-corp",
      deliverables: ["workflow.json", "runbook.md"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid input (missing deliverables)", () => {
    const result = ValidationQaInputSchema.safeParse({
      implementationSummary: "This is a valid summary with enough length.",
      clientSlug: "acme-corp",
    });
    expect(result.success).toBe(false);
  });

  it("rejects short implementationSummary", () => {
    const result = ValidationQaInputSchema.safeParse({
      implementationSummary: "Too short",
      clientSlug: "acme-corp",
      deliverables: ["workflow.json"],
    });
    expect(result.success).toBe(false);
  });
});
