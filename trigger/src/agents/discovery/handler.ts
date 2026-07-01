import type { AgentHandler } from "../../lib/agent-types";
import { llmGenerateObject } from "../../lib/llm";
import { loadPrompt } from "../../lib/prompts";
import { DiscoveryBriefSchema, type DiscoveryBrief, type DiscoveryInput, type DiscoveryOutput } from "./schema";

// --- Slug generation ---

export function generateClientSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining accent marks
    .replace(/[^a-z0-9\s-]/g, "") // remove non-alphanumeric except spaces/hyphens
    .trim()
    .replace(/\s+/g, "-") // spaces to hyphens
    .replace(/-+/g, "-") // collapse multiple hyphens
    .replace(/^-|-$/g, ""); // trim leading/trailing hyphens
}

// --- Markdown rendering ---

export function formatBriefAsMarkdown(brief: DiscoveryBrief): string {
  const lines: string[] = [];
  const today = new Date().toISOString().split("T")[0];

  lines.push(`# Brief de Intake — ${brief.companyName}`);
  lines.push("");
  lines.push(`**Fecha**: ${today}`);
  lines.push(`**Completado por**: Discovery Agent (automated extraction)`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Empresa y Contexto
  lines.push("## Empresa y Contexto");
  lines.push("");
  lines.push(`- **Empresa**: ${brief.companyName}`);
  if (brief.industry) lines.push(`- **Industria**: ${brief.industry}`);
  if (brief.teamSize) lines.push(`- **Tamaño equipo**: ${brief.teamSize}`);
  if (brief.currentStack.length > 0) {
    lines.push(`- **Stack tecnológico actual**: ${brief.currentStack.join(", ")}`);
  }
  lines.push("");

  // Objetivo de Negocio
  if (brief.businessObjective) {
    lines.push("## Objetivo de Negocio");
    lines.push("");
    lines.push(brief.businessObjective);
    lines.push("");
  }

  // Proceso a Automatizar
  if (brief.currentProcess || brief.processSteps.length > 0) {
    lines.push("## Proceso a Automatizar");
    lines.push("");
    if (brief.currentProcess) lines.push(brief.currentProcess);
    if (brief.processSteps.length > 0) {
      lines.push("");
      lines.push("**Steps actuales**:");
      brief.processSteps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
    }
    if (brief.frequency) lines.push(`\n**Frecuencia**: ${brief.frequency}`);
    if (brief.volume) lines.push(`**Volumen**: ${brief.volume}`);
    lines.push("");
  }

  // Dolor Actual
  if (brief.painPoints.length > 0 || brief.manualHoursPerWeek !== undefined || brief.errorRate || brief.costImpact) {
    lines.push("## Dolor Actual");
    lines.push("");
    brief.painPoints.forEach((p) => lines.push(`- ${p}`));
    if (brief.manualHoursPerWeek !== undefined) {
      lines.push(`\n- Horas manuales/semana: ${brief.manualHoursPerWeek} h`);
    }
    if (brief.errorRate) lines.push(`- Errores promedio: ${brief.errorRate}`);
    if (brief.costImpact) lines.push(`- Impacto estimado: ${brief.costImpact}`);
    lines.push("");
  }

  // Resultado Esperado
  if (brief.expectedOutcome || brief.kpiCandidates.length > 0) {
    lines.push("## Resultado Esperado");
    lines.push("");
    if (brief.expectedOutcome) lines.push(brief.expectedOutcome);
    if (brief.kpiCandidates.length > 0) {
      lines.push("");
      lines.push("**KPIs**:");
      brief.kpiCandidates.forEach((k) => lines.push(`- ${k}`));
    }
    lines.push("");
  }

  // Restricciones
  const hasConstraints =
    brief.deadline ||
    brief.budget ||
    brief.untouchableSystems.length > 0 ||
    brief.complianceRequirements.length > 0;

  if (hasConstraints) {
    lines.push("## Restricciones");
    lines.push("");
    if (brief.deadline) lines.push(`- **Fecha límite**: ${brief.deadline}`);
    if (brief.budget) lines.push(`- **Presupuesto**: ${brief.budget}`);
    if (brief.untouchableSystems.length > 0) {
      lines.push(`- **Sistemas intocables**: ${brief.untouchableSystems.join(", ")}`);
    }
    if (brief.complianceRequirements.length > 0) {
      lines.push(`- **Compliance**: ${brief.complianceRequirements.join(", ")}`);
    }
    lines.push("");
  }

  // Urgencia y próximo paso
  lines.push("## Próximo Paso");
  lines.push("");
  lines.push(`**Urgencia**: ${brief.urgency}`);
  if (brief.nextStepRecommendation) {
    lines.push(`\n**Recomendación**: ${brief.nextStepRecommendation}`);
  }
  lines.push("");

  // Extraction metadata
  lines.push("---");
  lines.push("");
  lines.push(`> **Completeness**: ${brief.completenessScore}%`);
  if (brief.extractionNotes.length > 0) {
    lines.push("> **Notas de extracción**:");
    brief.extractionNotes.forEach((n) => lines.push(`> - ${n}`));
  }
  lines.push("");

  return lines.join("\n");
}

// --- Agent handler ---

export const discoveryHandler: AgentHandler<DiscoveryInput, DiscoveryOutput> = async (
  input,
  ctx,
) => {
  // Step 1: Load and interpolate prompt
  const promptVars: Record<string, string> = {
    rawText: input.rawText,
    clientNameHint: input.clientNameHint ?? "not provided",
    sourceType: input.sourceType ?? "unknown",
  };

  const systemPrompt = await loadPrompt("discovery", promptVars);

  await ctx.logStep({
    stepName: "load-prompt",
    input: { agentName: "discovery", varsKeys: Object.keys(promptVars) },
    output: { promptLength: systemPrompt.length },
  });

  // Step 2: Extract structured brief via LLM
  const result = await llmGenerateObject({
    model: {
      provider: ctx.config.provider,
      model: ctx.config.model,
      temperature: ctx.config.temperature,
      maxTokens: ctx.config.maxTokens,
    },
    system: systemPrompt,
    prompt: input.rawText,
    schema: DiscoveryBriefSchema,
    schemaName: "DiscoveryBrief",
    schemaDescription: "Structured client intake brief extracted from unstructured text",
  });

  const brief = result.object;
  const clientSlug = generateClientSlug(brief.companyName);

  await ctx.logStep({
    stepName: "extract-brief",
    input: { rawTextLength: input.rawText.length },
    output: {
      companyName: brief.companyName,
      clientSlug,
      completenessScore: brief.completenessScore,
      fieldCount: Object.keys(brief).filter(
        (k) => brief[k as keyof typeof brief] !== undefined,
      ).length,
    },
    tokenUsage: result.tokenUsage,
  });

  return { brief, clientSlug };
};
