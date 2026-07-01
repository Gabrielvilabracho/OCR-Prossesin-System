import { z } from "zod";

// --- Output schema: mirrors clients/_template/01-intake/brief.md ---

export const DiscoveryBriefSchema = z.object({
  // Empresa y Contexto
  companyName: z.string().min(1).describe("Company or organization name"),
  industry: z.string().optional().describe("Industry or sector"),
  teamSize: z.string().optional().describe("Team size or number of employees"),
  currentStack: z.array(z.string()).default([]).describe("Current tech stack, CRM, tools"),

  // Objetivo de Negocio
  businessObjective: z.string().optional().describe("What they want to achieve with automation"),

  // Proceso a Automatizar
  currentProcess: z.string().optional().describe("Description of the manual process today"),
  processSteps: z.array(z.string()).default([]).describe("Step-by-step breakdown of current process"),
  frequency: z.string().optional().describe("How often: daily, weekly, on-demand"),
  volume: z.string().optional().describe("Volume metrics: X records/day, Y emails/week"),

  // Dolor Actual
  painPoints: z.array(z.string()).default([]).describe("What hurts or fails in the current process"),
  manualHoursPerWeek: z.number().optional().describe("Estimated manual hours per week"),
  errorRate: z.string().optional().describe("Estimated error rate percentage"),
  costImpact: z.string().optional().describe("Estimated monthly cost impact"),

  // Resultado Esperado
  expectedOutcome: z.string().optional().describe("What success looks like for the client"),
  kpiCandidates: z.array(z.string()).default([]).describe("Measurable KPIs the client can track"),

  // Restricciones
  deadline: z.string().optional().describe("Hard deadline if any"),
  budget: z.string().optional().describe("Budget constraints if known"),
  untouchableSystems: z.array(z.string()).default([]).describe("Systems that cannot be modified"),
  complianceRequirements: z.array(z.string()).default([]).describe("GDPR, HIPAA, etc."),

  // Sistemas Involucrados
  systemsInvolved: z
    .array(
      z.object({
        name: z.string(),
        type: z.string().optional().describe("API, DB, UI, etc."),
        hasCredentials: z.boolean().optional(),
      }),
    )
    .default([])
    .describe("Systems and integrations involved"),

  // Urgencia y siguiente paso
  urgency: z.enum(["high", "medium", "low"]).default("medium").describe("Overall urgency level"),
  nextStepRecommendation: z.string().optional().describe("Recommended next action"),

  // Meta
  completenessScore: z
    .number()
    .min(0)
    .max(100)
    .describe("Self-assessed percentage of fields successfully extracted (0-100)"),
  extractionNotes: z
    .array(z.string())
    .default([])
    .describe("Notes about ambiguous, missing, or uncertain extractions"),
});

export type DiscoveryBrief = z.infer<typeof DiscoveryBriefSchema>;

// --- Input schema ---

export const DiscoveryInputSchema = z.object({
  rawText: z
    .string()
    .min(50, "Raw text must be at least 50 characters for meaningful extraction"),
  clientNameHint: z
    .string()
    .optional()
    .describe("Optional hint for the client/company name"),
  sourceType: z
    .enum(["meeting_notes", "email", "transcript", "form", "other"])
    .optional()
    .describe("Type of source material"),
});

export type DiscoveryInput = z.infer<typeof DiscoveryInputSchema>;

// --- Output wrapper ---

export type DiscoveryOutput = {
  brief: DiscoveryBrief;
  clientSlug: string;
};
