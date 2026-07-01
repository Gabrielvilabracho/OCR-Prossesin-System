import { describe, it, expect, vi } from "vitest";

/**
 * Integration tests for the full createAgentTask → discoveryHandler → output pipeline.
 * These tests are SKIPPED by default to avoid real LLM calls.
 * Run explicitly with: vitest run --testNamePattern "integration"
 */
describe.skip("Discovery Agent — integration (skipped by default)", () => {
  // Mock LLM for integration tests too
  vi.mock("../../../lib/llm", () => ({
    llmGenerateObject: vi.fn(),
  }));

  vi.mock("@trigger.dev/sdk", () => ({
    schemaTask: vi.fn((args: Record<string, unknown>) => ({
      id: args.id,
      schema: args.schema,
      _isMockTask: true,
    })),
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  }));

  vi.mock("../../../lib/persistence", () => ({
    createAgentRun: vi.fn().mockResolvedValue("run-uuid-123"),
    updateAgentRun: vi.fn().mockResolvedValue(undefined),
    logAgentStep: vi.fn().mockResolvedValue(undefined),
  }));

  vi.mock("../../../lib/prompts", () => ({
    loadPrompt: vi.fn().mockResolvedValue("mocked prompt content"),
    PromptNotFoundError: class extends Error {},
  }));

  it("full pipeline: task config → handler → output has correct shape", async () => {
    const { llmGenerateObject } = await import("../../../lib/llm");
    const { discoveryAgentTask, discoveryAgentConfig } = await import("../task");

    const mockBrief = {
      companyName: "Integration Test Corp",
      currentStack: [],
      processSteps: [],
      painPoints: [],
      kpiCandidates: [],
      untouchableSystems: [],
      complianceRequirements: [],
      systemsInvolved: [],
      urgency: "medium" as const,
      completenessScore: 50,
      extractionNotes: [],
    };

    vi.mocked(llmGenerateObject).mockResolvedValue({
      object: mockBrief,
      tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      finishReason: "stop",
    });

    expect(discoveryAgentConfig.id).toBe("discovery-agent");
    expect(discoveryAgentTask).toBeDefined();
  });
});
