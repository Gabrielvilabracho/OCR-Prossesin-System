import { z } from "zod";

// --- Input ---

export const ClientDeliveryInputSchema = z.object({
  proposalText: z
    .string()
    .min(20)
    .describe("Approved proposal text — minimum 20 characters"),
  clientSlug: z
    .string()
    .regex(/^[a-z0-9-]+$/, "clientSlug must be lowercase letters, numbers, hyphens")
    .describe("Client identifier — lowercase letters, numbers, hyphens only"),
  deliverables: z
    .array(z.string().min(1))
    .min(1)
    .describe("List of deliverables — at least one, each non-empty"),
  qaResults: z
    .string()
    .min(10)
    .describe("QA summary from validation-qa — minimum 10 characters"),
});

export type ClientDeliveryInput = z.infer<typeof ClientDeliveryInputSchema>;

// --- Output ---

export const ClientDeliveryOutputSchema = z.object({
  runbookPath: z.string(),
  handoffPath: z.string(),
  demoScriptPath: z.string(),
  status: z.literal("needs-approval"),
  approvalId: z.string(),
});

export type ClientDeliveryOutput = z.infer<typeof ClientDeliveryOutputSchema>;
