import type { AgentHandler } from "../../lib/agent-types.js";
import { llmGenerateObject } from "../../lib/llm.js";
import { loadPrompt } from "../../lib/prompts.js";
import { requestApproval } from "../../lib/persistence.js";
import { ChecklistResultSchema } from "./schema.js";
import type { ValidationQaInput, ValidationQaOutput } from "./schema.js";

// --- Handler ---

export const validationQaHandler: AgentHandler<
  ValidationQaInput,
  ValidationQaOutput
> = async (input, ctx) => {
  const { implementationSummary, clientSlug, deliverables } = input;

  // Step 1: Load prompt
  const deliverablesList = deliverables.join("\n- ");

  const promptVars: Record<string, string> = {
    implementationSummary,
    clientSlug,
    deliverablesList,
  };

  const systemPrompt = await loadPrompt("validation-qa", promptVars);

  await ctx.logStep({
    stepName: "load-prompt",
    input: { agentName: "validation-qa", varsKeys: Object.keys(promptVars) },
    output: { promptLength: systemPrompt.length },
  });

  // Step 2: Run checklist via LLM
  const result = await llmGenerateObject({
    model: {
      provider: ctx.config.provider,
      model: ctx.config.model,
      temperature: ctx.config.temperature,
      maxTokens: ctx.config.maxTokens,
    },
    system: systemPrompt,
    prompt: `Evaluate the implementation for client "${clientSlug}" and return a structured QA checklist with exactly 4 items (one per category: completeness, security, error-handling, kpi-alignment).`,
    schema: ChecklistResultSchema,
    schemaName: "ChecklistResult",
    schemaDescription: "Structured QA checklist with 4 items and a summary",
  });

  const { items } = result.object;

  await ctx.logStep({
    stepName: "run-checklist",
    input: { clientSlug, deliverableCount: deliverables.length },
    output: { itemCount: items.length, finishReason: result.finishReason },
    tokenUsage: result.tokenUsage,
  });

  // Step 3: Evaluate recommendation
  const criticalFailed = items.some(
    (i) => !i.passed && (i.category === "security" || i.category === "error-handling"),
  );
  const anyFailed = items.some((i) => !i.passed);

  const recommendation = criticalFailed ? "no-go" : anyFailed ? "needs-review" : "go";
  const passed = recommendation === "go";
  const issues = items.filter((i) => !i.passed).map((i) => i.notes);

  await ctx.logStep({
    stepName: "evaluate-recommendation",
    input: { itemCount: items.length },
    output: { recommendation, passed, issueCount: issues.length },
  });

  // Step 4: Conditional approval gate — only when recommendation !== "go"
  if (recommendation !== "go") {
    const approvalId = await requestApproval({
      runId: ctx.runId,
      agentId: ctx.config.id,
      stepName: "qa-review",
      payload: { recommendation, issues, clientSlug },
      reason: `QA checklist for client "${clientSlug}" returned recommendation "${recommendation}". Issues: ${issues.join("; ")}`,
    });

    await ctx.logStep({
      stepName: "request-approval",
      output: { approvalId, recommendation },
    });

    return {
      passed,
      checklistResults: items,
      issues,
      recommendation,
      approvalId,
    };
  }

  // Auto-pass: no approval needed
  return {
    passed: true,
    checklistResults: items,
    issues: [],
    recommendation: "go",
  };
};
