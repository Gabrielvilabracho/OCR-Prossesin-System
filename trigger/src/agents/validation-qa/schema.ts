import { z } from "zod";

// --- Checklist Item ---

export const ChecklistItemSchema = z.object({
  category: z.enum(["completeness", "security", "error-handling", "kpi-alignment"]),
  passed: z.boolean(),
  notes: z.string().min(1),
});

export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

// --- Checklist Result (LLM output) ---

export const ChecklistResultSchema = z.object({
  items: z.array(ChecklistItemSchema).min(4),
  summary: z.string(),
});

export type ChecklistResult = z.infer<typeof ChecklistResultSchema>;

// --- Input ---

export const ValidationQaInputSchema = z.object({
  implementationSummary: z
    .string()
    .min(20)
    .describe("Summary of the implementation to evaluate — minimum 20 characters"),
  clientSlug: z
    .string()
    .regex(/^[a-z0-9-]+$/, "clientSlug must be lowercase letters, numbers, hyphens")
    .describe("Client identifier — lowercase letters, numbers, hyphens only"),
  deliverables: z
    .array(z.string().min(1))
    .min(1)
    .describe("List of deliverables to validate — at least 1 item"),
});

export type ValidationQaInput = z.infer<typeof ValidationQaInputSchema>;

// --- Recommendation ---

export const RecommendationSchema = z.enum(["go", "no-go", "needs-review"]);

export type Recommendation = z.infer<typeof RecommendationSchema>;

// --- Output ---

export const ValidationQaOutputSchema = z.object({
  passed: z.boolean(),
  checklistResults: z.array(ChecklistItemSchema),
  issues: z.array(z.string()),
  recommendation: RecommendationSchema,
  approvalId: z.string().optional(),
});

export type ValidationQaOutput = z.infer<typeof ValidationQaOutputSchema>;
