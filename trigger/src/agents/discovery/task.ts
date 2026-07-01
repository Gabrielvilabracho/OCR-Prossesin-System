import { createAgentTask } from "../../lib/agent-runner";
import { DiscoveryInputSchema } from "./schema";
import { discoveryHandler } from "./handler";
import type { DiscoveryOutput } from "./schema";

export const discoveryAgentConfig = {
  id: "discovery-agent",
  name: "Discovery Agent",
  description: "Extracts structured client intake briefs from unstructured text",
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
  tags: ["intake", "extraction", "brief", "block-3a"],
};

export const discoveryAgentTask = createAgentTask<typeof DiscoveryInputSchema, DiscoveryOutput>({
  config: discoveryAgentConfig,
  inputSchema: DiscoveryInputSchema,
  handler: discoveryHandler,
  maxDuration: 120,
});
