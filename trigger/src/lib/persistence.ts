import { supabase } from "./supabase";
import type { AgentRunRecord, AgentRunStatus, AgentStep, ApprovalStatus } from "./agent-types";

// --- Errors ---

export class PersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersistenceError";
  }
}

// --- Run lifecycle ---

export async function createAgentRun(params: {
  agentId: string;
  triggerRunId: string;
  input: unknown;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("agent_runs") as any)
    .insert({
      agent_id: params.agentId,
      trigger_run_id: params.triggerRunId,
      status: "running",
      input: params.input,
      metadata: params.metadata ?? null,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    throw new PersistenceError(`Failed to create agent run: ${error.message}`);
  }

  return (data as { id: string }).id;
}

export async function updateAgentRun(params: {
  runId: string;
  status: AgentRunStatus;
  output?: unknown;
  error?: string;
  tokenUsage?: AgentRunRecord["tokenUsage"];
  completedAt?: string;
}): Promise<void> {
  const updateData: Record<string, unknown> = {
    status: params.status,
  };
  if (params.output !== undefined) updateData.output = params.output;
  if (params.error !== undefined) updateData.error = params.error;
  if (params.tokenUsage !== undefined) updateData.token_usage = params.tokenUsage;
  if (params.completedAt !== undefined) updateData.completed_at = params.completedAt;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("agent_runs") as any)
    .update(updateData)
    .eq("id", params.runId);

  if (error) {
    throw new PersistenceError(`Failed to update agent run: ${error.message}`);
  }
}

export async function getAgentRun(runId: string): Promise<AgentRunRecord | null> {
  const { data, error } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();

  if (error) {
    throw new PersistenceError(`Failed to get agent run: ${error.message}`);
  }

  if (!data) return null;

  // Map snake_case DB columns to camelCase AgentRunRecord
  const row = data as Record<string, unknown>;
  return {
    id: row.id as string,
    agentId: row.agent_id as string,
    triggerRunId: row.trigger_run_id as string,
    status: row.status as AgentRunStatus,
    input: row.input,
    output: row.output,
    steps: [],
    error: row.error as string | undefined,
    tokenUsage: (row.token_usage as AgentRunRecord["tokenUsage"]) ?? {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
    startedAt: row.started_at as string,
    completedAt: row.completed_at as string | undefined,
    metadata: row.metadata as Record<string, unknown> | undefined,
  };
}

// --- Step logging ---

export async function logAgentStep(params: {
  runId: string;
  step: AgentStep;
}): Promise<void> {
  const { step } = params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("agent_steps") as any).insert({
    run_id: params.runId,
    step_name: step.stepName,
    input: step.input ?? null,
    output: step.output ?? null,
    token_usage: step.tokenUsage ?? null,
    duration_ms: step.durationMs ?? null,
    error: step.error ?? null,
  });

  if (error) {
    // REQ-12: logAgentStep MUST NOT throw on failure — log warning and resolve
    console.warn(`[persistence] Failed to log agent step: ${error.message}`);
  }
}

// --- Approvals ---

export async function requestApproval(params: {
  runId: string;
  agentId: string;
  stepName: string;
  payload: unknown;
  reason: string;
}): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("approvals") as any)
    .insert({
      run_id: params.runId,
      agent_id: params.agentId,
      step_name: params.stepName,
      payload: params.payload,
      reason: params.reason,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    throw new PersistenceError(`Failed to request approval: ${error.message}`);
  }

  return (data as { id: string }).id;
}

export async function checkApproval(approvalId: string): Promise<{
  status: ApprovalStatus;
  decidedBy?: string;
  decidedAt?: string;
}> {
  const { data, error } = await supabase
    .from("approvals")
    .select("status, decided_by, decided_at")
    .eq("id", approvalId)
    .maybeSingle();

  if (error) {
    throw new PersistenceError(`Failed to check approval: ${error.message}`);
  }

  if (!data) {
    throw new PersistenceError(`Approval not found: "${approvalId}"`);
  }

  const row = data as Record<string, unknown>;
  return {
    status: row.status as ApprovalStatus,
    decidedBy: row.decided_by as string | undefined,
    decidedAt: row.decided_at as string | undefined,
  };
}

export async function resolveApproval(params: {
  approvalId: string;
  status: "approved" | "rejected";
  decidedBy: string;
}): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("approvals") as any)
    .update({
      status: params.status,
      decided_by: params.decidedBy,
      decided_at: new Date().toISOString(),
    })
    .eq("id", params.approvalId);

  if (error) {
    throw new PersistenceError(`Failed to resolve approval: ${error.message}`);
  }
}
