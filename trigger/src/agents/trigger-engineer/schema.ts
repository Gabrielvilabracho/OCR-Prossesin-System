import { z } from "zod";

// --- Input ---

export const TriggerEngineerInputSchema = z.object({
  proposalText: z
    .string()
    .min(20)
    .describe("Approved proposal text — minimum 20 characters"),
  clientSlug: z
    .string()
    .regex(/^[a-z0-9-]+$/, "clientSlug must contain only lowercase letters, numbers, and hyphens")
    .describe("Client identifier — lowercase letters, numbers, hyphens only"),
  taskDescription: z
    .string()
    .min(10)
    .max(200)
    .describe("Description of the Trigger.dev task to generate — minimum 10, maximum 200 characters"),
});

export type TriggerEngineerInput = z.infer<typeof TriggerEngineerInputSchema>;

// --- Output ---

export const TriggerEngineerOutputSchema = z.object({
  taskId: z.string(),
  taskName: z.string(),
  taskFilePath: z.string(),
  status: z.literal("needs-approval"),
  approvalId: z.string(),
});

export type TriggerEngineerOutput = z.infer<typeof TriggerEngineerOutputSchema>;
