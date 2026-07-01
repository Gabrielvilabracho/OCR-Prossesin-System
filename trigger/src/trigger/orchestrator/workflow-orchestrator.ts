import { z } from "zod";
import { batch, wait, tasks } from "@trigger.dev/sdk";
import { createAgentTask } from "../../lib/agent-runner";
import { llmGenerateObject } from "../../lib/llm";
import { loadPrompt } from "../../lib/prompts";
import { requestApproval } from "../../lib/persistence";
import type { AgentConfig, AgentContext, AgentRunStatus } from "../../lib/agent-types";
import { getAgentById, getRegistryContext } from "./agent-registry";

// --- Schemas ---

export const OrchestratorInputSchema = z.object({
  /** Natural language intent describing what the user wants */
  intent: z.string().min(1),
  /** Optional context for the routing decision */
  context: z.record(z.unknown()).optional(),
  /** Bypass LLM routing: dispatch directly to this agent */
  requestedAgentId: z.string().optional(),
});

export type OrchestratorInput = z.infer<typeof OrchestratorInputSchema>;

export const RoutingDecisionSchema = z.object({
  selectedAgents: z.array(
    z.object({
      taskId: z.string(),
      reasoning: z.string(),
      input: z.record(z.unknown()),
    }),
  ),
  strategy: z.enum(["sequential", "parallel"]),
});

export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;

export type OrchestratorOutput = {
  agentId: string;
  runId: string;
  status: AgentRunStatus;
  result?: unknown;
  approvalTokenId?: string;
};

// --- Config ---

const ORCHESTRATOR_CONFIG: AgentConfig = {
  id: "workflow-orchestrator",
  name: "Workflow Orchestrator",
  description: "Routes intents to agents and orchestrates multi-agent workflows",
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
  temperature: 0,
  tags: ["orchestrator", "routing"],
};

const APPROVAL_TIMEOUT_SECONDS = 600; // 10 minutes — consistent with token TTL (REQ-17)

// --- Internal helpers ---

/** Extract a human-readable reason from an agent's output. */
function extractReason(output: unknown): string {
  if (
    output !== null &&
    typeof output === "object" &&
    "reason" in output &&
    typeof (output as Record<string, unknown>).reason === "string"
  ) {
    return (output as Record<string, unknown>).reason as string;
  }
  return "Agent requires human approval to proceed.";
}

// --- routeIntent ---

/**
 * Route an intent to one or more agents via LLM, or directly when `requestedAgentId` is present.
 * Validates all returned taskIds against the registry. Throws if any ID is not found.
 */
export async function routeIntent(
  input: OrchestratorInput,
  ctx: AgentContext,
): Promise<RoutingDecision> {
  let decision: RoutingDecision;

  if (input.requestedAgentId !== undefined) {
    // Direct dispatch path — validate the requested ID exists (REQ-09, REQ-12)
    const entry = getAgentById(input.requestedAgentId);
    if (entry === undefined) {
      throw new Error(
        `Agent not found in registry: "${input.requestedAgentId}". Check the registered taskId.`,
      );
    }

    decision = {
      selectedAgents: [
        {
          taskId: input.requestedAgentId,
          reasoning: "Direct dispatch — requestedAgentId provided by caller.",
          input: input.context ?? {},
        },
      ],
      strategy: "sequential",
    };
  } else {
    // LLM routing path (REQ-10)
    const registrySummary = getRegistryContext();
    const systemPrompt = await loadPrompt("orchestrator", {
      registrySummary,
      intent: input.intent,
      context: JSON.stringify(input.context ?? {}),
    });

    const routingResult = await llmGenerateObject({
      model: {
        provider: ORCHESTRATOR_CONFIG.provider,
        model: ORCHESTRATOR_CONFIG.model,
        temperature: ORCHESTRATOR_CONFIG.temperature,
      },
      system: systemPrompt,
      prompt: `Intent: ${input.intent}\nContext: ${JSON.stringify(input.context ?? {})}`,
      schema: RoutingDecisionSchema,
      schemaName: "RoutingDecision",
      schemaDescription: "The routing decision produced by the orchestrator",
    });

    decision = routingResult.object;

    // Validate every returned taskId against the registry (REQ-11)
    for (const agent of decision.selectedAgents) {
      const entry = getAgentById(agent.taskId);
      if (entry === undefined) {
        throw new Error(
          `LLM returned an agent ID not found in registry: "${agent.taskId}". This may be a hallucination — update the prompt or registry.`,
        );
      }
    }
  }

  // Log routing step
  await ctx.logStep({
    stepName: "route-intent",
    input: { intent: input.intent, requestedAgentId: input.requestedAgentId },
    output: decision,
  });

  return decision;
}

// --- dispatchAgent ---

/**
 * Dispatch to a single agent via `tasks.triggerAndWait`.
 * Handles awaiting_approval by creating a wait token and suspending.
 * Throws on dispatch failure (REQ-13).
 */
export async function dispatchAgent(
  taskId: string,
  agentInput: Record<string, unknown>,
  ctx: AgentContext,
): Promise<OrchestratorOutput> {
  // Validate the agent exists before dispatch (REQ-12)
  const entry = getAgentById(taskId);
  if (entry === undefined) {
    throw new Error(
      `Cannot dispatch to unknown agent: "${taskId}". Agent not found in registry.`,
    );
  }

  const result = await tasks.triggerAndWait(taskId, agentInput);

  if (!result.ok) {
    // Propagate failure — never swallow (REQ-13)
    const errorMsg =
      typeof result.error === "string"
        ? result.error
        : result.error instanceof Error
          ? result.error.message
          : String(result.error);

    await ctx.logStep({
      stepName: `dispatch-${taskId}`,
      input: agentInput,
      error: errorMsg,
    });

    return {
      agentId: taskId,
      runId: ctx.runId,
      status: "failed",
      result: { error: errorMsg },
    };
  }

  const output = result.output as Record<string, unknown> | null | undefined;

  // Check for awaiting_approval signal in output (REQ-14)
  if (
    output !== null &&
    output !== undefined &&
    typeof output === "object" &&
    (output as Record<string, unknown>).status === "awaiting_approval"
  ) {
    // Approval gate flow (REQ-15, REQ-16, REQ-17)
    const token = await wait.createToken({ timeout: "10m" });

    await requestApproval({
      runId: ctx.runId,
      agentId: taskId,
      stepName: token.id,
      payload: output,
      reason: extractReason(output),
    });

    try {
      await wait.forToken(token.id);
    } catch {
      // Timeout — mark as failed (REQ-17)
      await ctx.logStep({
        stepName: `dispatch-${taskId}`,
        input: agentInput,
        output: { approvalTokenId: token.id },
        error: "Approval timeout: no response within 10 minutes",
      });

      return {
        agentId: taskId,
        runId: ctx.runId,
        status: "failed",
        result: { error: "Approval timeout: no response within 10 minutes" },
      };
    }

    await ctx.logStep({
      stepName: `dispatch-${taskId}`,
      input: agentInput,
      output: { approvalTokenId: token.id, status: "awaiting_approval" },
    });

    return {
      agentId: taskId,
      runId: ctx.runId,
      status: "awaiting_approval",
      approvalTokenId: token.id,
      result: output,
    };
  }

  // Successful dispatch (REQ-13)
  await ctx.logStep({
    stepName: `dispatch-${taskId}`,
    input: agentInput,
    output: result.output,
  });

  return {
    agentId: taskId,
    runId: ctx.runId,
    status: "completed",
    result: result.output,
  };
}

// --- dispatchParallel ---

/**
 * Dispatch to multiple agents in parallel via `batch.triggerAndWait` (string-ID API).
 * NEVER wraps individual `triggerAndWait` calls in Promise.all (SDK constraint — AD-4).
 */
export async function dispatchParallel(
  agents: RoutingDecision["selectedAgents"],
  ctx: AgentContext,
): Promise<OrchestratorOutput[]> {
  if (agents.length === 0) {
    return [];
  }

  // batch.triggerAndWait uses string task IDs — no task reference required (AD-4)
  // Cast required because TypeScript cannot infer the generic TTask from string identifiers
  type BatchRun = { ok: boolean; output?: unknown; error?: unknown; id?: string };
  const batchResult = (await batch.triggerAndWait(
    agents.map((a) => ({ id: a.taskId, payload: a.input })),
  )) as { runs: BatchRun[] };

  const outputs: OrchestratorOutput[] = [];

  for (let i = 0; i < batchResult.runs.length; i++) {
    const run = batchResult.runs[i];
    const agent = agents[i];

    if (!run) continue;

    if (!run.ok) {
      const errorMsg =
        typeof run.error === "string"
          ? run.error
          : run.error instanceof Error
            ? run.error.message
            : String(run.error);

      outputs.push({
        agentId: agent?.taskId ?? "unknown",
        runId: ctx.runId,
        status: "failed",
        result: { error: errorMsg },
      });
      continue;
    }

    const output = run.output as Record<string, unknown> | null | undefined;

    // Any awaiting_approval in batch results — handle via dispatchAgent for that entry
    if (
      output !== null &&
      output !== undefined &&
      typeof output === "object" &&
      (output as Record<string, unknown>).status === "awaiting_approval" &&
      agent !== undefined
    ) {
      const approvalResult = await dispatchAgent(agent.taskId, agent.input, ctx);
      outputs.push(approvalResult);
      continue;
    }

    outputs.push({
      agentId: agent?.taskId ?? "unknown",
      runId: ctx.runId,
      status: "completed",
      result: run.output,
    });
  }

  return outputs;
}

// --- dispatchSequential ---

/**
 * Dispatch agents sequentially, passing each agent's output as context to the next.
 * Stops early on failure or awaiting_approval.
 */
export async function dispatchSequential(
  agents: RoutingDecision["selectedAgents"],
  ctx: AgentContext,
): Promise<OrchestratorOutput[]> {
  const outputs: OrchestratorOutput[] = [];
  let previousOutput: unknown = undefined;

  for (const agent of agents) {
    // Merge previous output into input for chaining
    const agentInput: Record<string, unknown> =
      previousOutput !== undefined
        ? { ...agent.input, _previousOutput: previousOutput }
        : { ...agent.input };

    const result = await dispatchAgent(agent.taskId, agentInput, ctx);
    outputs.push(result);

    // Stop early on failure or awaiting_approval
    if (result.status === "failed" || result.status === "awaiting_approval") {
      break;
    }

    previousOutput = result.result;
  }

  return outputs;
}

// --- Task export ---

export const workflowOrchestrator = createAgentTask({
  config: ORCHESTRATOR_CONFIG,
  inputSchema: OrchestratorInputSchema,
  maxDuration: 900, // REQ-24: 15 minutes — covers 600s approval gate + headroom
  handler: async (input, ctx): Promise<OrchestratorOutput | OrchestratorOutput[]> => {
    // 1. Route intent (LLM or direct bypass)
    const decision = await routeIntent(input, ctx);

    // 2. Dispatch based on strategy
    let results: OrchestratorOutput[];

    if (decision.strategy === "parallel") {
      results = await dispatchParallel(decision.selectedAgents, ctx);
    } else {
      results = await dispatchSequential(decision.selectedAgents, ctx);
    }

    // 3. Return single result when only one agent, array otherwise
    if (results.length === 1 && results[0] !== undefined) {
      return results[0];
    }

    return results;
  },
});
