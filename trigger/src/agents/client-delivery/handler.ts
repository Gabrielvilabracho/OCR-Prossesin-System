import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { AgentHandler } from "../../lib/agent-types.js";
import { llmGenerateText } from "../../lib/llm.js";
import { loadPrompt } from "../../lib/prompts.js";
import { requestApproval } from "../../lib/persistence.js";
import type { ClientDeliveryInput, ClientDeliveryOutput } from "./schema.js";

// --- Project root resolution ---

function getProjectRoot(): string {
  // handler.ts is at trigger/src/agents/client-delivery/handler.ts
  // client-delivery -> agents -> src -> trigger -> project root (4 levels up)
  const thisFileDir = resolve(fileURLToPath(import.meta.url), "..");
  return resolve(thisFileDir, "..", "..", "..", "..");
}

// --- Handler ---

export const clientDeliveryHandler: AgentHandler<
  ClientDeliveryInput,
  ClientDeliveryOutput
> = async (input, ctx) => {
  const { proposalText, clientSlug, deliverables, qaResults } = input;
  const projectRoot = getProjectRoot();

  const deliverablesList = deliverables.join("\n- ");
  const promptVars: Record<string, string> = {
    proposalText,
    clientSlug,
    deliverables: deliverablesList,
    qaResults,
  };

  // Step 1: Generate runbook
  const runbookPrompt = await loadPrompt("client-delivery/runbook", promptVars);
  const runbookResult = await llmGenerateText({
    model: {
      provider: ctx.config.provider,
      model: ctx.config.model,
      temperature: ctx.config.temperature,
      maxTokens: ctx.config.maxTokens,
    },
    system: runbookPrompt,
    prompt: `Generate runbook for: ${clientSlug}`,
  });
  const runbookText = runbookResult.text;

  await ctx.logStep({
    stepName: "generate-runbook",
    input: { clientSlug },
    output: {
      textLength: runbookText.length,
      finishReason: runbookResult.finishReason,
    },
    tokenUsage: runbookResult.tokenUsage,
  });

  // Step 2: Generate handoff
  const handoffPrompt = await loadPrompt("client-delivery/handoff", promptVars);
  const handoffResult = await llmGenerateText({
    model: {
      provider: ctx.config.provider,
      model: ctx.config.model,
      temperature: ctx.config.temperature,
      maxTokens: ctx.config.maxTokens,
    },
    system: handoffPrompt,
    prompt: `Generate handoff doc for: ${clientSlug}`,
  });
  const handoffText = handoffResult.text;

  await ctx.logStep({
    stepName: "generate-handoff",
    input: { clientSlug },
    output: {
      textLength: handoffText.length,
      finishReason: handoffResult.finishReason,
    },
    tokenUsage: handoffResult.tokenUsage,
  });

  // Step 3: Generate demo script
  const demoPrompt = await loadPrompt("client-delivery/demo-script", promptVars);
  const demoResult = await llmGenerateText({
    model: {
      provider: ctx.config.provider,
      model: ctx.config.model,
      temperature: ctx.config.temperature,
      maxTokens: ctx.config.maxTokens,
    },
    system: demoPrompt,
    prompt: `Generate demo script for: ${clientSlug}`,
  });
  const demoText = demoResult.text;

  await ctx.logStep({
    stepName: "generate-demo-script",
    input: { clientSlug },
    output: {
      textLength: demoText.length,
      finishReason: demoResult.finishReason,
    },
    tokenUsage: demoResult.tokenUsage,
  });

  // Step 4: Write all three files
  const deliveryDir = join(projectRoot, "clients", clientSlug, "05-golive");
  await mkdir(deliveryDir, { recursive: true });

  const runbookPath = join(deliveryDir, "runbook.md");
  const handoffPath = join(deliveryDir, "handoff.md");
  const demoScriptPath = join(deliveryDir, "demo-script.md");

  await writeFile(runbookPath, runbookText, "utf-8");
  await writeFile(handoffPath, handoffText, "utf-8");
  await writeFile(demoScriptPath, demoText, "utf-8");

  await ctx.logStep({
    stepName: "write-files",
    output: { runbookPath, handoffPath, demoScriptPath },
  });

  // Step 5: Request approval (mandatory — no auto-send)
  // Errors MUST propagate — do NOT swallow
  const approvalId = await requestApproval({
    runId: ctx.runId,
    agentId: ctx.config.id,
    stepName: "delivery-review",
    payload: {
      clientSlug,
      runbookPath,
      handoffPath,
      demoScriptPath,
      runbookPreview: runbookText.slice(0, 300),
      handoffPreview: handoffText.slice(0, 300),
      demoScriptPreview: demoText.slice(0, 300),
    },
    reason: `Delivery docs generated for client "${clientSlug}". Requires human review before sharing.`,
  });

  await ctx.logStep({
    stepName: "request-approval",
    output: { approvalId },
  });

  return {
    runbookPath,
    handoffPath,
    demoScriptPath,
    status: "needs-approval",
    approvalId,
  };
};
