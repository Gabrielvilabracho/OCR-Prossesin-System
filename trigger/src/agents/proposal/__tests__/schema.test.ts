import { describe, it, expect } from "vitest";
import { ProposalInputSchema } from "../schema";

// Minimal valid DiscoveryBrief (all optional/defaulted fields omitted)
const minimalBrief = {
  companyName: "Acme Corp",
  completenessScore: 75,
};

// Full valid DiscoveryBrief
const fullBrief = {
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
  budget: "$10,000",
  untouchableSystems: ["Legacy billing system"],
  complianceRequirements: ["GDPR"],
  systemsInvolved: [{ name: "Salesforce", type: "API", hasCredentials: true }],
  urgency: "high" as const,
  nextStepRecommendation: "Schedule F1 diagnostic session",
  completenessScore: 85,
  extractionNotes: ["Budget not mentioned in source text"],
};

// REQ-01: Valid input accepted
describe("ProposalInputSchema — REQ-01", () => {
  it("accepts full brief with additionalContext", () => {
    const result = ProposalInputSchema.safeParse({
      brief: fullBrief,
      additionalContext: "Client prefers n8n",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.additionalContext).toBe("Client prefers n8n");
    }
  });

  it("accepts minimal valid brief without additionalContext → additionalContext is undefined", () => {
    const result = ProposalInputSchema.safeParse({ brief: minimalBrief });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.additionalContext).toBeUndefined();
    }
  });

  it("accepts brief with additionalContext as empty string", () => {
    const result = ProposalInputSchema.safeParse({
      brief: minimalBrief,
      additionalContext: "",
    });
    expect(result.success).toBe(true);
  });
});

// REQ-02: companyName guard
describe("ProposalInputSchema — REQ-02", () => {
  it("rejects brief with empty companyName — ZodError", () => {
    const result = ProposalInputSchema.safeParse({
      brief: { ...minimalBrief, companyName: "" },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("companyName"))).toBe(true);
    }
  });

  it("rejects payload missing brief entirely", () => {
    const result = ProposalInputSchema.safeParse({ additionalContext: "some context" });
    expect(result.success).toBe(false);
  });
});
