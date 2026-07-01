import { createAgentTask } from "../../lib/agent-runner.js";
import { N8nEngineerInputSchema } from "./schema.js";
import { n8nEngineerHandler } from "./handler.js";
import type { N8nEngineerOutput } from "./schema.js";

export const n8nEngineerAgentConfig = {
  id: "n8n-engineer",
  name: "N8n Workflow Engineer",
  description:
    "Generates valid n8n workflow JSON from approved proposals. Searches reference templates for patterns, writes workflow.json to client directory, and gates deployment behind human approval.",
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
  tags: ["n8n", "f3", "workflow-generation", "needs-approval"],
};

export const n8nEngineerAgentTask = createAgentTask<
  typeof N8nEngineerInputSchema,
  N8nEngineerOutput
>({
  config: n8nEngineerAgentConfig,
  inputSchema: N8nEngineerInputSchema,
  handler: n8nEngineerHandler,
  maxDuration: 120,
});
