import { mkdir, writeFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { AgentHandler } from "../../lib/agent-types.js";
import { llmGenerateObject } from "../../lib/llm.js";
import { loadPrompt } from "../../lib/prompts.js";
import { requestApproval } from "../../lib/persistence.js";
import { N8nWorkflowSchema } from "./schema.js";
import type { N8nEngineerInput, N8nEngineerOutput } from "./schema.js";

// --- Project root resolution ---

function getProjectRoot(): string {
  // handler.ts is at trigger/src/agents/n8n-engineer/handler.ts
  // n8n-engineer -> agents -> src -> trigger -> project root (4 levels up)
  const thisFileDir = resolve(fileURLToPath(import.meta.url), "..");
  return resolve(thisFileDir, "..", "..", "..", "..");
}

const WORKFLOW_SUBDIR = "03-diseno";

// --- Handler ---

export const n8nEngineerHandler: AgentHandler<
  N8nEngineerInput,
  N8nEngineerOutput
> = async (input, ctx) => {
  const { proposalText, clientSlug, workflowDescription } = input;
  const projectRoot = getProjectRoot();

  // Step 1: List templates — read directory names for use in prompt
  const templatesPath = join(projectRoot, "references", "n8n", "templates");
  const templateEntries = await readdir(templatesPath);
  const availableTemplates = templateEntries.join("\n");

  // Step 2: Load prompt with template context already available
  const promptVars: Record<string, string> = {
    proposalText,
    workflowDescription,
    availableTemplates,
  };

  const systemPrompt = await loadPrompt("n8n-engineer", promptVars);

  await ctx.logStep({
    stepName: "load-prompt",
    input: { agentName: "n8n-engineer", varsKeys: Object.keys(promptVars) },
    output: { promptLength: systemPrompt.length },
  });

  await ctx.logStep({
    stepName: "list-templates",
    input: { templatesPath },
    output: { templateCount: templateEntries.length },
  });

  // Step 3: Generate workflow JSON via LLM
  const result = await llmGenerateObject({
    model: {
      provider: ctx.config.provider,
      model: ctx.config.model,
      temperature: ctx.config.temperature,
      maxTokens: ctx.config.maxTokens,
    },
    system: systemPrompt,
    prompt: `Generate a valid n8n workflow for: ${workflowDescription}\n\nClient context: ${proposalText.slice(0, 500)}`,
    schema: N8nWorkflowSchema,
    schemaName: "N8nWorkflow",
    schemaDescription: "A valid n8n workflow JSON with nodes, connections, and settings",
  });

  const workflow = result.object;

  await ctx.logStep({
    stepName: "generate-workflow",
    input: { workflowDescription },
    output: {
      workflowName: workflow.name,
      nodeCount: workflow.nodes.length,
      finishReason: result.finishReason,
    },
    tokenUsage: result.tokenUsage,
  });

  // Step 4: Write workflow file
  const workflowDirPath = join(projectRoot, "clients", clientSlug, WORKFLOW_SUBDIR);
  await mkdir(workflowDirPath, { recursive: true });

  const workflowFilePath = join(workflowDirPath, "workflow.json");
  await writeFile(workflowFilePath, JSON.stringify(workflow, null, 2), "utf-8");

  await ctx.logStep({
    stepName: "write-file",
    output: { workflowFilePath, nodeCount: workflow.nodes.length },
  });

  // Derive workflowId: kebab-case slug from workflow name
  const workflowId = workflow.name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

  // Step 5: Request approval (mandatory — no auto-deployment)
  // Errors MUST propagate — do NOT swallow
  const approvalId = await requestApproval({
    runId: ctx.runId,
    agentId: ctx.config.id,
    stepName: "workflow-review",
    payload: {
      clientSlug,
      workflowFilePath,
      workflowName: workflow.name,
      nodeCount: workflow.nodes.length,
      workflowPreview: JSON.stringify(workflow).slice(0, 500),
    },
    reason: `n8n workflow "${workflow.name}" generated for client "${clientSlug}". Requires human review before deployment via n8n MCP tools.`,
  });

  await ctx.logStep({
    stepName: "request-approval",
    output: { approvalId },
  });

  return {
    workflowId,
    workflowName: workflow.name,
    workflowFilePath,
    status: "needs-approval",
    approvalId,
  };
};
