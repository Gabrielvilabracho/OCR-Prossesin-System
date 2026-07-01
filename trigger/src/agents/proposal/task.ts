import { createAgentTask } from "../../lib/agent-runner";
import { ProposalInputSchema } from "./schema";
import { proposalHandler } from "./handler";
import type { ProposalOutput } from "./schema";

export const proposalAgentConfig = {
  id: "proposal-agent",
  name: "Proposal Agent",
  description:
    "Generates structured client proposals from Discovery Briefs following proposal-template.md",
  provider: "anthropic" as const,
  model: "claude-sonnet-4-20250514",
  temperature: 0.3,
  maxTokens: 8192,
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000,
  },
  tags: ["proposal", "f2", "client-facing", "block-3b"],
};

export const proposalAgentTask = createAgentTask<
  typeof ProposalInputSchema,
  ProposalOutput
>({
  config: proposalAgentConfig,
  inputSchema: ProposalInputSchema,
  handler: proposalHandler,
  maxDuration: 120,
});
