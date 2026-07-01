import { describe, it, expect } from "vitest";
import {
  TriggerEngineerInputSchema,
  TriggerEngineerOutputSchema,
} from "../schema.js";

// --- TriggerEngineerInputSchema ---

describe("TriggerEngineerInputSchema — Input Validation", () => {
  it("accepts valid input with all required fields", () => {
    const result = TriggerEngineerInputSchema.safeParse({
      proposalText: "This is a valid proposal text with more than twenty characters.",
      clientSlug: "acme-corp",
      taskDescription: "Email notification task for users",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing clientSlug — ZodError on clientSlug path", () => {
    const result = TriggerEngineerInputSchema.safeParse({
      proposalText: "This is a valid proposal text with more than twenty characters.",
      taskDescription: "Email notification task for users",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("clientSlug"))).toBe(true);
    }
  });

  it("rejects missing proposalText — ZodError on proposalText path", () => {
    const result = TriggerEngineerInputSchema.safeParse({
      clientSlug: "acme-corp",
      taskDescription: "Email notification task for users",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("proposalText"))).toBe(true);
    }
  });

  it("rejects missing taskDescription — ZodError on taskDescription path", () => {
    const result = TriggerEngineerInputSchema.safeParse({
      proposalText: "This is a valid proposal text with more than twenty characters.",
      clientSlug: "acme-corp",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("taskDescription"))).toBe(true);
    }
  });

  it("rejects proposalText shorter than 20 chars", () => {
    const result = TriggerEngineerInputSchema.safeParse({
      proposalText: "Too short",
      clientSlug: "acme-corp",
      taskDescription: "Email notification task for users",
    });
    expect(result.success).toBe(false);
  });

  it("rejects taskDescription shorter than 10 chars", () => {
    const result = TriggerEngineerInputSchema.safeParse({
      proposalText: "This is a valid proposal text with more than twenty characters.",
      clientSlug: "acme-corp",
      taskDescription: "Short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects taskDescription longer than 200 chars", () => {
    const result = TriggerEngineerInputSchema.safeParse({
      proposalText: "This is a valid proposal text with more than twenty characters.",
      clientSlug: "acme-corp",
      taskDescription: "A".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("accepts taskDescription at exactly 200 chars (max boundary)", () => {
    const result = TriggerEngineerInputSchema.safeParse({
      proposalText: "This is a valid proposal text with more than twenty characters.",
      clientSlug: "acme-corp",
      taskDescription: "A".repeat(200),
    });
    expect(result.success).toBe(true);
  });

  it("accepts taskDescription at exactly 10 chars (min boundary)", () => {
    const result = TriggerEngineerInputSchema.safeParse({
      proposalText: "This is a valid proposal text with more than twenty characters.",
      clientSlug: "acme-corp",
      taskDescription: "A".repeat(10),
    });
    expect(result.success).toBe(true);
  });

  // clientSlug regex validation
  it("accepts valid clientSlug: 'acme-corp'", () => {
    const result = TriggerEngineerInputSchema.safeParse({
      proposalText: "This is a valid proposal text with more than twenty characters.",
      clientSlug: "acme-corp",
      taskDescription: "Email notification task for users",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid clientSlug with only lowercase letters: 'acmecorp'", () => {
    const result = TriggerEngineerInputSchema.safeParse({
      proposalText: "This is a valid proposal text with more than twenty characters.",
      clientSlug: "acmecorp",
      taskDescription: "Email notification task for users",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid clientSlug with numbers: 'client123'", () => {
    const result = TriggerEngineerInputSchema.safeParse({
      proposalText: "This is a valid proposal text with more than twenty characters.",
      clientSlug: "client123",
      taskDescription: "Email notification task for users",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid clientSlug with uppercase: 'ACME Corp'", () => {
    const result = TriggerEngineerInputSchema.safeParse({
      proposalText: "This is a valid proposal text with more than twenty characters.",
      clientSlug: "ACME Corp",
      taskDescription: "Email notification task for users",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid clientSlug with underscore: 'acme_corp'", () => {
    const result = TriggerEngineerInputSchema.safeParse({
      proposalText: "This is a valid proposal text with more than twenty characters.",
      clientSlug: "acme_corp",
      taskDescription: "Email notification task for users",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid clientSlug with spaces: 'acme corp'", () => {
    const result = TriggerEngineerInputSchema.safeParse({
      proposalText: "This is a valid proposal text with more than twenty characters.",
      clientSlug: "acme corp",
      taskDescription: "Email notification task for users",
    });
    expect(result.success).toBe(false);
  });
});

// --- TriggerEngineerOutputSchema ---

describe("TriggerEngineerOutputSchema — Output Contract", () => {
  it("validates complete output with needs-approval status", () => {
    const result = TriggerEngineerOutputSchema.safeParse({
      taskId: "email-notification-task",
      taskName: "Email Notification Task",
      taskFilePath: "clients/acme-corp/03-diseno/trigger-task.ts",
      status: "needs-approval",
      approvalId: "approval-uuid-123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects output with wrong status", () => {
    const result = TriggerEngineerOutputSchema.safeParse({
      taskId: "email-notification-task",
      taskName: "Email Notification Task",
      taskFilePath: "clients/acme-corp/03-diseno/trigger-task.ts",
      status: "approved",
      approvalId: "approval-uuid-123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects output missing taskName", () => {
    const result = TriggerEngineerOutputSchema.safeParse({
      taskId: "email-notification-task",
      taskFilePath: "clients/acme-corp/03-diseno/trigger-task.ts",
      status: "needs-approval",
      approvalId: "approval-uuid-123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects output missing taskId", () => {
    const result = TriggerEngineerOutputSchema.safeParse({
      taskName: "Email Notification Task",
      taskFilePath: "clients/acme-corp/03-diseno/trigger-task.ts",
      status: "needs-approval",
      approvalId: "approval-uuid-123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects output missing taskFilePath", () => {
    const result = TriggerEngineerOutputSchema.safeParse({
      taskId: "email-notification-task",
      taskName: "Email Notification Task",
      status: "needs-approval",
      approvalId: "approval-uuid-123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects output missing approvalId", () => {
    const result = TriggerEngineerOutputSchema.safeParse({
      taskId: "email-notification-task",
      taskName: "Email Notification Task",
      taskFilePath: "clients/acme-corp/03-diseno/trigger-task.ts",
      status: "needs-approval",
    });
    expect(result.success).toBe(false);
  });
});
