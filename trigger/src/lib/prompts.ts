import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

// --- Errors ---

export class PromptNotFoundError extends Error {
  constructor(agentName: string) {
    super(`Prompt file not found for agent: "${agentName}"`);
    this.name = "PromptNotFoundError";
  }
}

export class PromptVariableMissingError extends Error {
  constructor(missingVars: string[]) {
    super(`Missing template variables: ${missingVars.map((v) => `"${v}"`).join(", ")}`);
    this.name = "PromptVariableMissingError";
  }
}

// --- Types ---

export type PromptVars = Record<string, string>;

// --- Path resolution ---

/**
 * Resolves the path to an agent's prompt file.
 * Base path: `agents/{agentName}/prompt.md` from project root.
 * Project root is two levels up from `trigger/src/lib/`.
 */
export function resolvePromptPath(agentName: string): string {
  // __dirname equivalent for ESM: resolve relative to this file's location
  // This file is at trigger/src/lib/prompts.ts
  // Project root is three levels up: lib -> src -> trigger -> project root
  const thisFileDir = resolve(fileURLToPath(import.meta.url), "..");
  const projectRoot = resolve(thisFileDir, "..", "..", "..");
  return join(projectRoot, "agents", agentName, "prompt.md");
}

// --- Interpolation ---

/**
 * Interpolates variables into a prompt string.
 * Exported separately for testing and inline prompt use.
 * Throws PromptVariableMissingError if any {{placeholder}} has no matching var.
 */
export function interpolatePrompt(template: string, vars: PromptVars): string {
  const placeholderPattern = /\{\{(\w+)\}\}/g;
  const foundVars = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = placeholderPattern.exec(template)) !== null) {
    foundVars.add(match[1]);
  }

  const missingVars = [...foundVars].filter((v) => !(v in vars));
  if (missingVars.length > 0) {
    throw new PromptVariableMissingError(missingVars);
  }

  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? "");
}

// --- Loader ---

/**
 * Loads a prompt file and replaces {{variable}} placeholders.
 * Throws if the file doesn't exist or a referenced variable is missing.
 */
export async function loadPrompt(
  agentName: string,
  vars?: PromptVars,
): Promise<string> {
  const promptPath = resolvePromptPath(agentName);

  let template: string;
  try {
    template = await readFile(promptPath, "utf-8");
  } catch {
    throw new PromptNotFoundError(agentName);
  }

  if (!vars || Object.keys(vars).length === 0) {
    // Still validate: if template has placeholders and no vars, throw
    const hasPlaceholders = /\{\{(\w+)\}\}/.test(template);
    if (hasPlaceholders) {
      return interpolatePrompt(template, vars ?? {});
    }
    return template;
  }

  return interpolatePrompt(template, vars);
}
