import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock lib/llm BEFORE importing handler
vi.mock("../../../lib/llm", () => ({
  llmGenerateText: vi.fn(),
}));

// Mock lib/prompts BEFORE importing handler
vi.mock("../../../lib/prompts", () => ({
  loadPrompt: vi.fn(),
}));

// Mock lib/persistence BEFORE importing handler
vi.mock("../../../lib/persistence", () => ({
  requestApproval: vi.fn(),
}));

// Mock node:fs/promises BEFORE importing handler
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

import { llmGenerateText } from "../../../lib/llm.js";
import { loadPrompt } from "../../../lib/prompts.js";
import { requestApproval } from "../../../lib/persistence.js";
import { mkdir, writeFile } from "node:fs/promises";
import { clientDeliveryHandler } from "../handler.js";
import type { AgentContext } from "../../../lib/agent-types.js";
import { AgentConfigSchema } from "../../../lib/agent-types.js";

const mockLlmGenerateText = vi.mocked(llmGenerateText);
const mockLoadPrompt = vi.mocked(loadPrompt);
const mockRequestApproval = vi.mocked(requestApproval);
const mockMkdir = vi.mocked(mkdir);
const mockWriteFile = vi.mocked(writeFile);

// --- Fixtures ---

const mockConfig = AgentConfigSchema.parse({
  id: "client-delivery",
  name: "Client Delivery Agent",
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
  temperature: 0.3,
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
  proposalText: "This is an approved proposal text for automation with more than twenty chars.",
  clientSlug: "acme-corp",
  deliverables: ["Email automation workflow", "Dashboard reporting"],
  qaResults: "All quality checks passed successfully.",
};

function makeLlmResponse(text: string) {
  return {
    text,
    tokenUsage: { promptTokens: 500, completionTokens: 1000, totalTokens: 1500 },
    finishReason: "stop",
  };
}

// --- Tests ---

describe("clientDeliveryHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadPrompt.mockResolvedValue("mock-system-prompt");
    mockLlmGenerateText
      .mockResolvedValueOnce(makeLlmResponse("# Runbook content for acme-corp"))
      .mockResolvedValueOnce(makeLlmResponse("# Handoff content for acme-corp"))
      .mockResolvedValueOnce(makeLlmResponse("# Demo script content for acme-corp"));
    mockRequestApproval.mockResolvedValue("approval-uuid-123");
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
  });

  // Happy path
  it("returns output with status 'needs-approval' on success", async () => {
    const ctx = makeMockCtx();
    const output = await clientDeliveryHandler(mockInput, ctx);

    expect(output.status).toBe("needs-approval");
    expect(output.approvalId).toBe("approval-uuid-123");
  });

  it("returns all five required output fields", async () => {
    const ctx = makeMockCtx();
    const output = await clientDeliveryHandler(mockInput, ctx);

    expect(output.runbookPath).toBeTruthy();
    expect(output.handoffPath).toBeTruthy();
    expect(output.demoScriptPath).toBeTruthy();
    expect(output.status).toBe("needs-approval");
    expect(output.approvalId).toBe("approval-uuid-123");
  });

  // Three LLM calls
  it("calls llmGenerateText exactly three times", async () => {
    const ctx = makeMockCtx();
    await clientDeliveryHandler(mockInput, ctx);

    expect(mockLlmGenerateText).toHaveBeenCalledTimes(3);
  });

  // loadPrompt called with correct paths
  it("calls loadPrompt with 'client-delivery/runbook' for first call", async () => {
    const ctx = makeMockCtx();
    await clientDeliveryHandler(mockInput, ctx);

    expect(mockLoadPrompt).toHaveBeenCalledWith("client-delivery/runbook", expect.any(Object));
  });

  it("calls loadPrompt with 'client-delivery/handoff' for second call", async () => {
    const ctx = makeMockCtx();
    await clientDeliveryHandler(mockInput, ctx);

    expect(mockLoadPrompt).toHaveBeenCalledWith("client-delivery/handoff", expect.any(Object));
  });

  it("calls loadPrompt with 'client-delivery/demo-script' for third call", async () => {
    const ctx = makeMockCtx();
    await clientDeliveryHandler(mockInput, ctx);

    expect(mockLoadPrompt).toHaveBeenCalledWith("client-delivery/demo-script", expect.any(Object));
  });

  it("calls loadPrompt exactly three times", async () => {
    const ctx = makeMockCtx();
    await clientDeliveryHandler(mockInput, ctx);

    expect(mockLoadPrompt).toHaveBeenCalledTimes(3);
  });

  // File paths contain correct clientSlug and 05-golive dir
  it("runbookPath contains clientSlug and 05-golive directory", async () => {
    const ctx = makeMockCtx();
    const output = await clientDeliveryHandler(mockInput, ctx);

    expect(output.runbookPath).toContain("clients/acme-corp/05-golive");
    expect(output.runbookPath).toContain("runbook.md");
  });

  it("handoffPath contains clientSlug and 05-golive directory", async () => {
    const ctx = makeMockCtx();
    const output = await clientDeliveryHandler(mockInput, ctx);

    expect(output.handoffPath).toContain("clients/acme-corp/05-golive");
    expect(output.handoffPath).toContain("handoff.md");
  });

  it("demoScriptPath contains clientSlug and 05-golive directory", async () => {
    const ctx = makeMockCtx();
    const output = await clientDeliveryHandler(mockInput, ctx);

    expect(output.demoScriptPath).toContain("clients/acme-corp/05-golive");
    expect(output.demoScriptPath).toContain("demo-script.md");
  });

  // File writes
  it("calls writeFile exactly three times", async () => {
    const ctx = makeMockCtx();
    await clientDeliveryHandler(mockInput, ctx);

    expect(mockWriteFile).toHaveBeenCalledTimes(3);
  });

  it("calls mkdir with { recursive: true } for the correct 05-golive path", async () => {
    const ctx = makeMockCtx();
    await clientDeliveryHandler(mockInput, ctx);

    expect(mockMkdir).toHaveBeenCalledOnce();
    expect(mockMkdir.mock.calls[0][1]).toEqual({ recursive: true });
    expect(String(mockMkdir.mock.calls[0][0])).toContain("clients/acme-corp/05-golive");
  });

  // requestApproval always called (no conditional bypass)
  it("calls requestApproval exactly once after all files are written", async () => {
    const ctx = makeMockCtx();
    await clientDeliveryHandler(mockInput, ctx);

    expect(mockRequestApproval).toHaveBeenCalledOnce();
  });

  it("calls requestApproval with correct agentId, stepName, and runId", async () => {
    const ctx = makeMockCtx();
    await clientDeliveryHandler(mockInput, ctx);

    expect(mockRequestApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "client-delivery",
        stepName: "delivery-review",
        runId: "run-test-123",
      }),
    );
  });

  // logStep called 5 times total
  it("calls ctx.logStep exactly 5 times in correct order", async () => {
    const ctx = makeMockCtx();
    await clientDeliveryHandler(mockInput, ctx);

    expect(ctx.logStep).toHaveBeenCalledTimes(5);
    const calls = vi.mocked(ctx.logStep).mock.calls;
    expect(calls[0][0].stepName).toBe("generate-runbook");
    expect(calls[1][0].stepName).toBe("generate-handoff");
    expect(calls[2][0].stepName).toBe("generate-demo-script");
    expect(calls[3][0].stepName).toBe("write-files");
    expect(calls[4][0].stepName).toBe("request-approval");
  });

  // Error handling: first LLM error propagates, skips remaining calls
  it("propagates first LLM error and skips subsequent calls", async () => {
    const ctx = makeMockCtx();
    mockLlmGenerateText.mockReset();
    mockLlmGenerateText.mockRejectedValue(new Error("NetworkError: LLM unavailable"));

    await expect(clientDeliveryHandler(mockInput, ctx)).rejects.toThrow(
      "NetworkError: LLM unavailable",
    );
    expect(mockLlmGenerateText).toHaveBeenCalledTimes(1);
  });

  it("does NOT call writeFile when first LLM throws", async () => {
    const ctx = makeMockCtx();
    mockLlmGenerateText.mockReset();
    mockLlmGenerateText.mockRejectedValue(new Error("LLM error"));

    await expect(clientDeliveryHandler(mockInput, ctx)).rejects.toThrow();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("does NOT call requestApproval when first LLM throws", async () => {
    const ctx = makeMockCtx();
    mockLlmGenerateText.mockReset();
    mockLlmGenerateText.mockRejectedValue(new Error("LLM error"));

    await expect(clientDeliveryHandler(mockInput, ctx)).rejects.toThrow();
    expect(mockRequestApproval).not.toHaveBeenCalled();
  });

  it("propagates second LLM error — skips third call and requestApproval", async () => {
    const ctx = makeMockCtx();
    mockLlmGenerateText.mockReset();
    mockLlmGenerateText
      .mockResolvedValueOnce(makeLlmResponse("# Runbook"))
      .mockRejectedValueOnce(new Error("LLM error on handoff"));

    await expect(clientDeliveryHandler(mockInput, ctx)).rejects.toThrow("LLM error on handoff");
    expect(mockLlmGenerateText).toHaveBeenCalledTimes(2);
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockRequestApproval).not.toHaveBeenCalled();
  });

  // File write error propagates, skips requestApproval
  it("propagates file write error and skips requestApproval", async () => {
    const ctx = makeMockCtx();
    mockWriteFile.mockRejectedValue(new Error("EACCES: permission denied"));

    await expect(clientDeliveryHandler(mockInput, ctx)).rejects.toThrow(
      "EACCES: permission denied",
    );
    expect(mockRequestApproval).not.toHaveBeenCalled();
  });

  it("propagates file write error — does not swallow it", async () => {
    const ctx = makeMockCtx();
    mockWriteFile.mockRejectedValue(new Error("ENOSPC: no space left on device"));

    await expect(clientDeliveryHandler(mockInput, ctx)).rejects.toThrow(
      "ENOSPC: no space left on device",
    );
  });
});
