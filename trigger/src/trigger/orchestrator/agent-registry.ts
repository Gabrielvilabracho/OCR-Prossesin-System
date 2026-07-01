import { z } from "zod";
import { DiscoveryInputSchema } from "../../agents/discovery/schema";
import { ProposalInputSchema } from "../../agents/proposal/schema";
import { N8nEngineerInputSchema } from "../../agents/n8n-engineer/schema";
import { TriggerEngineerInputSchema } from "../../agents/trigger-engineer/schema";
import { ValidationQaInputSchema } from "../../agents/validation-qa/schema";
import { ClientDeliveryInputSchema } from "../../agents/client-delivery/schema";

// --- Types ---

/**
 * A registered agent entry. `taskId` must match the Trigger.dev task ID exactly.
 */
export type AgentRegistryEntry = {
  /** Trigger.dev task ID — must match the task's `id` field exactly */
  taskId: string;
  /** Human-readable name for LLM context */
  name: string;
  /** What this agent does — injected into routing prompt */
  description: string;
  /** Capability tags for filtering and LLM context */
  capabilities: readonly string[];
  /** Zod schema for the agent's input — used for validation before dispatch */
  inputSchema: z.ZodType;
};

// --- Registry ---

/**
 * Static agent registry. New agents are added here as they are implemented.
 * Contains a mock entry for Block 1 testing purposes (REQ-05).
 * Real domain agents (Blocks 2–6) are added in their respective blocks.
 */
export const AGENT_REGISTRY: readonly AgentRegistryEntry[] = [
  {
    taskId: "mock-agent",
    name: "Mock Agent",
    description: "A placeholder agent for testing the orchestrator routing and dispatch logic.",
    capabilities: ["mock", "testing"],
    inputSchema: z.object({ message: z.string() }),
  },
  {
    taskId: "discovery-agent",
    name: "Discovery Agent",
    description:
      "Extracts structured client intake briefs from unstructured text (meeting notes, emails, transcripts). Produces a complete DiscoveryBrief with company info, pain points, process steps, KPIs, and next steps.",
    capabilities: ["intake", "extraction", "brief", "f0"],
    inputSchema: DiscoveryInputSchema,
  },
  {
    taskId: "proposal-agent",
    name: "Proposal Agent",
    description:
      "Generates structured client proposals from Discovery Briefs following proposal-template.md. Writes brief.md and proposal.md to client directories. Always requires human approval before sending.",
    capabilities: ["proposal", "f2-design", "client-proposal", "needs-approval"],
    inputSchema: ProposalInputSchema,
  },
  {
    taskId: "n8n-engineer",
    name: "N8n Workflow Engineer",
    description:
      "Generates n8n workflow JSON from approved proposals. Use for F3 build phase when client uses n8n for automation. Searches reference templates for patterns, writes workflow.json to client directory, and gates deployment behind human approval.",
    capabilities: ["workflow-generation", "n8n", "f3-build"],
    inputSchema: N8nEngineerInputSchema,
  },
  {
    taskId: "trigger-engineer",
    name: "Trigger.dev Task Engineer",
    description:
      "Scaffolds TypeScript Trigger.dev v4 task code from approved proposals. Use for F3 build phase when client has a TypeScript team. Searches reference examples for patterns, writes trigger-task.ts to client directory, and gates deployment behind human approval.",
    capabilities: ["task-generation", "trigger-dev", "typescript", "f3-build"],
    inputSchema: TriggerEngineerInputSchema,
  },
  {
    taskId: "validation-qa",
    name: "Validation QA Engineer",
    description:
      "Runs structured QA checklist on implementation deliverables before client go-live. Auto-passes on all-clear; gates on issues for human review.",
    capabilities: ["qa", "validation", "f4-quality-gate", "checklist"],
    inputSchema: ValidationQaInputSchema,
  },
  {
    taskId: "client-delivery",
    name: "Client Delivery Agent",
    description:
      "Generates go-live delivery documents (runbook, handoff, demo script) from approved proposals and QA results. Always requires human approval before client delivery.",
    capabilities: ["delivery", "handoff", "documentation", "f5-golive"],
    inputSchema: ClientDeliveryInputSchema,
  },
];

// --- Accessors ---

/**
 * Find an agent by its Trigger.dev task ID.
 * Returns `undefined` (no throw) if the agent is not registered.
 */
export function getAgentById(taskId: string): AgentRegistryEntry | undefined {
  return AGENT_REGISTRY.find((entry) => entry.taskId === taskId);
}

/**
 * Return all registered agents.
 */
export function listAgents(): AgentRegistryEntry[] {
  return [...AGENT_REGISTRY];
}

/**
 * Format the registry as a human-readable, LLM-ingestible string.
 * Each entry includes `taskId`, `name`, `description`, and `capabilities`.
 * Returns `"No agents registered."` when the registry is empty.
 * Output is deterministic — same registry state → same string.
 */
export function getRegistryContext(): string {
  if (AGENT_REGISTRY.length === 0) {
    return "No agents registered.";
  }

  return AGENT_REGISTRY.map((entry) =>
    [
      `taskId: ${entry.taskId}`,
      `name: ${entry.name}`,
      `description: ${entry.description}`,
      `capabilities: ${entry.capabilities.join(", ")}`,
    ].join("\n"),
  ).join("\n\n");
}
