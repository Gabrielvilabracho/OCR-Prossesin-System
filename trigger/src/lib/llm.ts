import { generateText, generateObject } from "ai";
import type { LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { z } from "zod";
import type { LLMProvider, LLMModel } from "./agent-types";

// --- Errors ---

export class LLMConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMConfigError";
  }
}

// --- Model resolution ---

export type ModelConfig = {
  provider: LLMProvider;
  model: LLMModel;
  temperature?: number;
  maxTokens?: number;
};

export function resolveModel(config: ModelConfig): LanguageModel {
  if (config.provider === "anthropic") {
    const anthropic = createAnthropic();
    // @ai-sdk/anthropic v1 still types models as LanguageModelV1 while AI SDK v5
    // core expects LanguageModelV2 — cast is safe at runtime
    return anthropic(config.model) as unknown as LanguageModel;
  }
  if (config.provider === "openai") {
    const openai = createOpenAI();
    return openai(config.model) as unknown as LanguageModel;
  }
  // TypeScript narrows to never here, but we guard for runtime safety
  throw new LLMConfigError(
    `Unknown provider: "${String(config.provider)}". Must be "anthropic" or "openai".`,
  );
}

// --- Text generation ---

export type GenerateTextOptions = {
  model: ModelConfig;
  system?: string;
  prompt: string;
  messages?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
};

export type GenerateTextResponse = {
  text: string;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
};

export async function llmGenerateText(
  options: GenerateTextOptions,
): Promise<GenerateTextResponse> {
  const model = resolveModel(options.model);

  const result = await generateText({
    model,
    system: options.system,
    prompt: options.prompt,
    maxOutputTokens: options.model.maxTokens,
    temperature: options.model.temperature,
  });

  const promptTokens = result.usage?.inputTokens ?? 0;
  const completionTokens = result.usage?.outputTokens ?? 0;

  return {
    text: result.text,
    tokenUsage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    },
    finishReason: result.finishReason,
  };
}

// --- Structured object generation ---

export type GenerateObjectOptions<T extends z.ZodType> = {
  model: ModelConfig;
  system?: string;
  prompt: string;
  schema: T;
  schemaName?: string;
  schemaDescription?: string;
};

export type GenerateObjectResponse<T> = {
  object: T;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
};

export async function llmGenerateObject<T extends z.ZodType>(
  options: GenerateObjectOptions<T>,
): Promise<GenerateObjectResponse<z.infer<T>>> {
  const model = resolveModel(options.model);

  const result = await generateObject({
    model,
    system: options.system,
    prompt: options.prompt,
    schema: options.schema,
    schemaName: options.schemaName,
    schemaDescription: options.schemaDescription,
    maxOutputTokens: options.model.maxTokens,
    temperature: options.model.temperature,
  });

  const promptTokens = result.usage?.inputTokens ?? 0;
  const completionTokens = result.usage?.outputTokens ?? 0;

  return {
    object: result.object,
    tokenUsage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    },
    finishReason: result.finishReason,
  };
}
