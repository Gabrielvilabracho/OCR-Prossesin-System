import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock lib/llm BEFORE importing handler
vi.mock("../../../lib/llm", () => ({
  llmGenerateObject: vi.fn(),
}));

// Mock lib/prompts BEFORE importing handler
vi.mock("../../../lib/prompts", () => ({
  loadPrompt: vi.fn(),
}));

// Mock lib/persistence BEFORE importing handler
vi.mock("../../../lib/persistence", () => ({
  requestApproval: vi.fn(),
}));

import { llmGenerateObject } from "../../../lib/llm.js";
import { loadPrompt } from "../../../lib/prompts.js";
import { requestApproval } from "../../../lib/persistence.js";
import { validationQaHandler } from "../handler.js";
import type { AgentContext } from "../../../lib/agent-types.js";
import { AgentConfigSchema } from "../../../lib/agent-types.js";
import type { ChecklistItem } from "../schema.js";

const mockLlmGenerateObject = vi.mocked(llmGenerateObject);
const mockLoadPrompt = vi.mocked(loadPrompt);
const mockRequestApproval = vi.mocked(requestApproval);

// --- Fixtures ---

const mockConfig = AgentConfigSchema.parse({
  id: "validation-qa",
  name: "Validation QA Engineer",
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
  temperature: 0,
  maxTokens: 4096,
});

function makeMockCtx(): AgentContext {
  return {
    runId: "run-test-123",
    triggerRunId: "trigger-test-abc",
    config: mockConfig,
    logStep: vi.fn().mockResolvedValue(undefined),
  };
}

const mockInput = {
  implementationSummary:
    "This is a detailed implementation summary covering all workflow automation steps for the client.",
  clientSlug: "acme-corp",
  deliverables: ["workflow.json", "runbook.md", "handoff.md"],
};

function makeAllPassItems(): ChecklistItem[] {
  return [
    { category: "completeness", passed: true, notes: "All deliverables present." },
    { category: "security", passed: true, notes: "No secrets exposed." },
    { category: "error-handling", passed: true, notes: "Rollback plan documented." },
    { category: "kpi-alignment", passed: true, notes: "KPIs are measurable." },
  ];
}

function makeSecurityFailItems(): ChecklistItem[] {
  return [
    { category: "completeness", passed: true, notes: "All deliverables present." },
    { category: "security", passed: false, notes: "Hardcoded API key found in workflow.json." },
    { category: "error-handling", passed: true, notes: "Rollback plan documented." },
    { category: "kpi-alignment", passed: true, notes: "KPIs are measurable." },
  ];
}

function makeErrorHandlingFailItems(): ChecklistItem[] {
  return [
    { category: "completeness", passed: true, notes: "All deliverables present." },
    { category: "security", passed: true, notes: "No secrets exposed." },
    { category: "error-handling", passed: false, notes: "No rollback plan documented." },
    { category: "kpi-alignment", passed: true, notes: "KPIs are measurable." },
  ];
}

function makeCompletenessFailItems(): ChecklistItem[] {
  return [
    { category: "completeness", passed: false, notes: "Runbook is missing." },
    { category: "security", passed: true, notes: "No secrets exposed." },
    { category: "error-handling", passed: true, notes: "Rollback plan documented." },
    { category: "kpi-alignment", passed: true, notes: "KPIs are measurable." },
  ];
}

function makeKpiFailItems(): ChecklistItem[] {
  return [
    { category: "completeness", passed: true, notes: "All deliverables present." },
    { category: "security", passed: true, notes: "No secrets exposed." },
    { category: "error-handling", passed: true, notes: "Rollback plan documented." },
    { category: "kpi-alignment", passed: false, notes: "KPIs from proposal not addressed." },
  ];
}

function mockLlmResult(items: ChecklistItem[]) {
  mockLlmGenerateObject.mockResolvedValue({
    object: { items, summary: "QA checklist evaluation complete." },
    tokenUsage: { promptTokens: 300, completionTokens: 600, totalTokens: 900 },
    finishReason: "stop",
  });
}

// --- Tests ---

describe("validationQaHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadPrompt.mockResolvedValue("mock-system-prompt");
    mockRequestApproval.mockResolvedValue("approval-uuid-123");
  });

  // --- All pass → go ---

  it("returns recommendation 'go' when all items pass", async () => {
    mockLlmResult(makeAllPassItems());
    const ctx = makeMockCtx();
    const output = await validationQaHandler(mockInput, ctx);

    expect(output.recommendation).toBe("go");
    expect(output.passed).toBe(true);
  });

  it("returns empty issues when all items pass", async () => {
    mockLlmResult(makeAllPassItems());
    const ctx = makeMockCtx();
    const output = await validationQaHandler(mockInput, ctx);

    expect(output.issues).toEqual([]);
  });

  it("does NOT call requestApproval when recommendation is 'go'", async () => {
    mockLlmResult(makeAllPassItems());
    const ctx = makeMockCtx();
    await validationQaHandler(mockInput, ctx);

    expect(mockRequestApproval).not.toHaveBeenCalled();
  });

  it("returns approvalId as undefined when recommendation is 'go'", async () => {
    mockLlmResult(makeAllPassItems());
    const ctx = makeMockCtx();
    const output = await validationQaHandler(mockInput, ctx);

    expect(output.approvalId).toBeUndefined();
  });

  it("calls logStep exactly 3 times on 'go' path", async () => {
    mockLlmResult(makeAllPassItems());
    const ctx = makeMockCtx();
    await validationQaHandler(mockInput, ctx);

    expect(ctx.logStep).toHaveBeenCalledTimes(3);
    const calls = vi.mocked(ctx.logStep).mock.calls;
    expect(calls[0][0].stepName).toBe("load-prompt");
    expect(calls[1][0].stepName).toBe("run-checklist");
    expect(calls[2][0].stepName).toBe("evaluate-recommendation");
  });

  // --- Security fails → no-go ---

  it("returns recommendation 'no-go' when security fails", async () => {
    mockLlmResult(makeSecurityFailItems());
    const ctx = makeMockCtx();
    const output = await validationQaHandler(mockInput, ctx);

    expect(output.recommendation).toBe("no-go");
    expect(output.passed).toBe(false);
  });

  it("calls requestApproval when security fails", async () => {
    mockLlmResult(makeSecurityFailItems());
    const ctx = makeMockCtx();
    await validationQaHandler(mockInput, ctx);

    expect(mockRequestApproval).toHaveBeenCalledOnce();
  });

  it("includes approvalId in output when security fails", async () => {
    mockLlmResult(makeSecurityFailItems());
    const ctx = makeMockCtx();
    const output = await validationQaHandler(mockInput, ctx);

    expect(output.approvalId).toBe("approval-uuid-123");
  });

  it("requestApproval called with correct agentId and stepName on security fail", async () => {
    mockLlmResult(makeSecurityFailItems());
    const ctx = makeMockCtx();
    await validationQaHandler(mockInput, ctx);

    expect(mockRequestApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "validation-qa",
        stepName: "qa-review",
        runId: "run-test-123",
      }),
    );
  });

  it("calls logStep exactly 4 times on 'no-go' path", async () => {
    mockLlmResult(makeSecurityFailItems());
    const ctx = makeMockCtx();
    await validationQaHandler(mockInput, ctx);

    expect(ctx.logStep).toHaveBeenCalledTimes(4);
    const calls = vi.mocked(ctx.logStep).mock.calls;
    expect(calls[0][0].stepName).toBe("load-prompt");
    expect(calls[1][0].stepName).toBe("run-checklist");
    expect(calls[2][0].stepName).toBe("evaluate-recommendation");
    expect(calls[3][0].stepName).toBe("request-approval");
  });

  // --- error-handling fails → no-go ---

  it("returns recommendation 'no-go' when error-handling fails", async () => {
    mockLlmResult(makeErrorHandlingFailItems());
    const ctx = makeMockCtx();
    const output = await validationQaHandler(mockInput, ctx);

    expect(output.recommendation).toBe("no-go");
    expect(mockRequestApproval).toHaveBeenCalledOnce();
  });

  // --- Only completeness fails → needs-review ---

  it("returns recommendation 'needs-review' when only completeness fails", async () => {
    mockLlmResult(makeCompletenessFailItems());
    const ctx = makeMockCtx();
    const output = await validationQaHandler(mockInput, ctx);

    expect(output.recommendation).toBe("needs-review");
    expect(output.passed).toBe(false);
    expect(mockRequestApproval).toHaveBeenCalledOnce();
  });

  it("includes approvalId in output when needs-review", async () => {
    mockLlmResult(makeCompletenessFailItems());
    const ctx = makeMockCtx();
    const output = await validationQaHandler(mockInput, ctx);

    expect(output.approvalId).toBe("approval-uuid-123");
  });

  // --- Only kpi-alignment fails → needs-review ---

  it("returns recommendation 'needs-review' when only kpi-alignment fails", async () => {
    mockLlmResult(makeKpiFailItems());
    const ctx = makeMockCtx();
    const output = await validationQaHandler(mockInput, ctx);

    expect(output.recommendation).toBe("needs-review");
    expect(mockRequestApproval).toHaveBeenCalledOnce();
  });

  // --- Issues derivation ---

  it("issues array contains notes of all failed items", async () => {
    mockLlmResult(makeSecurityFailItems());
    const ctx = makeMockCtx();
    const output = await validationQaHandler(mockInput, ctx);

    expect(output.issues).toEqual(["Hardcoded API key found in workflow.json."]);
  });

  it("issues array contains notes from multiple failed items", async () => {
    const multiFailItems: ChecklistItem[] = [
      { category: "completeness", passed: false, notes: "Runbook is missing." },
      { category: "security", passed: false, notes: "Hardcoded secret found." },
      { category: "error-handling", passed: true, notes: "Rollback plan documented." },
      { category: "kpi-alignment", passed: true, notes: "KPIs are measurable." },
    ];
    mockLlmResult(multiFailItems);
    const ctx = makeMockCtx();
    const output = await validationQaHandler(mockInput, ctx);

    expect(output.issues).toHaveLength(2);
    expect(output.issues).toContain("Runbook is missing.");
    expect(output.issues).toContain("Hardcoded secret found.");
  });

  // --- checklistResults ---

  it("checklistResults contains all items returned by LLM", async () => {
    const items = makeAllPassItems();
    mockLlmResult(items);
    const ctx = makeMockCtx();
    const output = await validationQaHandler(mockInput, ctx);

    expect(output.checklistResults).toHaveLength(4);
    expect(output.checklistResults).toEqual(items);
  });

  // --- Error propagation ---

  it("propagates LLM error without calling requestApproval", async () => {
    mockLlmGenerateObject.mockRejectedValue(new Error("NetworkError: LLM unavailable"));
    const ctx = makeMockCtx();

    await expect(validationQaHandler(mockInput, ctx)).rejects.toThrow(
      "NetworkError: LLM unavailable",
    );
    expect(mockRequestApproval).not.toHaveBeenCalled();
  });

  it("propagates loadPrompt error without calling LLM or requestApproval", async () => {
    mockLoadPrompt.mockRejectedValue(new Error("PromptNotFoundError: validation-qa"));
    const ctx = makeMockCtx();

    await expect(validationQaHandler(mockInput, ctx)).rejects.toThrow("PromptNotFoundError");
    expect(mockLlmGenerateObject).not.toHaveBeenCalled();
    expect(mockRequestApproval).not.toHaveBeenCalled();
  });

  it("propagates requestApproval error when it throws", async () => {
    mockLlmResult(makeSecurityFailItems());
    mockRequestApproval.mockRejectedValue(new Error("DB connection failed"));
    const ctx = makeMockCtx();

    await expect(validationQaHandler(mockInput, ctx)).rejects.toThrow("DB connection failed");
  });

  // --- loadPrompt called with correct args ---

  it("calls loadPrompt with 'validation-qa' and expected vars", async () => {
    mockLlmResult(makeAllPassItems());
    const ctx = makeMockCtx();
    await validationQaHandler(mockInput, ctx);

    expect(mockLoadPrompt).toHaveBeenCalledWith(
      "validation-qa",
      expect.objectContaining({
        implementationSummary: mockInput.implementationSummary,
        clientSlug: mockInput.clientSlug,
        deliverablesList: expect.any(String),
      }),
    );
  });
});
