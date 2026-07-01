import { createAgentTask } from "../../lib/agent-runner.js";
import { ValidationQaInputSchema } from "./schema.js";
import { validationQaHandler } from "./handler.js";
import type { ValidationQaOutput } from "./schema.js";

export const validationQaAgentConfig = {
  id: "validation-qa",
  name: "Validation QA Engineer",
  description:
    "Runs structured QA checklist on implementation deliverables before client go-live. Auto-passes on all-clear; gates on issues for human review.",
  provider: "anthropic" as const,
  model: "claude-sonnet-4-20250514",
  temperature: 0,
  maxTokens: 4096,
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000,
  },
  tags: ["qa", "f4", "validation", "checklist"],
};

export const validationQaAgentTask = createAgentTask<
  typeof ValidationQaInputSchema,
  ValidationQaOutput
>({
  config: validationQaAgentConfig,
  inputSchema: ValidationQaInputSchema,
  handler: validationQaHandler,
  maxDuration: 120,
});
