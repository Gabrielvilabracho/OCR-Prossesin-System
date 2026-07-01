import { mkdir, writeFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { AgentHandler } from "../../lib/agent-types.js";
import { llmGenerateText } from "../../lib/llm.js";
import { loadPrompt } from "../../lib/prompts.js";
import { requestApproval } from "../../lib/persistence.js";
import type { TriggerEngineerInput, TriggerEngineerOutput } from "./schema.js";

// --- Project root resolution ---

function getProjectRoot(): string {
  // handler.ts is at trigger/src/agents/trigger-engineer/handler.ts
  // trigger-engineer -> agents -> src -> trigger -> project root (4 levels up)
  const thisFileDir = resolve(fileURLToPath(import.meta.url), "..");
  return resolve(thisFileDir, "..", "..", "..", "..");
}

const TASK_SUBDIR = "03-diseno";

// --- Code fence stripping ---

function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:typescript|ts)?\n?/, "")
    .replace(/```\s*$/, "")
    .trim();
}

// --- TaskId / TaskName derivation ---

function deriveTaskId(taskDescription: string): string {
  return taskDescription
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function deriveTaskName(taskDescription: string): string {
  return taskDescription.slice(0, 80);
}

// --- Handler ---

export const triggerEngineerHandler: AgentHandler<
  TriggerEngineerInput,
  TriggerEngineerOutput
> = async (input, ctx) => {
  const { proposalText, clientSlug, taskDescription } = input;
  const projectRoot = getProjectRoot();

  // Step 1: List examples — read directory names for use in prompt
  const examplesPath = join(projectRoot, "references", "trigger.dev", "examples");
  const exampleEntries = await readdir(examplesPath);
  const availableExamples = exampleEntries.join("\n");

  // Step 2: Load prompt with examples context already available
  const promptVars: Record<string, string> = {
    proposalText,
    taskDescription,
    availableExamples,
  };

  const systemPrompt = await loadPrompt("trigger-engineer", promptVars);

  await ctx.logStep({
    stepName: "load-prompt",
    input: { agentName: "trigger-engineer", varsKeys: Object.keys(promptVars) },
    output: { promptLength: systemPrompt.length },
  });

  await ctx.logStep({
    stepName: "search-examples",
    input: { examplesPath },
    output: { exampleCount: exampleEntries.length },
  });

  // Step 3: Generate task TypeScript code via LLM
  const result = await llmGenerateText({
    model: {
      provider: ctx.config.provider,
      model: ctx.config.model,
      temperature: ctx.config.temperature,
      maxTokens: ctx.config.maxTokens,
    },
    system: systemPrompt,
    prompt: `Generate a Trigger.dev v4 TypeScript task for: ${taskDescription}\n\nAvailable examples for reference:\n${availableExamples}\n\nClient proposal context:\n${proposalText.slice(0, 500)}`,
  });

  const taskCode = stripCodeFences(result.text);

  await ctx.logStep({
    stepName: "generate-task",
    input: { taskDescription },
    output: {
      codeLength: taskCode.length,
      finishReason: result.finishReason,
    },
    tokenUsage: result.tokenUsage,
  });

  // Step 4: Derive taskId and taskName from input (deterministic, no regex parsing of generated code)
  const taskId = deriveTaskId(taskDescription);
  const taskName = deriveTaskName(taskDescription);

  // Step 5: Write task file
  const taskDirPath = join(projectRoot, "clients", clientSlug, TASK_SUBDIR);
  await mkdir(taskDirPath, { recursive: true });

  const taskFilePath = join(taskDirPath, "trigger-task.ts");
  await writeFile(taskFilePath, taskCode, "utf-8");

  await ctx.logStep({
    stepName: "write-file",
    output: { taskFilePath, codeLength: taskCode.length },
  });

  // Step 6: Request approval (mandatory — no auto-deployment)
  // Errors MUST propagate — do NOT swallow
  const approvalId = await requestApproval({
    runId: ctx.runId,
    agentId: ctx.config.id,
    stepName: "task-review",
    payload: {
      clientSlug,
      taskFilePath,
      taskName,
      taskId,
      codePreview: taskCode.slice(0, 500),
    },
    reason: `Trigger.dev task "${taskName}" generated for client "${clientSlug}". Requires human review before deployment.`,
  });

  await ctx.logStep({
    stepName: "request-approval",
    output: { approvalId },
  });

  return {
    taskId,
    taskName,
    taskFilePath,
    status: "needs-approval",
    approvalId,
  };
};
