import { createAgentTask } from "../../lib/agent-runner.js";
import { ClientDeliveryInputSchema } from "./schema.js";
import { clientDeliveryHandler } from "./handler.js";
import type { ClientDeliveryOutput } from "./schema.js";

export const clientDeliveryAgentConfig = {
  id: "client-delivery",
  name: "Client Delivery Agent",
  description:
    "Generates go-live delivery documents (runbook, handoff, demo script) from approved proposals and QA results. Always requires human approval before client delivery.",
  provider: "anthropic" as const,
  model: "claude-sonnet-4-20250514",
  temperature: 0.3,
  maxTokens: 4096,
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000,
  },
  tags: ["delivery", "f5-golive", "needs-approval"],
};

export const clientDeliveryAgentTask = createAgentTask<
  typeof ClientDeliveryInputSchema,
  ClientDeliveryOutput
>({
  config: clientDeliveryAgentConfig,
  inputSchema: ClientDeliveryInputSchema,
  handler: clientDeliveryHandler,
  maxDuration: 300,
});
