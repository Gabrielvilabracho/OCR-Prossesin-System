import { z } from "zod";
import { DiscoveryBriefSchema } from "../discovery/schema";

// --- Input ---

export const ProposalInputSchema = z.object({
  brief: DiscoveryBriefSchema,
  additionalContext: z
    .string()
    .optional()
    .describe("Extra context: budget notes, timeline preferences, special requests"),
});

export type ProposalInput = z.infer<typeof ProposalInputSchema>;

// --- Output ---

export type ProposalOutput = {
  proposalText: string;
  briefFilePath: string;
  proposalFilePath: string;
  clientSlug: string;
  approvalId: string;
  status: "needs-approval";
};
