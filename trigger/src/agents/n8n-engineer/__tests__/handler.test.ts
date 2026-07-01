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

// Mock node:fs/promises BEFORE importing handler
vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

import { llmGenerateObject } from "../../../lib/llm.js";
import { loadPrompt } from "../../../lib/prompts.js";
import { requestApproval } from "../../../lib/persistence.js";
import { readdir, mkdir, writeFile } from "node:fs/promises";
import { n8nEngineerHandler } from "../handler.js";
import type { AgentContext } from "../../../lib/agent-types.js";
import { AgentConfigSchema } from "../../../lib/agent-types.js";

const mockLlmGenerateObject = vi.mocked(llmGenerateObject);
const mockLoadPrompt = vi.mocked(loadPrompt);
const mockRequestApproval = vi.mocked(requestApproval);
const mockReaddir = vi.mocked(readdir);
const mockMkdir = vi.mocked(mkdir);
const mockWriteFile = vi.mocked(writeFile);

// --- Fixtures ---

const mockConfig = AgentConfigSchema.parse({
  id: "n8n-engineer",
  name: "N8n Workflow Engineer",
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

const mockWorkflow = {
  name: "Email Automation Workflow",
  nodes: [
    {
      id: "node-1",
      name: "Gmail Trigger",
      type: "n8n-nodes-base.gmailTrigger",
      typeVersion: 1,
      position: [100, 200] as [number, number],
      parameters: {},
    },
    {
      id: "node-2",
      name: "Send Email",
      type: "n8n-nodes-base.gmail",
      typeVersion: 2,
      position: [400, 200] as [number, number],
      parameters: { operation: "send" },
    },
  ],
  connections: {
    "Gmail Trigger": { main: [[{ node: "Send Email", type: "main", index: 0 }]] },
  },
  settings: {},
};

const mockInput = {
  proposalText: "This is an approved proposal text for email automation with more than twenty chars.",
  clientSlug: "acme-corp",
  workflowDescription: "Email automation workflow for sending notifications",
};

// --- Tests ---

describe("n8nEngineerHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadPrompt.mockResolvedValue("mock-system-prompt");
    mockReaddir.mockResolvedValue(
      ["Gmail_and_Email_Automation", "OpenAI_and_LLMs", "Database_and_Storage"] as unknown as ReturnType<typeof readdir> extends Promise<infer T> ? T : never,
    );
    mockLlmGenerateObject.mockResolvedValue({
      object: mockWorkflow,
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
    const output = await n8nEngineerHandler(mockInput, ctx);

    expect(output.status).toBe("needs-approval");
    expect(output.workflowId).toBe("email-automation-workflow");
    expect(output.workflowName).toBe("Email Automation Workflow");
    expect(output.approvalId).toBe("approval-uuid-123");
  });

  it("returns workflowFilePath containing clientSlug and correct path", async () => {
    const ctx = makeMockCtx();
    const output = await n8nEngineerHandler(mockInput, ctx);

    expect(output.workflowFilePath).toContain("clients/acme-corp/03-diseno/workflow.json");
  });

  // Template search
  it("calls readdir with the templates path", async () => {
    const ctx = makeMockCtx();
    await n8nEngineerHandler(mockInput, ctx);

    expect(mockReaddir).toHaveBeenCalledOnce();
    const callArg = String(mockReaddir.mock.calls[0][0]);
    expect(callArg).toContain("references/n8n/templates");
  });

  it("passes template list to loadPrompt as availableTemplates", async () => {
    const ctx = makeMockCtx();
    await n8nEngineerHandler(mockInput, ctx);

    expect(mockLoadPrompt).toHaveBeenCalledWith(
      "n8n-engineer",
      expect.objectContaining({
        availableTemplates: expect.any(String),
      }),
    );
    const vars = mockLoadPrompt.mock.calls[0][1] as Record<string, string>;
    expect(vars.availableTemplates).toContain("Gmail_and_Email_Automation");
  });

  // File output
  it("calls mkdir with { recursive: true } for the correct path", async () => {
    const ctx = makeMockCtx();
    await n8nEngineerHandler(mockInput, ctx);

    expect(mockMkdir).toHaveBeenCalledOnce();
    expect(mockMkdir.mock.calls[0][1]).toEqual({ recursive: true });
    expect(String(mockMkdir.mock.calls[0][0])).toContain("clients/acme-corp/03-diseno");
  });

  it("calls writeFile with correct path for acme-corp", async () => {
    const ctx = makeMockCtx();
    await n8nEngineerHandler(mockInput, ctx);

    expect(mockWriteFile).toHaveBeenCalledOnce();
    const filePath = String(mockWriteFile.mock.calls[0][0]);
    expect(filePath).toContain("clients/acme-corp/03-diseno/workflow.json");
  });

  it("writes pretty-printed JSON (2-space indent)", async () => {
    const ctx = makeMockCtx();
    await n8nEngineerHandler(mockInput, ctx);

    const content = String(mockWriteFile.mock.calls[0][1]);
    // Pretty-printed JSON contains newlines and leading spaces
    expect(content).toContain("\n");
    expect(content).toContain('  "');
  });

  // Approval gate
  it("calls requestApproval exactly once after successful write", async () => {
    const ctx = makeMockCtx();
    await n8nEngineerHandler(mockInput, ctx);

    expect(mockRequestApproval).toHaveBeenCalledOnce();
  });

  it("calls requestApproval with correct agentId and stepName", async () => {
    const ctx = makeMockCtx();
    await n8nEngineerHandler(mockInput, ctx);

    expect(mockRequestApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "n8n-engineer",
        stepName: "workflow-review",
        runId: "run-test-123",
      }),
    );
  });

  // logStep calls
  it("calls ctx.logStep for all 5 steps in order", async () => {
    const ctx = makeMockCtx();
    await n8nEngineerHandler(mockInput, ctx);

    expect(ctx.logStep).toHaveBeenCalledTimes(5);
    const calls = vi.mocked(ctx.logStep).mock.calls;
    expect(calls[0][0].stepName).toBe("load-prompt");
    expect(calls[1][0].stepName).toBe("list-templates");
    expect(calls[2][0].stepName).toBe("generate-workflow");
    expect(calls[3][0].stepName).toBe("write-file");
    expect(calls[4][0].stepName).toBe("request-approval");
  });

  // Error handling — LLM error propagates
  it("propagates LLM error — does not swallow it", async () => {
    const ctx = makeMockCtx();
    mockLlmGenerateObject.mockRejectedValue(new Error("NetworkError: LLM unavailable"));

    await expect(n8nEngineerHandler(mockInput, ctx)).rejects.toThrow(
      "NetworkError: LLM unavailable",
    );
  });

  it("does NOT call writeFile when LLM throws", async () => {
    const ctx = makeMockCtx();
    mockLlmGenerateObject.mockRejectedValue(new Error("LLM error"));

    await expect(n8nEngineerHandler(mockInput, ctx)).rejects.toThrow();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("does NOT call requestApproval when LLM throws", async () => {
    const ctx = makeMockCtx();
    mockLlmGenerateObject.mockRejectedValue(new Error("LLM error"));

    await expect(n8nEngineerHandler(mockInput, ctx)).rejects.toThrow();
    expect(mockRequestApproval).not.toHaveBeenCalled();
  });

  // File write error propagates
  it("propagates file write error — does not swallow it", async () => {
    const ctx = makeMockCtx();
    mockWriteFile.mockRejectedValue(new Error("EACCES: permission denied"));

    await expect(n8nEngineerHandler(mockInput, ctx)).rejects.toThrow(
      "EACCES: permission denied",
    );
  });

  it("does NOT call requestApproval when file write fails", async () => {
    const ctx = makeMockCtx();
    mockWriteFile.mockRejectedValue(new Error("EACCES: permission denied"));

    await expect(n8nEngineerHandler(mockInput, ctx)).rejects.toThrow();
    expect(mockRequestApproval).not.toHaveBeenCalled();
  });
});
