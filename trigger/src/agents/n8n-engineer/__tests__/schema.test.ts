import { describe, it, expect } from "vitest";
import {
  N8nEngineerInputSchema,
  N8nWorkflowSchema,
  N8nEngineerOutputSchema,
} from "../schema.js";

// --- N8nEngineerInputSchema ---

describe("N8nEngineerInputSchema — Input Validation", () => {
  it("accepts valid input with all required fields", () => {
    const result = N8nEngineerInputSchema.safeParse({
      proposalText: "This is a valid proposal text with more than twenty characters.",
      clientSlug: "acme-corp",
      workflowDescription: "Email automation workflow",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing clientSlug — ZodError on clientSlug path", () => {
    const result = N8nEngineerInputSchema.safeParse({
      proposalText: "This is a valid proposal text with more than twenty characters.",
      workflowDescription: "Email automation workflow",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("clientSlug"))).toBe(true);
    }
  });

  it("rejects missing proposalText — ZodError on proposalText path", () => {
    const result = N8nEngineerInputSchema.safeParse({
      clientSlug: "acme-corp",
      workflowDescription: "Email automation workflow",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("proposalText"))).toBe(true);
    }
  });

  it("rejects missing workflowDescription — ZodError on workflowDescription path", () => {
    const result = N8nEngineerInputSchema.safeParse({
      proposalText: "This is a valid proposal text with more than twenty characters.",
      clientSlug: "acme-corp",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("workflowDescription"))).toBe(true);
    }
  });

  it("rejects proposalText shorter than 20 chars", () => {
    const result = N8nEngineerInputSchema.safeParse({
      proposalText: "Too short",
      clientSlug: "acme-corp",
      workflowDescription: "Email automation workflow",
    });
    expect(result.success).toBe(false);
  });

  it("rejects workflowDescription shorter than 10 chars", () => {
    const result = N8nEngineerInputSchema.safeParse({
      proposalText: "This is a valid proposal text with more than twenty characters.",
      clientSlug: "acme-corp",
      workflowDescription: "Short",
    });
    expect(result.success).toBe(false);
  });

  // clientSlug regex validation
  it("accepts valid clientSlug: 'acme-corp'", () => {
    const result = N8nEngineerInputSchema.safeParse({
      proposalText: "This is a valid proposal text with more than twenty characters.",
      clientSlug: "acme-corp",
      workflowDescription: "Email automation workflow",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid clientSlug with only lowercase letters: 'acmecorp'", () => {
    const result = N8nEngineerInputSchema.safeParse({
      proposalText: "This is a valid proposal text with more than twenty characters.",
      clientSlug: "acmecorp",
      workflowDescription: "Email automation workflow",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid clientSlug with numbers: 'client123'", () => {
    const result = N8nEngineerInputSchema.safeParse({
      proposalText: "This is a valid proposal text with more than twenty characters.",
      clientSlug: "client123",
      workflowDescription: "Email automation workflow",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid clientSlug with uppercase: 'ACME Corp'", () => {
    const result = N8nEngineerInputSchema.safeParse({
      proposalText: "This is a valid proposal text with more than twenty characters.",
      clientSlug: "ACME Corp",
      workflowDescription: "Email automation workflow",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid clientSlug with underscore: 'acme_corp'", () => {
    const result = N8nEngineerInputSchema.safeParse({
      proposalText: "This is a valid proposal text with more than twenty characters.",
      clientSlug: "acme_corp",
      workflowDescription: "Email automation workflow",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid clientSlug with spaces: 'acme corp'", () => {
    const result = N8nEngineerInputSchema.safeParse({
      proposalText: "This is a valid proposal text with more than twenty characters.",
      clientSlug: "acme corp",
      workflowDescription: "Email automation workflow",
    });
    expect(result.success).toBe(false);
  });
});

// --- N8nWorkflowSchema ---

const minimalNode = {
  id: "node-1",
  name: "Start",
  type: "n8n-nodes-base.start",
  typeVersion: 1,
  position: [100, 200] as [number, number],
  parameters: {},
};

const minimalWorkflow = {
  name: "Test Workflow",
  nodes: [minimalNode],
  connections: {},
};

describe("N8nWorkflowSchema — Workflow Validation", () => {
  it("validates minimal workflow with 1 node", () => {
    const result = N8nWorkflowSchema.safeParse(minimalWorkflow);
    expect(result.success).toBe(true);
  });

  it("validates workflow with settings", () => {
    const result = N8nWorkflowSchema.safeParse({
      ...minimalWorkflow,
      settings: { executionOrder: "v1" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty nodes array", () => {
    const result = N8nWorkflowSchema.safeParse({
      ...minimalWorkflow,
      nodes: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing name", () => {
    const result = N8nWorkflowSchema.safeParse({
      nodes: [minimalNode],
      connections: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing connections", () => {
    const result = N8nWorkflowSchema.safeParse({
      name: "Test",
      nodes: [minimalNode],
    });
    expect(result.success).toBe(false);
  });

  it("rejects node with missing required fields (id, name, type)", () => {
    const result = N8nWorkflowSchema.safeParse({
      name: "Test Workflow",
      nodes: [{ position: [100, 200], parameters: {} }],
      connections: {},
    });
    expect(result.success).toBe(false);
  });
});

// --- N8nEngineerOutputSchema ---

describe("N8nEngineerOutputSchema — Output Contract", () => {
  it("validates complete output with needs-approval status", () => {
    const result = N8nEngineerOutputSchema.safeParse({
      workflowId: "email-automation",
      workflowName: "Email Automation",
      workflowFilePath: "clients/acme-corp/03-diseno/workflow.json",
      status: "needs-approval",
      approvalId: "approval-uuid-123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects output with wrong status", () => {
    const result = N8nEngineerOutputSchema.safeParse({
      workflowId: "email-automation",
      workflowName: "Email Automation",
      workflowFilePath: "clients/acme-corp/03-diseno/workflow.json",
      status: "approved",
      approvalId: "approval-uuid-123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects output missing workflowName", () => {
    const result = N8nEngineerOutputSchema.safeParse({
      workflowId: "email-automation",
      workflowFilePath: "clients/acme-corp/03-diseno/workflow.json",
      status: "needs-approval",
      approvalId: "approval-uuid-123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects output missing workflowId", () => {
    const result = N8nEngineerOutputSchema.safeParse({
      workflowName: "Email Automation",
      workflowFilePath: "clients/acme-corp/03-diseno/workflow.json",
      status: "needs-approval",
      approvalId: "approval-uuid-123",
    });
    expect(result.success).toBe(false);
  });
});
