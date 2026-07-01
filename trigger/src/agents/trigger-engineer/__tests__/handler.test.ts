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
  readdir: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

import { llmGenerateText } from "../../../lib/llm.js";
import { loadPrompt } from "../../../lib/prompts.js";
import { requestApproval } from "../../../lib/persistence.js";
import { readdir, mkdir, writeFile } from "node:fs/promises";
import { triggerEngineerHandler } from "../handler.js";
import type { AgentContext } from "../../../lib/agent-types.js";
import { AgentConfigSchema } from "../../../lib/agent-types.js";

const mockLlmGenerateText = vi.mocked(llmGenerateText);
const mockLoadPrompt = vi.mocked(loadPrompt);
const mockRequestApproval = vi.mocked(requestApproval);
const mockReaddir = vi.mocked(readdir);
const mockMkdir = vi.mocked(mkdir);
const mockWriteFile = vi.mocked(writeFile);

// --- Fixtures ---

const mockConfig = AgentConfigSchema.parse({
  id: "trigger-engineer",
  name: "Trigger.dev Task Engineer",
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
  temperature: 0.2,
  maxTokens: 8192,
});

function makeMockCtx(): AgentContext {
  return {
    runId: "run-test-123",
    triggerRunId: "trigger-test-abc",
    config: mockConfig,
    logStep: vi.fn().mockResolvedValue(undefined),
  };
}

const mockTaskCode = `import { task } from "@trigger.dev/sdk";

export const emailNotificationTask = task({
  id: "email-notification",
  run: async (payload: { userId: string }) => {
    return { sent: true };
  },
});`;

const mockInput = {
  proposalText: "This is an approved proposal text for email automation with more than twenty chars.",
  clientSlug: "acme-corp",
  taskDescription: "Email notification task for users",
};

// --- Tests ---

describe("triggerEngineerHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadPrompt.mockResolvedValue("mock-system-prompt");
    mockReaddir.mockResolvedValue(
      ["batch-processing", "email-notification", "ai-processing"] as unknown as ReturnType<typeof readdir> extends Promise<infer T> ? T : never,
    );
    mockLlmGenerateText.mockResolvedValue({
      text: mockTaskCode,
      tokenUsage: { promptTokens: 500, completionTokens: 1000, totalTokens: 1500 },
      finishReason: "stop",
    });
    mockRequestApproval.mockResolvedValue("approval-uuid-123");
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
  });

  // Happy path
  it("returns output with status 'needs-approval' on success", async () => {
    const ctx = makeMockCtx();
    const output = await triggerEngineerHandler(mockInput, ctx);

    expect(output.status).toBe("needs-approval");
    expect(output.approvalId).toBe("approval-uuid-123");
  });

  it("returns taskFilePath containing clientSlug and correct path", async () => {
    const ctx = makeMockCtx();
    const output = await triggerEngineerHandler(mockInput, ctx);

    expect(output.taskFilePath).toContain("clients/acme-corp/03-diseno/trigger-task.ts");
  });

  // TaskId derivation — table-driven
  it.each([
    ["Email Automation", "email-automation"],
    ["Send Weekly Report", "send-weekly-report"],
    ["Process User Data!", "process-user-data"],
    ["  Leading spaces  ", "leading-spaces"],
  ])("derives taskId '%s' → '%s'", async (_description, expectedId) => {
    const ctx = makeMockCtx();
    const output = await triggerEngineerHandler(
      { ...mockInput, taskDescription: _description.length >= 10 ? _description : _description + " extra padding" },
      ctx,
    );

    // We test the derivation directly by checking the returned taskId
    expect(output.taskId).toBe(expectedId);
  });

  it("truncates taskId to 64 characters for very long descriptions", async () => {
    const ctx = makeMockCtx();
    const longDescription = "This is a very long task description that exceeds the maximum task id length limit";
    const output = await triggerEngineerHandler(
      { ...mockInput, taskDescription: longDescription },
      ctx,
    );

    expect(output.taskId.length).toBeLessThanOrEqual(64);
  });

  // Example search
  it("calls readdir with the correct examples path", async () => {
    const ctx = makeMockCtx();
    await triggerEngineerHandler(mockInput, ctx);

    expect(mockReaddir).toHaveBeenCalledOnce();
    const callArg = String(mockReaddir.mock.calls[0][0]);
    expect(callArg).toContain("references/trigger.dev/examples");
  });

  it("passes example list to loadPrompt as availableExamples", async () => {
    const ctx = makeMockCtx();
    await triggerEngineerHandler(mockInput, ctx);

    expect(mockLoadPrompt).toHaveBeenCalledWith(
      "trigger-engineer",
      expect.objectContaining({
        availableExamples: expect.any(String),
      }),
    );
    const vars = mockLoadPrompt.mock.calls[0][1] as Record<string, string>;
    expect(vars.availableExamples).toContain("batch-processing");
  });

  // File output
  it("calls mkdir with { recursive: true } for the correct path", async () => {
    const ctx = makeMockCtx();
    await triggerEngineerHandler(mockInput, ctx);

    expect(mockMkdir).toHaveBeenCalledOnce();
    expect(mockMkdir.mock.calls[0][1]).toEqual({ recursive: true });
    expect(String(mockMkdir.mock.calls[0][0])).toContain("clients/acme-corp/03-diseno");
  });

  it("calls writeFile with correct path for acme-corp", async () => {
    const ctx = makeMockCtx();
    await triggerEngineerHandler(mockInput, ctx);

    expect(mockWriteFile).toHaveBeenCalledOnce();
    const filePath = String(mockWriteFile.mock.calls[0][0]);
    expect(filePath).toContain("clients/acme-corp/03-diseno/trigger-task.ts");
  });

  // Code fence stripping
  it("strips typescript code fences before writing", async () => {
    const ctx = makeMockCtx();
    const wrappedCode = "```typescript\nimport { task } from '@trigger.dev/sdk';\n```";
    mockLlmGenerateText.mockResolvedValueOnce({
      text: wrappedCode,
      tokenUsage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      finishReason: "stop",
    });

    await triggerEngineerHandler(mockInput, ctx);

    const writtenContent = String(mockWriteFile.mock.calls[0][1]);
    expect(writtenContent).not.toContain("```typescript");
    expect(writtenContent).not.toContain("```");
    expect(writtenContent).toContain("import { task }");
  });

  it("strips ts code fences before writing", async () => {
    const ctx = makeMockCtx();
    const wrappedCode = "```ts\nimport { task } from '@trigger.dev/sdk';\n```";
    mockLlmGenerateText.mockResolvedValueOnce({
      text: wrappedCode,
      tokenUsage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      finishReason: "stop",
    });

    await triggerEngineerHandler(mockInput, ctx);

    const writtenContent = String(mockWriteFile.mock.calls[0][1]);
    expect(writtenContent).not.toContain("```ts");
    expect(writtenContent).not.toContain("```");
  });

  it("does not modify code with no fences", async () => {
    const ctx = makeMockCtx();
    const plainCode = "import { task } from '@trigger.dev/sdk';";
    mockLlmGenerateText.mockResolvedValueOnce({
      text: plainCode,
      tokenUsage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      finishReason: "stop",
    });

    await triggerEngineerHandler(mockInput, ctx);

    const writtenContent = String(mockWriteFile.mock.calls[0][1]);
    expect(writtenContent).toBe(plainCode);
  });

  // Approval gate
  it("calls requestApproval exactly once after successful write", async () => {
    const ctx = makeMockCtx();
    await triggerEngineerHandler(mockInput, ctx);

    expect(mockRequestApproval).toHaveBeenCalledOnce();
  });

  it("calls requestApproval with correct agentId and stepName", async () => {
    const ctx = makeMockCtx();
    await triggerEngineerHandler(mockInput, ctx);

    expect(mockRequestApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "trigger-engineer",
        stepName: "task-review",
        runId: "run-test-123",
      }),
    );
  });

  // logStep calls
  it("calls ctx.logStep for all 5 steps in order", async () => {
    const ctx = makeMockCtx();
    await triggerEngineerHandler(mockInput, ctx);

    expect(ctx.logStep).toHaveBeenCalledTimes(5);
    const calls = vi.mocked(ctx.logStep).mock.calls;
    expect(calls[0][0].stepName).toBe("load-prompt");
    expect(calls[1][0].stepName).toBe("search-examples");
    expect(calls[2][0].stepName).toBe("generate-task");
    expect(calls[3][0].stepName).toBe("write-file");
    expect(calls[4][0].stepName).toBe("request-approval");
  });

  // Error handling — LLM error propagates
  it("propagates LLM error — does not swallow it", async () => {
    const ctx = makeMockCtx();
    mockLlmGenerateText.mockRejectedValue(new Error("NetworkError: LLM unavailable"));

    await expect(triggerEngineerHandler(mockInput, ctx)).rejects.toThrow(
      "NetworkError: LLM unavailable",
    );
  });

  it("does NOT call writeFile when LLM throws", async () => {
    const ctx = makeMockCtx();
    mockLlmGenerateText.mockRejectedValue(new Error("LLM error"));

    await expect(triggerEngineerHandler(mockInput, ctx)).rejects.toThrow();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("does NOT call requestApproval when LLM throws", async () => {
    const ctx = makeMockCtx();
    mockLlmGenerateText.mockRejectedValue(new Error("LLM error"));

    await expect(triggerEngineerHandler(mockInput, ctx)).rejects.toThrow();
    expect(mockRequestApproval).not.toHaveBeenCalled();
  });

  // File write error propagates
  it("propagates file write error — does not swallow it", async () => {
    const ctx = makeMockCtx();
    mockWriteFile.mockRejectedValue(new Error("EACCES: permission denied"));

    await expect(triggerEngineerHandler(mockInput, ctx)).rejects.toThrow(
      "EACCES: permission denied",
    );
  });

  it("does NOT call requestApproval when file write fails", async () => {
    const ctx = makeMockCtx();
    mockWriteFile.mockRejectedValue(new Error("EACCES: permission denied"));

    await expect(triggerEngineerHandler(mockInput, ctx)).rejects.toThrow();
    expect(mockRequestApproval).not.toHaveBeenCalled();
  });

  it("propagates readdir error — does not swallow it", async () => {
    const ctx = makeMockCtx();
    mockReaddir.mockRejectedValue(new Error("ENOENT: no such file or directory"));

    await expect(triggerEngineerHandler(mockInput, ctx)).rejects.toThrow(
      "ENOENT: no such file or directory",
    );
  });
});
