import { describe, it, expect } from "vitest";
import { DiscoveryBriefSchema, DiscoveryInputSchema } from "../schema";

// --- DiscoveryBriefSchema ---

describe("DiscoveryBriefSchema", () => {
  it("valid full brief passes", () => {
    const result = DiscoveryBriefSchema.safeParse({
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
      urgency: "high",
      nextStepRecommendation: "Schedule F1 diagnostic session",
      completenessScore: 85,
      extractionNotes: ["Budget not mentioned in source text"],
    });

    expect(result.success).toBe(true);
  });

  it("brief with only companyName passes (all other fields optional or default)", () => {
    const result = DiscoveryBriefSchema.safeParse({
      companyName: "Acme Corp",
      completenessScore: 10,
    });

    expect(result.success).toBe(true);
  });

  it("missing companyName fails", () => {
    const result = DiscoveryBriefSchema.safeParse({
      completenessScore: 50,
    });

    expect(result.success).toBe(false);
  });

  it("empty companyName fails", () => {
    const result = DiscoveryBriefSchema.safeParse({
      companyName: "",
      completenessScore: 50,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("companyName");
    }
  });

  it("urgency with invalid enum value fails", () => {
    const result = DiscoveryBriefSchema.safeParse({
      companyName: "Acme",
      completenessScore: 50,
      urgency: "critical",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("urgency");
    }
  });

  it("completenessScore < 0 fails", () => {
    const result = DiscoveryBriefSchema.safeParse({
      companyName: "Acme",
      completenessScore: -1,
    });

    expect(result.success).toBe(false);
  });

  it("completenessScore > 100 fails", () => {
    const result = DiscoveryBriefSchema.safeParse({
      companyName: "Acme",
      completenessScore: 101,
    });

    expect(result.success).toBe(false);
  });

  it("array fields default to [] when omitted", () => {
    const result = DiscoveryBriefSchema.safeParse({
      companyName: "Acme",
      completenessScore: 50,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currentStack).toEqual([]);
      expect(result.data.processSteps).toEqual([]);
      expect(result.data.painPoints).toEqual([]);
      expect(result.data.kpiCandidates).toEqual([]);
      expect(result.data.untouchableSystems).toEqual([]);
      expect(result.data.complianceRequirements).toEqual([]);
      expect(result.data.systemsInvolved).toEqual([]);
      expect(result.data.extractionNotes).toEqual([]);
    }
  });

  it("urgency defaults to 'medium' when omitted", () => {
    const result = DiscoveryBriefSchema.safeParse({
      companyName: "Acme",
      completenessScore: 50,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.urgency).toBe("medium");
    }
  });
});

// --- DiscoveryInputSchema ---

describe("DiscoveryInputSchema", () => {
  const longText = "a".repeat(50);

  it("accepts rawText ≥ 50 chars", () => {
    const result = DiscoveryInputSchema.safeParse({ rawText: longText });
    expect(result.success).toBe(true);
  });

  it("rejects rawText < 50 chars", () => {
    const result = DiscoveryInputSchema.safeParse({ rawText: "too short" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("rawText");
    }
  });

  it("rejects empty rawText", () => {
    const result = DiscoveryInputSchema.safeParse({ rawText: "" });
    expect(result.success).toBe(false);
  });

  it("accepts rawText + clientNameHint", () => {
    const result = DiscoveryInputSchema.safeParse({
      rawText: longText,
      clientNameHint: "Acme Corp",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clientNameHint).toBe("Acme Corp");
    }
  });

  it("accepts rawText + sourceType: 'email'", () => {
    const result = DiscoveryInputSchema.safeParse({
      rawText: longText,
      sourceType: "email",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sourceType).toBe("email");
    }
  });

  it("rejects unknown sourceType", () => {
    const result = DiscoveryInputSchema.safeParse({
      rawText: longText,
      sourceType: "unknown_type",
    });
    expect(result.success).toBe(false);
  });
});
