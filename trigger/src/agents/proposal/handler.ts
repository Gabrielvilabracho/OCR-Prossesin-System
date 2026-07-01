import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { AgentHandler } from "../../lib/agent-types";
import { llmGenerateText } from "../../lib/llm";
import { loadPrompt } from "../../lib/prompts";
import { requestApproval } from "../../lib/persistence";
import {
  generateClientSlug,
  formatBriefAsMarkdown,
} from "../discovery/handler";
import type { ProposalInput, ProposalOutput } from "./schema";

// --- Project root resolution ---

function getProjectRoot(): string {
  // handler.ts is at trigger/src/agents/proposal/handler.ts
  // proposal -> agents -> src -> trigger -> project root
  const thisFileDir = resolve(fileURLToPath(import.meta.url), "..");
  return resolve(thisFileDir, "..", "..", "..", "..");
}

const BRIEF_SUBDIR = "01-intake";
const PROPOSAL_SUBDIR = "03-diseno";

// --- File writers ---

export async function writeBriefFile(
  slug: string,
  briefMd: string,
): Promise<string> {
  const projectRoot = getProjectRoot();
  const dirPath = join(projectRoot, "clients", slug, BRIEF_SUBDIR);
  await mkdir(dirPath, { recursive: true });
  const filePath = join(dirPath, "brief.md");
  await writeFile(filePath, briefMd, "utf-8");
  return filePath;
}

export async function writeProposalFile(
  slug: string,
  proposalText: string,
): Promise<string> {
  const projectRoot = getProjectRoot();
  const dirPath = join(projectRoot, "clients", slug, PROPOSAL_SUBDIR);
  await mkdir(dirPath, { recursive: true });
  const filePath = join(dirPath, "proposal.md");
  await writeFile(filePath, proposalText, "utf-8");
  return filePath;
}

// --- Handler ---

export const proposalHandler: AgentHandler<
  ProposalInput,
  ProposalOutput
> = async (input, ctx) => {
  const { brief, additionalContext } = input;
  const clientSlug = generateClientSlug(brief.companyName);
  const briefMd = formatBriefAsMarkdown(brief);

  // Step 1: Load prompt
  const promptVars: Record<string, string> = {
    companyName: brief.companyName,
    briefMarkdown: briefMd,
    painPoints:
      brief.painPoints.length > 0
        ? brief.painPoints.join("; ")
        : "Not specified",
    currentProcess: brief.currentProcess ?? "Not specified",
    systemsUsed:
      brief.currentStack.length > 0
        ? brief.currentStack.join(", ")
        : "Not specified",
    urgency: brief.urgency,
    kpiCandidates:
      brief.kpiCandidates.length > 0
        ? brief.kpiCandidates.join("; ")
        : "Not specified",
    additionalContext: additionalContext ?? "",
    completenessScore: String(brief.completenessScore),
  };

  const systemPrompt = await loadPrompt("proposal", promptVars);

  await ctx.logStep({
    stepName: "load-prompt",
    input: { agentName: "proposal", varsKeys: Object.keys(promptVars) },
    output: { promptLength: systemPrompt.length },
  });

  // Step 2: Generate proposal text
  const result = await llmGenerateText({
    model: {
      provider: ctx.config.provider,
      model: ctx.config.model,
      temperature: ctx.config.temperature,
      maxTokens: ctx.config.maxTokens,
    },
    system: systemPrompt,
    prompt: `Generate a complete client proposal for ${brief.companyName} based on the brief provided in the system prompt.`,
  });

  const proposalText = result.text;

  await ctx.logStep({
    stepName: "generate-proposal",
    input: { briefCompleteness: brief.completenessScore },
    output: {
      proposalLength: proposalText.length,
      finishReason: result.finishReason,
    },
    tokenUsage: result.tokenUsage,
  });

  // Step 3: Write brief file
  const briefFilePath = await writeBriefFile(clientSlug, briefMd);

  await ctx.logStep({
    stepName: "write-brief",
    output: { briefFilePath },
  });

  // Step 4: Write proposal file
  const proposalFilePath = await writeProposalFile(clientSlug, proposalText);

  await ctx.logStep({
    stepName: "write-proposal",
    output: { proposalFilePath },
  });

  // Step 5: Request approval (mandatory — REQ-09, AD-4)
  // Errors MUST propagate — do NOT swallow
  const approvalId = await requestApproval({
    runId: ctx.runId,
    agentId: ctx.config.id,
    stepName: "proposal-review",
    payload: {
      clientSlug,
      proposalFilePath,
      briefFilePath,
      proposalPreview: proposalText.slice(0, 500),
    },
    reason: `Proposal generated for ${brief.companyName}. Requires human review before sending to client.`,
  });

  await ctx.logStep({
    stepName: "request-approval",
    output: { approvalId },
  });

  return {
    proposalText,
    briefFilePath,
    proposalFilePath,
    clientSlug,
    approvalId,
    status: "needs-approval",
  };
};
