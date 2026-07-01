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

import { llmGenerateText } from "../../../lib/llm";
import { loadPrompt } from "../../../lib/prompts";
import { requestApproval } from "../../../lib/persistence";
import { mkdir, writeFile } from "node:fs/promises";
import { proposalHandler } from "../handler";
import type { DiscoveryBrief } from "../../discovery/schema";
import type { AgentContext } from "../../../lib/agent-types";
import { AgentConfigSchema } from "../../../lib/agent-types";

const mockLlmGenerateText = vi.mocked(llmGenerateText);
const mockLoadPrompt = vi.mocked(loadPrompt);
const mockRequestApproval = vi.mocked(requestApproval);
const mockMkdir = vi.mocked(mkdir);
const mockWriteFile = vi.mocked(writeFile);

// --- Fixtures ---

const mockBrief: DiscoveryBrief = {
  companyName: "Acme Corp",
  industry: "SaaS",
  teamSize: "50",
  currentStack: ["Salesforce", "Slack"],
  businessObjective: "Automate lead qualification",
  currentProcess: "Manual review of inbound leads",
  processSteps: ["Receive lead", "Check CRM", "Assign to rep"],
  frequency: "daily",
  volume: "200 leads/day",
  painPoints: ["Takes 2 hours daily", "Inconsistent scoring"],
  manualHoursPerWeek: 10,
  errorRate: "15%",
  costImpact: "$5,000/month",
  expectedOutcome: "Automated lead scoring",
  kpiCandidates: ["Lead response time < 5 min"],
  deadline: "2026-06-01",
  budget: undefined,
  untouchableSystems: [],
  complianceRequirements: [],
  systemsInvolved: [{ name: "Salesforce", type: "API", hasCredentials: true }],
  urgency: "high",
  nextStepRecommendation: "Schedule F1 session",
  completenessScore: 85,
  extractionNotes: [],
};

const mockProposalText = "## Resumen Ejecutivo\nTest proposal content...";

const mockConfig = AgentConfigSchema.parse({
  id: "proposal-agent",
  name: "Proposal Agent",
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
  temperature: 0.3,
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

// --- Tests ---

describe("proposalHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadPrompt.mockResolvedValue("mock-system-prompt");
    mockLlmGenerateText.mockResolvedValue({
      text: mockProposalText,
      tokenUsage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      finishReason: "stop",
    });
    mockRequestApproval.mockResolvedValue("approval-uuid-123");
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
  });

  // REQ-03: loadPrompt called with correct args
  it("calls loadPrompt with 'proposal' and vars containing companyName", async () => {
    const ctx = makeMockCtx();
    await proposalHandler({ brief: mockBrief }, ctx);

    expect(mockLoadPrompt).toHaveBeenCalledOnce();
    expect(mockLoadPrompt).toHaveBeenCalledWith(
      "proposal",
      expect.objectContaining({ companyName: "Acme Corp" }),
    );
  });

  it("calls loadPrompt with additionalContext when provided", async () => {
    const ctx = makeMockCtx();
    await proposalHandler(
      { brief: mockBrief, additionalContext: "Prefer Trigger.dev" },
      ctx,
    );

    expect(mockLoadPrompt).toHaveBeenCalledWith(
      "proposal",
      expect.objectContaining({ additionalContext: "Prefer Trigger.dev" }),
    );
  });

  it("calls loadPrompt with additionalContext === '' when not provided", async () => {
    const ctx = makeMockCtx();
    await proposalHandler({ brief: mockBrief }, ctx);

    expect(mockLoadPrompt).toHaveBeenCalledWith(
      "proposal",
      expect.objectContaining({ additionalContext: "" }),
    );
  });

  // REQ-04: llmGenerateText called once
  it("calls llmGenerateText exactly once", async () => {
    const ctx = makeMockCtx();
    await proposalHandler({ brief: mockBrief }, ctx);

    expect(mockLlmGenerateText).toHaveBeenCalledOnce();
  });

  it("calls llmGenerateText with correct model config from ctx", async () => {
    const ctx = makeMockCtx();
    await proposalHandler({ brief: mockBrief }, ctx);

    const callArgs = mockLlmGenerateText.mock.calls[0][0];
    expect(callArgs.model.provider).toBe("anthropic");
    expect(callArgs.model.model).toBe("claude-sonnet-4-20250514");
    expect(callArgs.model.temperature).toBe(0.3);
    expect(callArgs.model.maxTokens).toBe(8192);
  });

  // REQ-07: Brief file written to correct path
  it("writes brief to path containing clients/acme-corp/01-intake/brief.md", async () => {
    const ctx = makeMockCtx();
    await proposalHandler({ brief: mockBrief }, ctx);

    const writeCalls = mockWriteFile.mock.calls;
    const briefWriteCall = writeCalls.find((call) =>
      String(call[0]).includes("01-intake"),
    );
    expect(briefWriteCall).toBeDefined();
    expect(String(briefWriteCall![0])).toContain("clients/acme-corp/01-intake/brief.md");
  });

  // REQ-08: Proposal file written to correct path
  it("writes proposal to path containing clients/acme-corp/03-diseno/proposal.md", async () => {
    const ctx = makeMockCtx();
    await proposalHandler({ brief: mockBrief }, ctx);

    const writeCalls = mockWriteFile.mock.calls;
    const proposalWriteCall = writeCalls.find((call) =>
      String(call[0]).includes("03-diseno"),
    );
    expect(proposalWriteCall).toBeDefined();
    expect(String(proposalWriteCall![0])).toContain(
      "clients/acme-corp/03-diseno/proposal.md",
    );
  });

  // REQ-07 + REQ-08: mkdir called with recursive: true
  it("calls mkdir with { recursive: true } for both directories", async () => {
    const ctx = makeMockCtx();
    await proposalHandler({ brief: mockBrief }, ctx);

    expect(mockMkdir).toHaveBeenCalledTimes(2);
    for (const call of mockMkdir.mock.calls) {
      expect(call[1]).toEqual({ recursive: true });
    }
  });

  // REQ-09: requestApproval called with correct params
  it("calls requestApproval with agentId 'proposal-agent' and stepName 'proposal-review'", async () => {
    const ctx = makeMockCtx();
    await proposalHandler({ brief: mockBrief }, ctx);

    expect(mockRequestApproval).toHaveBeenCalledOnce();
    expect(mockRequestApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "proposal-agent",
        stepName: "proposal-review",
        runId: "run-test-123",
      }),
    );
  });

  it("passes non-empty reason to requestApproval", async () => {
    const ctx = makeMockCtx();
    await proposalHandler({ brief: mockBrief }, ctx);

    const callArgs = mockRequestApproval.mock.calls[0][0];
    expect(callArgs.reason).toBeTruthy();
    expect(callArgs.reason.length).toBeGreaterThan(0);
  });

  // REQ-10: Output shape
  it("returns ProposalOutput with status 'needs-approval'", async () => {
    const ctx = makeMockCtx();
    const output = await proposalHandler({ brief: mockBrief }, ctx);

    expect(output.status).toBe("needs-approval");
  });

  it("returns non-empty proposalText", async () => {
    const ctx = makeMockCtx();
    const output = await proposalHandler({ brief: mockBrief }, ctx);

    expect(output.proposalText).toBe(mockProposalText);
    expect(output.proposalText.length).toBeGreaterThan(0);
  });

  it("returns briefFilePath ending in '01-intake/brief.md'", async () => {
    const ctx = makeMockCtx();
    const output = await proposalHandler({ brief: mockBrief }, ctx);

    expect(output.briefFilePath).toMatch(/01-intake\/brief\.md$/);
  });

  it("returns proposalFilePath ending in '03-diseno/proposal.md'", async () => {
    const ctx = makeMockCtx();
    const output = await proposalHandler({ brief: mockBrief }, ctx);

    expect(output.proposalFilePath).toMatch(/03-diseno\/proposal\.md$/);
  });

  it("returns correct clientSlug in output", async () => {
    const ctx = makeMockCtx();
    const output = await proposalHandler({ brief: mockBrief }, ctx);

    expect(output.clientSlug).toBe("acme-corp");
  });

  it("returns approvalId from requestApproval", async () => {
    const ctx = makeMockCtx();
    const output = await proposalHandler({ brief: mockBrief }, ctx);

    expect(output.approvalId).toBe("approval-uuid-123");
  });

  // REQ-11: 5 logStep calls in order
  it("calls ctx.logStep exactly 5 times in correct order", async () => {
    const ctx = makeMockCtx();
    await proposalHandler({ brief: mockBrief }, ctx);

    expect(ctx.logStep).toHaveBeenCalledTimes(5);
    const calls = vi.mocked(ctx.logStep).mock.calls;
    expect(calls[0][0].stepName).toBe("load-prompt");
    expect(calls[1][0].stepName).toBe("generate-proposal");
    expect(calls[2][0].stepName).toBe("write-brief");
    expect(calls[3][0].stepName).toBe("write-proposal");
    expect(calls[4][0].stepName).toBe("request-approval");
  });

  // REQ-09: requestApproval errors propagate
  it("propagates requestApproval errors — does not swallow them", async () => {
    const ctx = makeMockCtx();
    mockRequestApproval.mockRejectedValue(new Error("PersistenceError: DB down"));

    await expect(proposalHandler({ brief: mockBrief }, ctx)).rejects.toThrow(
      "PersistenceError: DB down",
    );
  });

  // REQ-06: special characters in company name
  it("handles accents and special chars in company name — produces valid slug in paths", async () => {
    const ctx = makeMockCtx();
    const briefWithAccents: DiscoveryBrief = {
      ...mockBrief,
      companyName: "Café & Cía S.A.",
    };
    await proposalHandler({ brief: briefWithAccents }, ctx);

    const writeCalls = mockWriteFile.mock.calls;
    const briefWriteCall = writeCalls.find((call) =>
      String(call[0]).includes("01-intake"),
    );
    expect(String(briefWriteCall![0])).toContain("clients/cafe-cia-sa/01-intake/brief.md");
  });
});
