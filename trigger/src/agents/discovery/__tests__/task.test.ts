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

// Mock persistence
vi.mock("../../../lib/persistence", () => ({
  createAgentRun: vi.fn().mockResolvedValue("run-uuid-123"),
  updateAgentRun: vi.fn().mockResolvedValue(undefined),
  logAgentStep: vi.fn().mockResolvedValue(undefined),
}));

import { discoveryAgentConfig, discoveryAgentTask } from "../task";
import { DiscoveryInputSchema } from "../schema";

describe("discoveryAgentConfig", () => {
  it("id is 'discovery-agent'", () => {
    expect(discoveryAgentConfig.id).toBe("discovery-agent");
  });

  it("provider is 'anthropic'", () => {
    expect(discoveryAgentConfig.provider).toBe("anthropic");
  });

  it("model is 'claude-sonnet-4-20250514'", () => {
    expect(discoveryAgentConfig.model).toBe("claude-sonnet-4-20250514");
  });

  it("temperature is 0", () => {
    expect(discoveryAgentConfig.temperature).toBe(0);
  });

  it("maxTokens is 4096", () => {
    expect(discoveryAgentConfig.maxTokens).toBe(4096);
  });

  it("retry is configured with correct values", () => {
    expect(discoveryAgentConfig.retry).toEqual({
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 30000,
    });
  });

  it("tags include intake and extraction", () => {
    expect(discoveryAgentConfig.tags).toContain("intake");
    expect(discoveryAgentConfig.tags).toContain("extraction");
  });
});

describe("discoveryAgentTask", () => {
  it("is defined", () => {
    expect(discoveryAgentTask).toBeDefined();
  });

  it("has the expected mock task shape (id + schema from schemaTask mock)", () => {
    expect((discoveryAgentTask as { id?: string }).id).toBe("discovery-agent");
    expect((discoveryAgentTask as { schema?: unknown }).schema).toBe(DiscoveryInputSchema);
  });
});
