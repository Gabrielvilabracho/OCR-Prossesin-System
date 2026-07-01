import { z } from "zod";

// --- Provider & Model ---

export const LLMProviderSchema = z.enum(["anthropic", "openai"]);
export type LLMProvider = z.infer<typeof LLMProviderSchema>;

export const LLMModelSchema = z.string().min(1);
export type LLMModel = z.infer<typeof LLMModelSchema>;

// --- Agent Step ---

export const AgentStepSchema = z.object({
  stepName: z.string(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  tokenUsage: z
    .object({
      promptTokens: z.number(),
      completionTokens: z.number(),
      totalTokens: z.number(),
    })
    .optional(),
  durationMs: z.number().optional(),
  error: z.string().optional(),
});
export type AgentStep = z.infer<typeof AgentStepSchema>;

// --- Agent Run Status ---

export const AgentRunStatusSchema = z.enum([
  "running",
  "completed",
  "failed",
  "awaiting_approval",
]);
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;

// --- Agent Config ---

export const AgentConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  provider: LLMProviderSchema,
  model: LLMModelSchema,
  temperature: z.number().min(0).max(2).default(0),
  maxTokens: z.number().positive().optional(),
  retry: z
    .object({
      maxAttempts: z.number().positive().default(3),
      factor: z.number().positive().default(2),
      minTimeoutInMs: z.number().positive().default(1000),
      maxTimeoutInMs: z.number().positive().default(30000),
    })
    .optional(),
  tags: z.array(z.string()).optional(),
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// --- Agent Run Record (for persistence) ---

export const AgentRunRecordSchema = z.object({
  id: z.string().uuid(),
  agentId: z.string(),
  triggerRunId: z.string(),
  status: AgentRunStatusSchema,
  input: z.unknown(),
  output: z.unknown().optional(),
  steps: z.array(AgentStepSchema).default([]),
  error: z.string().optional(),
  tokenUsage: z
    .object({
      promptTokens: z.number(),
      completionTokens: z.number(),
      totalTokens: z.number(),
    })
    .default({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type AgentRunRecord = z.infer<typeof AgentRunRecordSchema>;

// --- Approval ---

export const ApprovalStatusSchema = z.enum(["pending", "approved", "rejected"]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const ApprovalRequestSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  agentId: z.string(),
  stepName: z.string(),
  payload: z.unknown(),
  reason: z.string(),
  status: ApprovalStatusSchema,
  decidedBy: z.string().optional(),
  decidedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

// --- Agent Handler signature ---

export type AgentContext = {
  runId: string;
  triggerRunId: string;
  config: AgentConfig;
  logStep: (step: Omit<AgentStep, "durationMs">) => Promise<void>;
};

export type AgentHandler<TInput, TOutput> = (
  input: TInput,
  ctx: AgentContext,
) => Promise<TOutput>;
