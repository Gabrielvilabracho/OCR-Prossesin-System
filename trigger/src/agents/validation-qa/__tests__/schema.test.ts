import { describe, it, expect } from "vitest";
import {
  ChecklistItemSchema,
  ChecklistResultSchema,
  ValidationQaInputSchema,
  ValidationQaOutputSchema,
} from "../schema.js";

// --- ChecklistItemSchema ---

describe("ChecklistItemSchema", () => {
  it("parses a valid checklist item", () => {
    const result = ChecklistItemSchema.safeParse({
      category: "security",
      passed: true,
      notes: "No hardcoded secrets found.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid category", () => {
    const result = ChecklistItemSchema.safeParse({
      category: "performance",
      passed: true,
      notes: "Looks good.",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid categories", () => {
    const categories = ["completeness", "security", "error-handling", "kpi-alignment"] as const;
    for (const category of categories) {
      const result = ChecklistItemSchema.safeParse({
        category,
        passed: false,
        notes: "Some issue found.",
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects missing notes field", () => {
    const result = ChecklistItemSchema.safeParse({
      category: "security",
      passed: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing passed field", () => {
    const result = ChecklistItemSchema.safeParse({
      category: "security",
      notes: "All clear.",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty notes string", () => {
    const result = ChecklistItemSchema.safeParse({
      category: "security",
      passed: true,
      notes: "",
    });
    expect(result.success).toBe(false);
  });
});

// --- ChecklistResultSchema ---

describe("ChecklistResultSchema", () => {
  const validItems = [
    { category: "completeness", passed: true, notes: "All deliverables present." },
    { category: "security", passed: true, notes: "No secrets exposed." },
    { category: "error-handling", passed: true, notes: "Rollback plan documented." },
    { category: "kpi-alignment", passed: true, notes: "KPIs are measurable." },
  ];

  it("parses a valid checklist result with 4 items", () => {
    const result = ChecklistResultSchema.safeParse({
      items: validItems,
      summary: "All checks passed.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects fewer than 4 items", () => {
    const result = ChecklistResultSchema.safeParse({
      items: validItems.slice(0, 3),
      summary: "Incomplete.",
    });
    expect(result.success).toBe(false);
  });

  it("accepts more than 4 items", () => {
    const result = ChecklistResultSchema.safeParse({
      items: [
        ...validItems,
        { category: "completeness", passed: true, notes: "Extra check." },
      ],
      summary: "All passed.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing summary", () => {
    const result = ChecklistResultSchema.safeParse({
      items: validItems,
    });
    expect(result.success).toBe(false);
  });
});

// --- ValidationQaInputSchema ---

describe("ValidationQaInputSchema", () => {
  const validInput = {
    implementationSummary: "This is a detailed implementation summary with more than twenty characters.",
    clientSlug: "acme-corp",
    deliverables: ["workflow.json", "runbook.md"],
  };

  it("parses valid input", () => {
    const result = ValidationQaInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects implementationSummary shorter than 20 chars", () => {
    const result = ValidationQaInputSchema.safeParse({
      ...validInput,
      implementationSummary: "Too short",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("implementationSummary"))).toBe(true);
    }
  });

  it("accepts implementationSummary of exactly 20 chars", () => {
    const result = ValidationQaInputSchema.safeParse({
      ...validInput,
      implementationSummary: "12345678901234567890",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid clientSlug with uppercase", () => {
    const result = ValidationQaInputSchema.safeParse({
      ...validInput,
      clientSlug: "Acme Corp",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("clientSlug"))).toBe(true);
    }
  });

  it("rejects clientSlug with spaces", () => {
    const result = ValidationQaInputSchema.safeParse({
      ...validInput,
      clientSlug: "acme corp",
    });
    expect(result.success).toBe(false);
  });

  it("rejects clientSlug with underscore", () => {
    const result = ValidationQaInputSchema.safeParse({
      ...validInput,
      clientSlug: "acme_corp",
    });
    expect(result.success).toBe(false);
  });

  it("accepts clientSlug with numbers and hyphens", () => {
    const result = ValidationQaInputSchema.safeParse({
      ...validInput,
      clientSlug: "client-123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty deliverables array", () => {
    const result = ValidationQaInputSchema.safeParse({
      ...validInput,
      deliverables: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("deliverables"))).toBe(true);
    }
  });

  it("rejects deliverables with empty string elements", () => {
    const result = ValidationQaInputSchema.safeParse({
      ...validInput,
      deliverables: [""],
    });
    expect(result.success).toBe(false);
  });

  it("accepts deliverables with a single item", () => {
    const result = ValidationQaInputSchema.safeParse({
      ...validInput,
      deliverables: ["workflow.json"],
    });
    expect(result.success).toBe(true);
  });
});

// --- ValidationQaOutputSchema ---

describe("ValidationQaOutputSchema", () => {
  const validItems = [
    { category: "completeness", passed: true, notes: "All deliverables present." },
    { category: "security", passed: true, notes: "No secrets exposed." },
    { category: "error-handling", passed: true, notes: "Rollback plan documented." },
    { category: "kpi-alignment", passed: true, notes: "KPIs are measurable." },
  ];

  it("validates output with 'go' recommendation and no approvalId", () => {
    const result = ValidationQaOutputSchema.safeParse({
      passed: true,
      checklistResults: validItems,
      issues: [],
      recommendation: "go",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.approvalId).toBeUndefined();
    }
  });

  it("validates output with 'no-go' recommendation and approvalId", () => {
    const result = ValidationQaOutputSchema.safeParse({
      passed: false,
      checklistResults: [
        ...validItems.slice(0, 1),
        { category: "security", passed: false, notes: "Hardcoded secret found." },
        ...validItems.slice(2),
      ],
      issues: ["Hardcoded secret found."],
      recommendation: "no-go",
      approvalId: "approval-uuid-456",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.approvalId).toBe("approval-uuid-456");
      expect(result.data.passed).toBe(false);
    }
  });

  it("validates output with 'needs-review' recommendation and approvalId", () => {
    const result = ValidationQaOutputSchema.safeParse({
      passed: false,
      checklistResults: validItems,
      issues: ["Some deliverable missing."],
      recommendation: "needs-review",
      approvalId: "approval-uuid-789",
    });
    expect(result.success).toBe(true);
  });

  it("validates passed=false with 'no-go' recommendation", () => {
    const result = ValidationQaOutputSchema.safeParse({
      passed: false,
      checklistResults: validItems,
      issues: ["Security issue found."],
      recommendation: "no-go",
      approvalId: "approval-uuid-111",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.passed).toBe(false);
    }
  });

  it("rejects invalid recommendation value", () => {
    const result = ValidationQaOutputSchema.safeParse({
      passed: true,
      checklistResults: validItems,
      issues: [],
      recommendation: "approved",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing required fields", () => {
    const result = ValidationQaOutputSchema.safeParse({
      passed: true,
      recommendation: "go",
    });
    expect(result.success).toBe(false);
  });
});
