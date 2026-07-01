import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock AI SDK and providers BEFORE importing the module under test
vi.mock("ai", () => ({
  generateText: vi.fn(),
  generateObject: vi.fn(),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: vi.fn(() => {
    const modelFn = vi.fn((modelId: string) => ({ provider: "anthropic", modelId }));
    return modelFn;
  }),
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => {
    const modelFn = vi.fn((modelId: string) => ({ provider: "openai", modelId }));
    return modelFn;
  }),
}));

import { generateText, generateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import {
  resolveModel,
  llmGenerateText,
  llmGenerateObject,
  LLMConfigError,
  type ModelConfig,
} from "../llm";
import { z } from "zod";

const mockGenerateText = vi.mocked(generateText);
const mockGenerateObject = vi.mocked(generateObject);
const mockCreateAnthropic = vi.mocked(createAnthropic);
const mockCreateOpenAI = vi.mocked(createOpenAI);

describe("resolveModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an Anthropic model for provider 'anthropic'", () => {
    const config: ModelConfig = { provider: "anthropic", model: "claude-sonnet-4-5" };
    const model = resolveModel(config);

    expect(mockCreateAnthropic).toHaveBeenCalledOnce();
    expect(model).toBeDefined();
  });

  it("creates an OpenAI model for provider 'openai'", () => {
    const config: ModelConfig = { provider: "openai", model: "gpt-4o" };
    const model = resolveModel(config);

    expect(mockCreateOpenAI).toHaveBeenCalledOnce();
    expect(model).toBeDefined();
  });

  it("throws LLMConfigError for unknown provider", () => {
    const config = { provider: "gemini", model: "gemini-pro" } as unknown as ModelConfig;
    expect(() => resolveModel(config)).toThrow(LLMConfigError);
    expect(() => resolveModel(config)).toThrow(/gemini/);
  });
});

describe("llmGenerateText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns text and token usage from AI SDK response", async () => {
    mockGenerateText.mockResolvedValue({
      text: "Hello, world!",
      usage: { inputTokens: 10, outputTokens: 5 },
      finishReason: "stop",
    } as never);

    const result = await llmGenerateText({
      model: { provider: "anthropic", model: "claude-sonnet-4-5" },
      prompt: "Say hello",
    });

    expect(result.text).toBe("Hello, world!");
    expect(result.tokenUsage.promptTokens).toBe(10);
    expect(result.tokenUsage.completionTokens).toBe(5);
    expect(result.tokenUsage.totalTokens).toBe(15);
    expect(result.finishReason).toBe("stop");
  });

  it("computes totalTokens as promptTokens + completionTokens", async () => {
    mockGenerateText.mockResolvedValue({
      text: "Test",
      usage: { inputTokens: 30, outputTokens: 20 },
      finishReason: "stop",
    } as never);

    const result = await llmGenerateText({
      model: { provider: "anthropic", model: "claude-sonnet-4-5" },
      prompt: "Test prompt",
    });

    expect(result.tokenUsage.totalTokens).toBe(
      result.tokenUsage.promptTokens + result.tokenUsage.completionTokens,
    );
  });

  it("handles missing usage in response with zeros", async () => {
    mockGenerateText.mockResolvedValue({
      text: "No usage",
      usage: undefined,
      finishReason: "stop",
    } as never);

    const result = await llmGenerateText({
      model: { provider: "anthropic", model: "claude-sonnet-4-5" },
      prompt: "Prompt",
    });

    expect(result.tokenUsage.promptTokens).toBe(0);
    expect(result.tokenUsage.completionTokens).toBe(0);
    expect(result.tokenUsage.totalTokens).toBe(0);
  });

  it("passes system prompt to AI SDK", async () => {
    mockGenerateText.mockResolvedValue({
      text: "Result",
      usage: { inputTokens: 5, outputTokens: 5 },
      finishReason: "stop",
    } as never);

    await llmGenerateText({
      model: { provider: "anthropic", model: "claude-sonnet-4-5" },
      system: "You are helpful.",
      prompt: "Hello",
    });

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({ system: "You are helpful." }),
    );
  });

  it("propagates AI SDK errors without swallowing", async () => {
    mockGenerateText.mockRejectedValue(new Error("Rate limit exceeded"));

    await expect(
      llmGenerateText({
        model: { provider: "anthropic", model: "claude-sonnet-4-5" },
        prompt: "Hello",
      }),
    ).rejects.toThrow("Rate limit exceeded");
  });
});

describe("llmGenerateObject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const ScoreSchema = z.object({ score: z.number() });

  it("returns typed object and token usage", async () => {
    mockGenerateObject.mockResolvedValue({
      object: { score: 0.9 },
      usage: { inputTokens: 20, outputTokens: 10 },
      finishReason: "stop",
    } as never);

    const result = await llmGenerateObject({
      model: { provider: "anthropic", model: "claude-sonnet-4-5" },
      prompt: "Score this lead",
      schema: ScoreSchema,
    });

    expect(result.object.score).toBe(0.9);
    expect(result.tokenUsage.promptTokens).toBe(20);
    expect(result.tokenUsage.completionTokens).toBe(10);
    expect(result.tokenUsage.totalTokens).toBe(30);
  });

  it("computes totalTokens as sum", async () => {
    mockGenerateObject.mockResolvedValue({
      object: { score: 0.5 },
      usage: { inputTokens: 15, outputTokens: 8 },
      finishReason: "stop",
    } as never);

    const result = await llmGenerateObject({
      model: { provider: "openai", model: "gpt-4o" },
      prompt: "Score",
      schema: ScoreSchema,
    });

    expect(result.tokenUsage.totalTokens).toBe(
      result.tokenUsage.promptTokens + result.tokenUsage.completionTokens,
    );
  });

  it("passes schema to AI SDK generateObject", async () => {
    mockGenerateObject.mockResolvedValue({
      object: { score: 1.0 },
      usage: { inputTokens: 10, outputTokens: 5 },
      finishReason: "stop",
    } as never);

    await llmGenerateObject({
      model: { provider: "anthropic", model: "claude-sonnet-4-5" },
      prompt: "Score",
      schema: ScoreSchema,
    });

    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({ schema: ScoreSchema }),
    );
  });

  it("propagates AI SDK errors without swallowing", async () => {
    mockGenerateObject.mockRejectedValue(new Error("Schema validation failed"));

    await expect(
      llmGenerateObject({
        model: { provider: "anthropic", model: "claude-sonnet-4-5" },
        prompt: "Score",
        schema: ScoreSchema,
      }),
    ).rejects.toThrow("Schema validation failed");
  });

  it("handles missing usage with zeros", async () => {
    mockGenerateObject.mockResolvedValue({
      object: { score: 0.7 },
      usage: undefined,
      finishReason: "stop",
    } as never);

    const result = await llmGenerateObject({
      model: { provider: "anthropic", model: "claude-sonnet-4-5" },
      prompt: "Score",
      schema: ScoreSchema,
    });

    expect(result.tokenUsage.totalTokens).toBe(0);
  });
});
