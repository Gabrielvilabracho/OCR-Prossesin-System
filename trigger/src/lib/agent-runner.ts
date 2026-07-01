import { schemaTask, logger } from "@trigger.dev/sdk";
import type { z } from "zod";
import type { AgentConfig, AgentHandler, AgentContext, AgentStep } from "./agent-types";
import { createAgentRun, updateAgentRun, logAgentStep } from "./persistence";

export type CreateAgentTaskOptions<
  TInputSchema extends z.ZodType,
  TOutput,
> = {
  config: AgentConfig;
  inputSchema: TInputSchema;
  handler: AgentHandler<z.infer<TInputSchema>, TOutput>;
  maxDuration?: number;
};

export function createAgentTask<
  TInputSchema extends z.ZodType,
  TOutput,
>(options: CreateAgentTaskOptions<TInputSchema, TOutput>) {
  const { config, inputSchema, handler, maxDuration = 300 } = options;

  return schemaTask({
    id: config.id,
    schema: inputSchema,
    maxDuration,
    retry: config.retry ?? {
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 30000,
    },
    run: async (input: z.infer<TInputSchema>, { ctx }: { ctx: { run: { id: string } } }) => {
      // Create run record — if this fails, we warn and continue with a fallback ID
      let runId: string;
      try {
        runId = await createAgentRun({
          agentId: config.id,
          triggerRunId: ctx.run.id,
          input,
          metadata: config.tags ? { tags: config.tags } : undefined,
        });
      } catch (persistenceError) {
        const msg =
          persistenceError instanceof Error
            ? persistenceError.message
            : String(persistenceError);
        console.warn(`[agent-runner] Failed to create agent run record: ${msg}. Continuing with fallback ID.`);
        runId = crypto.randomUUID();
      }

      const totalTokenUsage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      };

      let stepIndex = 0;

      const agentCtx: AgentContext = {
        runId,
        triggerRunId: ctx.run.id,
        config,
        logStep: async (step: Omit<AgentStep, "durationMs">) => {
          if (step.tokenUsage) {
            totalTokenUsage.promptTokens += step.tokenUsage.promptTokens;
            totalTokenUsage.completionTokens += step.tokenUsage.completionTokens;
            totalTokenUsage.totalTokens += step.tokenUsage.totalTokens;
          }
          stepIndex++;
          // logAgentStep never throws (REQ-12)
          await logAgentStep({
            runId,
            step: { ...step, durationMs: undefined },
          });
        },
      };

      logger.info(`Agent ${config.name} started`, { runId, agentId: config.id });

      try {
        const output = await handler(input, agentCtx);

        await updateAgentRun({
          runId,
          status: "completed",
          output,
          tokenUsage: totalTokenUsage,
          completedAt: new Date().toISOString(),
        });

        logger.info(`Agent ${config.name} completed`, { runId, tokenUsage: totalTokenUsage });
        return output;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        await updateAgentRun({
          runId,
          status: "failed",
          error: errorMessage,
          tokenUsage: totalTokenUsage,
          completedAt: new Date().toISOString(),
        });

        logger.error(`Agent ${config.name} failed`, { runId, error: errorMessage });
        throw error;
      }
    },
  });
}
