import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock lib/llm BEFORE importing handler
vi.mock("../../../lib/llm", () => ({
  llmGenerateObject: vi.fn(),
}));

// Mock lib/prompts BEFORE importing handler
vi.mock("../../../lib/prompts", () => ({
  loadPrompt: vi.fn(),
  PromptNotFoundError: class PromptNotFoundError extends Error {
    constructor(agentName: string) {
      super(`Prompt file not found for agent: "${agentName}"`);
      this.name = "PromptNotFoundError";
    }
  },
}));

import { llmGenerateObject } from "../../../lib/llm";
import { loadPrompt, PromptNotFoundError } from "../../../lib/prompts";
import {
  generateClientSlug,
  formatBriefAsMarkdown,
  discoveryHandler,
} from "../handler";
import type { DiscoveryBrief } from "../schema";
import type { AgentContext } from "../../../lib/agent-types";
import { AgentConfigSchema } from "../../../lib/agent-types";

const mockLlmGenerateObject = vi.mocked(llmGenerateObject);
const mockLoadPrompt = vi.mocked(loadPrompt);

// --- Test fixtures ---

const mockBrief: DiscoveryBrief = {
  companyName: "Acme Corp",
  industry: "SaaS",
  teamSize: "50",
  currentStack: ["Salesforce", "Slack", "Google Sheets"],
  businessObjective: "Automate lead qualification",
  currentProcess: "Manual review of inbound leads",
  processSteps: ["Receive lead", "Check CRM", "Score manually", "Assign to rep"],
  frequency: "daily",
  volume: "200 leads/day",
  painPoints: ["Takes 2 hours daily", "Inconsistent scoring", "Leads fall through cracks"],
  manualHoursPerWeek: 10,
  errorRate: "15%",
  costImpact: "$5,000/month in missed leads",
  expectedOutcome: "Automated lead scoring with consistent criteria",
  kpiCandidates: ["Lead response time < 5 min", "Scoring accuracy > 90%"],
  deadline: "2026-06-01",
  budget: undefined,
  untouchableSystems: ["Legacy billing system"],
  complianceRequirements: [],
  systemsInvolved: [
    { name: "Salesforce", type: "API", hasCredentials: true },
    { name: "Google Sheets", type: "UI", hasCredentials: false },
  ],
  urgency: "high",
  nextStepRecommendation: "Schedule F1 diagnostic session with sales team lead",
  completenessScore: 85,
  extractionNotes: ["Budget not mentioned in source text"],
};

const mockTokenUsage = {
  promptTokens: 500,
  completionTokens: 200,
  totalTokens: 700,
};

const mockConfig = AgentConfigSchema.parse({
  id: "discovery-agent",
  name: "Discovery Agent",
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

// --- generateClientSlug ---

describe("generateClientSlug", () => {
  it('"Acme Corp" → "acme-corp"', () => {
    expect(generateClientSlug("Acme Corp")).toBe("acme-corp");
  });

  it('"Café Único" → "cafe-unico"', () => {
    expect(generateClientSlug("Café Único")).toBe("cafe-unico");
  });

  it('"O\'Brien & Co." → "obrien-co"', () => {
    expect(generateClientSlug("O'Brien & Co.")).toBe("obrien-co");
  });

  it('"  Some  Company  " → "some-company"', () => {
    expect(generateClientSlug("  Some  Company  ")).toBe("some-company");
  });

  it('"my--company---name" → "my-company-name"', () => {
    expect(generateClientSlug("my--company---name")).toBe("my-company-name");
  });

  it('"Shopify" → "shopify"', () => {
    expect(generateClientSlug("Shopify")).toBe("shopify");
  });

  it('"!!!" → "" (empty string — all chars stripped)', () => {
    expect(generateClientSlug("!!!")).toBe("");
  });

  it('"日本語 Test" → "test" (non-latin stripped)', () => {
    expect(generateClientSlug("日本語 Test")).toBe("test");
  });
});

// --- formatBriefAsMarkdown ---

describe("formatBriefAsMarkdown", () => {
  it("full brief renders all major sections", () => {
    const md = formatBriefAsMarkdown(mockBrief);

    expect(md).toContain("## Empresa y Contexto");
    expect(md).toContain("## Objetivo de Negocio");
    expect(md).toContain("## Proceso a Automatizar");
    expect(md).toContain("## Dolor Actual");
    expect(md).toContain("## Resultado Esperado");
    expect(md).toContain("## Restricciones");
    expect(md).toContain("## Próximo Paso");
    expect(md).toContain("Acme Corp");
    expect(md).toContain("85%");
  });

  it("minimal brief (companyName only) renders only Empresa y Contexto and Próximo Paso", () => {
    const minimalBrief: DiscoveryBrief = {
      companyName: "MinCo",
      currentStack: [],
      processSteps: [],
      painPoints: [],
      kpiCandidates: [],
      untouchableSystems: [],
      complianceRequirements: [],
      systemsInvolved: [],
      urgency: "medium",
      completenessScore: 5,
      extractionNotes: [],
    };

    const md = formatBriefAsMarkdown(minimalBrief);

    expect(md).toContain("## Empresa y Contexto");
    expect(md).toContain("## Próximo Paso");
    expect(md).not.toContain("## Objetivo de Negocio");
    expect(md).not.toContain("## Proceso a Automatizar");
    expect(md).not.toContain("## Dolor Actual");
    expect(md).not.toContain("## Resultado Esperado");
    expect(md).not.toContain("## Restricciones");
  });

  it("sections with no data are absent from output", () => {
    const partialBrief: DiscoveryBrief = {
      companyName: "PartialCo",
      currentStack: [],
      businessObjective: "Grow revenue",
      processSteps: [],
      painPoints: [],
      kpiCandidates: [],
      untouchableSystems: [],
      complianceRequirements: [],
      systemsInvolved: [],
      urgency: "low",
      completenessScore: 20,
      extractionNotes: [],
    };

    const md = formatBriefAsMarkdown(partialBrief);

    expect(md).toContain("## Objetivo de Negocio");
    expect(md).not.toContain("## Proceso a Automatizar");
    expect(md).not.toContain("## Dolor Actual");
    expect(md).not.toContain("## Restricciones");
  });
});

// --- discoveryHandler ---

describe("discoveryHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadPrompt.mockResolvedValue("You are an extraction agent. {{rawText}} processed.");
    mockLlmGenerateObject.mockResolvedValue({
      object: mockBrief,
      tokenUsage: mockTokenUsage,
      finishReason: "stop",
    });
  });

  it("successful extraction → returns { brief, clientSlug } matching expected shape", async () => {
    const ctx = makeMockCtx();
    const input = {
      rawText: "a".repeat(100),
      clientNameHint: "Acme Corp",
      sourceType: "meeting_notes" as const,
    };

    const result = await discoveryHandler(input, ctx);

    expect(result.brief).toEqual(mockBrief);
    expect(result.clientSlug).toBe("acme-corp");
  });

  it("ctx.logStep is called exactly twice (load-prompt, extract-brief)", async () => {
    const ctx = makeMockCtx();
    const input = { rawText: "a".repeat(100) };

    await discoveryHandler(input, ctx);

    expect(ctx.logStep).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(ctx.logStep).mock.calls;
    expect(calls[0][0].stepName).toBe("load-prompt");
    expect(calls[1][0].stepName).toBe("extract-brief");
  });

  it("token usage from LLM result is forwarded to logStep for extract-brief", async () => {
    const ctx = makeMockCtx();
    const input = { rawText: "a".repeat(100) };

    await discoveryHandler(input, ctx);

    const extractBriefCall = vi.mocked(ctx.logStep).mock.calls[1][0];
    expect(extractBriefCall.tokenUsage).toEqual(mockTokenUsage);
  });

  it("loadPrompt is called with 'discovery' and correct vars", async () => {
    const ctx = makeMockCtx();
    const input = {
      rawText: "a".repeat(100),
      clientNameHint: "Acme",
      sourceType: "email" as const,
    };

    await discoveryHandler(input, ctx);

    expect(mockLoadPrompt).toHaveBeenCalledOnce();
    expect(mockLoadPrompt).toHaveBeenCalledWith(
      "discovery",
      expect.objectContaining({
        rawText: input.rawText,
        clientNameHint: "Acme",
        sourceType: "email",
      }),
    );
  });

  it("llmGenerateObject is called with correct schema and model config", async () => {
    const ctx = makeMockCtx();
    const input = { rawText: "a".repeat(100) };

    await discoveryHandler(input, ctx);

    expect(mockLlmGenerateObject).toHaveBeenCalledOnce();
    const callArgs = mockLlmGenerateObject.mock.calls[0][0];
    expect(callArgs.schema).toBeDefined();
    expect(callArgs.model.provider).toBe("anthropic");
    expect(callArgs.model.model).toBe("claude-sonnet-4-20250514");
    expect(callArgs.model.temperature).toBe(0);
  });

  it("loadPrompt throws PromptNotFoundError → error propagates, not swallowed", async () => {
    mockLoadPrompt.mockRejectedValue(new PromptNotFoundError("discovery"));
    const ctx = makeMockCtx();
    const input = { rawText: "a".repeat(100) };

    await expect(discoveryHandler(input, ctx)).rejects.toThrow("discovery");
    expect(mockLlmGenerateObject).not.toHaveBeenCalled();
  });

  it("llmGenerateObject throws → error propagates", async () => {
    mockLlmGenerateObject.mockRejectedValue(new Error("LLM API error"));
    const ctx = makeMockCtx();
    const input = { rawText: "a".repeat(100) };

    await expect(discoveryHandler(input, ctx)).rejects.toThrow("LLM API error");
  });

  it("clientNameHint defaults to 'not provided' when not passed", async () => {
    const ctx = makeMockCtx();
    const input = { rawText: "a".repeat(100) }; // no clientNameHint

    await discoveryHandler(input, ctx);

    expect(mockLoadPrompt).toHaveBeenCalledWith(
      "discovery",
      expect.objectContaining({
        clientNameHint: "not provided",
      }),
    );
  });

  it("sourceType defaults to 'unknown' when not passed", async () => {
    const ctx = makeMockCtx();
    const input = { rawText: "a".repeat(100) }; // no sourceType

    await discoveryHandler(input, ctx);

    expect(mockLoadPrompt).toHaveBeenCalledWith(
      "discovery",
      expect.objectContaining({
        sourceType: "unknown",
      }),
    );
  });
});
