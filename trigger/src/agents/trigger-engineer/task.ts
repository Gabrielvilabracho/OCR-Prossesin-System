import { createAgentTask } from "../../lib/agent-runner.js";
import { TriggerEngineerInputSchema } from "./schema.js";
import { triggerEngineerHandler } from "./handler.js";
import type { TriggerEngineerOutput } from "./schema.js";

export const triggerEngineerAgentConfig = {
  id: "trigger-engineer",
  name: "Trigger.dev Task Engineer",
  description:
    "Scaffolds TypeScript Trigger.dev v4 task code from approved proposals. Searches reference examples for patterns, writes trigger-task.ts to client directory, and gates deployment behind human approval.",
  provider: "anthropic" as const,
  model: "claude-sonnet-4-20250514",
  temperature: 0.2,
  maxTokens: 8192,
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000,
  },
  tags: ["trigger-dev", "f3", "task-generation", "needs-approval"],
};

export const triggerEngineerAgentTask = createAgentTask<
  typeof TriggerEngineerInputSchema,
  TriggerEngineerOutput
>({
  config: triggerEngineerAgentConfig,
  inputSchema: TriggerEngineerInputSchema,
  handler: triggerEngineerHandler,
  maxDuration: 120,
});
