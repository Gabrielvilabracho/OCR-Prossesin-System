import { z } from "zod";

// --- Input ---

export const N8nEngineerInputSchema = z.object({
  proposalText: z
    .string()
    .min(20)
    .describe("Approved proposal text — minimum 20 characters"),
  clientSlug: z
    .string()
    .regex(/^[a-z0-9-]+$/, "clientSlug must contain only lowercase letters, numbers, and hyphens")
    .describe("Client identifier — lowercase letters, numbers, hyphens only"),
  workflowDescription: z
    .string()
    .min(10)
    .describe("Description of the workflow to generate — minimum 10 characters"),
});

export type N8nEngineerInput = z.infer<typeof N8nEngineerInputSchema>;

// --- N8n Workflow Node ---

export const N8nNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string().describe("e.g. 'n8n-nodes-base.httpRequest'"),
  typeVersion: z.number(),
  position: z.tuple([z.number(), z.number()]),
  parameters: z.record(z.unknown()).default({}),
});

export type N8nNode = z.infer<typeof N8nNodeSchema>;

// --- N8n Workflow ---

export const N8nWorkflowSchema = z.object({
  name: z.string().min(1),
  nodes: z.array(N8nNodeSchema).min(1),
  connections: z.record(z.unknown()),
  settings: z.record(z.unknown()).optional(),
});

export type N8nWorkflow = z.infer<typeof N8nWorkflowSchema>;

// --- Output ---

export const N8nEngineerOutputSchema = z.object({
  workflowId: z.string(),
  workflowName: z.string(),
  workflowFilePath: z.string(),
  status: z.literal("needs-approval"),
  approvalId: z.string(),
});

export type N8nEngineerOutput = z.infer<typeof N8nEngineerOutputSchema>;
