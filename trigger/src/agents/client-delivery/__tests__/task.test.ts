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

import { clientDeliveryAgentConfig, clientDeliveryAgentTask } from "../task.js";
import { ClientDeliveryInputSchema } from "../schema.js";

describe("clientDeliveryAgentTask — Task Config", () => {
  it("has correct id 'client-delivery'", () => {
    expect(clientDeliveryAgentConfig.id).toBe("client-delivery");
  });

  it("has correct provider 'anthropic'", () => {
    expect(clientDeliveryAgentConfig.provider).toBe("anthropic");
  });

  it("has correct model", () => {
    expect(clientDeliveryAgentConfig.model).toBe("claude-sonnet-4-20250514");
  });

  it("has correct temperature 0.3", () => {
    expect(clientDeliveryAgentConfig.temperature).toBe(0.3);
  });

  it("has correct maxTokens 4096", () => {
    expect(clientDeliveryAgentConfig.maxTokens).toBe(4096);
  });

  it("task is defined", () => {
    expect(clientDeliveryAgentTask).toBeDefined();
  });

  it("task has the expected shape (id + schema from schemaTask mock)", () => {
    expect((clientDeliveryAgentTask as { id?: string }).id).toBe("client-delivery");
    expect((clientDeliveryAgentTask as { schema?: unknown }).schema).toBe(
      ClientDeliveryInputSchema,
    );
  });
});

describe("clientDeliveryAgentTask — maxDuration", () => {
  it("config is created with maxDuration 300", async () => {
    // maxDuration is passed to createAgentTask but not stored on config
    // We verify the task was created (schemaTask was called with maxDuration)
    // The config itself doesn't expose maxDuration, but we can verify via the mock
    const { schemaTask } = vi.mocked(await import("@trigger.dev/sdk"));
    // schemaTask mock records calls — find the client-delivery call
    const callArgs = schemaTask.mock.calls.find(
      (call) => (call[0] as Record<string, unknown>).id === "client-delivery",
    );
    expect(callArgs).toBeDefined();
    expect((callArgs?.[0] as Record<string, unknown>).maxDuration).toBe(300);
  });
});

describe("ClientDeliveryInputSchema — via task import", () => {
  it("accepts valid input", () => {
    const result = ClientDeliveryInputSchema.safeParse({
      proposalText: "This is a valid proposal text with more than twenty characters.",
      clientSlug: "acme-corp",
      deliverables: ["Email workflow", "Dashboard"],
      qaResults: "All tests passed successfully.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid input (missing fields)", () => {
    const result = ClientDeliveryInputSchema.safeParse({
      proposalText: "short",
    });
    expect(result.success).toBe(false);
  });
});
