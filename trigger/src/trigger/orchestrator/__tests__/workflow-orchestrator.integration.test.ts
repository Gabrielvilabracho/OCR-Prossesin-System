import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Integration test skeleton for the workflow-orchestrator.
 *
 * These tests are skipped by default — they require:
 * - A running Trigger.dev dev server (`npm run dev` in trigger/)
 * - Real Supabase connection (or test DB)
 * - Real LLM API key
 *
 * Enable with: TEST_INTEGRATION=true vitest run
 *
 * REQ-21: Integration skeleton MUST be runnable via `npm test` (skipped = green).
 */

const RUN_INTEGRATION = process.env.TEST_INTEGRATION === "true";

describe.skip("workflow-orchestrator — integration (requires live services)", () => {
  /**
   * E2E Test 1: intent → LLM routing (mocked) → dispatch (mocked) → result
   *
   * Validates the full orchestration flow with controlled mocks.
   */
  it("E2E: intent → LLM route → dispatch → completed result", async () => {
    if (!RUN_INTEGRATION) return;

    // Mock LLM and dispatch to avoid real network calls even in integration mode
    vi.mock("../../../lib/llm", () => ({
      llmGenerateObject: vi.fn().mockResolvedValue({
        object: {
          selectedAgents: [
            { taskId: "mock-agent", reasoning: "integration test fit", input: { message: "e2e" } },
          ],
          strategy: "sequential",
        },
        tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        finishReason: "stop",
      }),
    }));

    vi.mock("@trigger.dev/sdk", async () => {
      const actual = await vi.importActual("@trigger.dev/sdk");
      return {
        ...(actual as Record<string, unknown>),
        tasks: {
          triggerAndWait: vi.fn().mockResolvedValue({ ok: true, output: { data: "e2e-result" } }),
        },
      };
    });

    const { routeIntent, dispatchAgent } = await import("../workflow-orchestrator");

    const ctx = {
      runId: "integration-run-001",
      triggerRunId: "trigger-integration-001",
      config: {
        id: "workflow-orchestrator",
        name: "Workflow Orchestrator",
        provider: "anthropic" as const,
        model: "claude-sonnet-4-20250514",
        temperature: 0,
      },
      logStep: vi.fn().mockResolvedValue(undefined),
    };

    const decision = await routeIntent({ intent: "process a lead for testing" }, ctx);

    expect(decision.selectedAgents.length).toBeGreaterThan(0);
    expect(decision.selectedAgents[0]?.taskId).toBe("mock-agent");

    const firstAgent = decision.selectedAgents[0];
    expect(firstAgent).toBeDefined();

    const result = await dispatchAgent(firstAgent!.taskId, firstAgent!.input, ctx);

    expect(result.status).toBe("completed");
    expect(result.agentId).toBe("mock-agent");
    expect(result.result).toEqual({ data: "e2e-result" });
  });

  /**
   * E2E Test 2: intent → route → dispatch → awaiting_approval → resolve token → result
   *
   * Validates the full approval gate flow end-to-end.
   */
  it("E2E: intent → route → dispatch → awaiting_approval → resolve → result", async () => {
    if (!RUN_INTEGRATION) return;

    vi.mock("../../../lib/llm", () => ({
      llmGenerateObject: vi.fn().mockResolvedValue({
        object: {
          selectedAgents: [
            {
              taskId: "mock-agent",
              reasoning: "needs human review",
              input: { message: "requires approval" },
            },
          ],
          strategy: "sequential",
        },
        tokenUsage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
        finishReason: "stop",
      }),
    }));

    vi.mock("../../../lib/persistence", async () => {
      const actual = await vi.importActual("../../../lib/persistence");
      return {
        ...(actual as Record<string, unknown>),
        requestApproval: vi.fn().mockResolvedValue("approval-e2e-001"),
      };
    });

    vi.mock("@trigger.dev/sdk", async () => {
      const actual = await vi.importActual("@trigger.dev/sdk");
      return {
        ...(actual as Record<string, unknown>),
        tasks: {
          triggerAndWait: vi
            .fn()
            .mockResolvedValue({ ok: true, output: { status: "awaiting_approval", reason: "manual review" } }),
        },
        wait: {
          createToken: vi.fn().mockResolvedValue({ id: "tok_integration_e2e" }),
          forToken: vi.fn().mockResolvedValue(undefined), // token resolved immediately
        },
      };
    });

    const { routeIntent, dispatchAgent } = await import("../workflow-orchestrator");

    const ctx = {
      runId: "integration-run-002",
      triggerRunId: "trigger-integration-002",
      config: {
        id: "workflow-orchestrator",
        name: "Workflow Orchestrator",
        provider: "anthropic" as const,
        model: "claude-sonnet-4-20250514",
        temperature: 0,
      },
      logStep: vi.fn().mockResolvedValue(undefined),
    };

    const decision = await routeIntent({ intent: "send proposal that needs approval" }, ctx);
    const firstAgent = decision.selectedAgents[0];
    expect(firstAgent).toBeDefined();

    const result = await dispatchAgent(firstAgent!.taskId, firstAgent!.input, ctx);

    // Token was resolved (forToken returned), so status is awaiting_approval with token ID
    expect(result.status).toBe("awaiting_approval");
    expect(result.approvalTokenId).toBe("tok_integration_e2e");
  });
});
