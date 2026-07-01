import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import {
  ClientDeliveryInputSchema,
  ClientDeliveryOutputSchema,
} from "../schema.js";

// --- ClientDeliveryInputSchema ---

describe("ClientDeliveryInputSchema — Input Validation", () => {
  const validInput = {
    proposalText: "This is a valid approved proposal with enough characters.",
    clientSlug: "acme-corp",
    deliverables: ["Email automation workflow", "Dashboard reporting"],
    qaResults: "All checks passed successfully.",
  };

  // Scenario: Valid input passes
  it("accepts valid input with all required fields", () => {
    expect(() => ClientDeliveryInputSchema.parse(validInput)).not.toThrow();
    const result = ClientDeliveryInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  // Scenario: Short proposalText
  it("throws ZodError for proposalText shorter than 20 characters", () => {
    expect(() =>
      ClientDeliveryInputSchema.parse({ ...validInput, proposalText: "Too short" }),
    ).toThrow(ZodError);
  });

  it("throws ZodError identifying proposalText field on min-length violation", () => {
    const result = ClientDeliveryInputSchema.safeParse({
      ...validInput,
      proposalText: "Short",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("proposalText"))).toBe(true);
    }
  });

  // Scenario: Invalid clientSlug format
  it("throws ZodError for clientSlug with uppercase and spaces ('Acme Corp')", () => {
    expect(() =>
      ClientDeliveryInputSchema.parse({ ...validInput, clientSlug: "Acme Corp" }),
    ).toThrow(ZodError);
  });

  it("throws ZodError for clientSlug with underscores", () => {
    const result = ClientDeliveryInputSchema.safeParse({
      ...validInput,
      clientSlug: "acme_corp",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid clientSlug with hyphens and numbers", () => {
    expect(() =>
      ClientDeliveryInputSchema.parse({ ...validInput, clientSlug: "client123-test" }),
    ).not.toThrow();
  });

  // Scenario: Empty deliverables array
  it("throws ZodError for empty deliverables array", () => {
    expect(() =>
      ClientDeliveryInputSchema.parse({ ...validInput, deliverables: [] }),
    ).toThrow(ZodError);
  });

  it("throws ZodError identifying deliverables field on empty array", () => {
    const result = ClientDeliveryInputSchema.safeParse({
      ...validInput,
      deliverables: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("deliverables"))).toBe(true);
    }
  });

  it("throws ZodError for deliverables array containing an empty string", () => {
    expect(() =>
      ClientDeliveryInputSchema.parse({ ...validInput, deliverables: ["valid item", ""] }),
    ).toThrow(ZodError);
  });

  // Scenario: Short qaResults
  it("throws ZodError for qaResults shorter than 10 characters", () => {
    expect(() =>
      ClientDeliveryInputSchema.parse({ ...validInput, qaResults: "Short" }),
    ).toThrow(ZodError);
  });

  it("throws ZodError identifying qaResults field on min-length violation", () => {
    const result = ClientDeliveryInputSchema.safeParse({
      ...validInput,
      qaResults: "Tiny",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("qaResults"))).toBe(true);
    }
  });

  it("rejects input with missing required fields", () => {
    const result = ClientDeliveryInputSchema.safeParse({
      proposalText: "This is a valid approved proposal with enough characters.",
    });
    expect(result.success).toBe(false);
  });
});

// --- ClientDeliveryOutputSchema ---

describe("ClientDeliveryOutputSchema — Output Contract", () => {
  const validOutput = {
    runbookPath: "clients/acme-corp/05-golive/runbook.md",
    handoffPath: "clients/acme-corp/05-golive/handoff.md",
    demoScriptPath: "clients/acme-corp/05-golive/demo-script.md",
    status: "needs-approval" as const,
    approvalId: "approval-uuid-123",
  };

  it("validates complete output with all 5 fields", () => {
    expect(() => ClientDeliveryOutputSchema.parse(validOutput)).not.toThrow();
  });

  it("rejects output with wrong status value", () => {
    const result = ClientDeliveryOutputSchema.safeParse({
      ...validOutput,
      status: "approved",
    });
    expect(result.success).toBe(false);
  });

  it("rejects output missing runbookPath", () => {
    const { runbookPath: _r, ...withoutRunbook } = validOutput;
    const result = ClientDeliveryOutputSchema.safeParse(withoutRunbook);
    expect(result.success).toBe(false);
  });

  it("rejects output missing handoffPath", () => {
    const { handoffPath: _h, ...withoutHandoff } = validOutput;
    const result = ClientDeliveryOutputSchema.safeParse(withoutHandoff);
    expect(result.success).toBe(false);
  });

  it("rejects output missing demoScriptPath", () => {
    const { demoScriptPath: _d, ...withoutDemo } = validOutput;
    const result = ClientDeliveryOutputSchema.safeParse(withoutDemo);
    expect(result.success).toBe(false);
  });

  it("rejects output missing approvalId", () => {
    const { approvalId: _a, ...withoutApproval } = validOutput;
    const result = ClientDeliveryOutputSchema.safeParse(withoutApproval);
    expect(result.success).toBe(false);
  });

  it("rejects output missing status", () => {
    const { status: _s, ...withoutStatus } = validOutput;
    const result = ClientDeliveryOutputSchema.safeParse(withoutStatus);
    expect(result.success).toBe(false);
  });
});
