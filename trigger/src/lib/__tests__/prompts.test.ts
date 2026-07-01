import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

import { readFile } from "node:fs/promises";
import {
  resolvePromptPath,
  interpolatePrompt,
  loadPrompt,
  PromptNotFoundError,
  PromptVariableMissingError,
} from "../prompts";

const mockReadFile = vi.mocked(readFile);

describe("resolvePromptPath", () => {
  it("returns a path containing agents/{agentName}/prompt.md", () => {
    const path = resolvePromptPath("lead-qualifier");
    expect(path).toContain("agents/lead-qualifier/prompt.md");
  });

  it("returns an absolute path", () => {
    const path = resolvePromptPath("test-agent");
    expect(path.startsWith("/")).toBe(true);
  });

  it("uses different agent names correctly", () => {
    const path1 = resolvePromptPath("agent-a");
    const path2 = resolvePromptPath("agent-b");
    expect(path1).toContain("agent-a");
    expect(path2).toContain("agent-b");
    expect(path1).not.toBe(path2);
  });
});

describe("interpolatePrompt", () => {
  it("replaces all {{variable}} placeholders", () => {
    const result = interpolatePrompt(
      "Qualify the lead with id {{leadId}} for client {{clientName}}.",
      { leadId: "123", clientName: "Acme" },
    );
    expect(result).toBe("Qualify the lead with id 123 for client Acme.");
  });

  it("handles multiple occurrences of the same variable", () => {
    const result = interpolatePrompt("Hello {{name}}, nice to meet you {{name}}!", {
      name: "Alice",
    });
    expect(result).toBe("Hello Alice, nice to meet you Alice!");
  });

  it("handles template with no variables (passthrough)", () => {
    const template = "No placeholders here.";
    expect(interpolatePrompt(template, {})).toBe(template);
    expect(interpolatePrompt(template, { extra: "ignored" })).toBe(template);
  });

  it("ignores extra keys in vars that are not in template", () => {
    const result = interpolatePrompt("Hello {{name}}!", {
      name: "Bob",
      unusedVar: "ignored",
    });
    expect(result).toBe("Hello Bob!");
  });

  it("throws PromptVariableMissingError when a placeholder has no matching var", () => {
    expect(() =>
      interpolatePrompt("Hello {{name}} from {{company}}!", { name: "Bob" }),
    ).toThrow(PromptVariableMissingError);

    expect(() =>
      interpolatePrompt("Hello {{name}} from {{company}}!", { name: "Bob" }),
    ).toThrow(/company/);
  });

  it("lists all missing variables in the error", () => {
    let error: PromptVariableMissingError | undefined;
    try {
      interpolatePrompt("{{a}} and {{b}} and {{c}}", { a: "1" });
    } catch (e) {
      error = e as PromptVariableMissingError;
    }
    expect(error).toBeInstanceOf(PromptVariableMissingError);
    expect(error?.message).toContain("b");
    expect(error?.message).toContain("c");
  });
});

describe("loadPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads and interpolates a prompt file successfully", async () => {
    mockReadFile.mockResolvedValue(
      "Qualify the lead with id {{leadId}} for client {{clientName}}." as never,
    );

    const result = await loadPrompt("lead-qualifier", {
      leadId: "123",
      clientName: "Acme",
    });

    expect(result).toBe("Qualify the lead with id 123 for client Acme.");
    expect(mockReadFile).toHaveBeenCalledOnce();
    expect(mockReadFile).toHaveBeenCalledWith(
      expect.stringContaining("lead-qualifier"),
      "utf-8",
    );
  });

  it("throws PromptNotFoundError when file does not exist", async () => {
    mockReadFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

    await expect(loadPrompt("nonexistent-agent", {})).rejects.toThrow(PromptNotFoundError);
    await expect(loadPrompt("nonexistent-agent", {})).rejects.toThrow(/nonexistent-agent/);
  });

  it("throws PromptVariableMissingError when a variable is missing", async () => {
    mockReadFile.mockResolvedValue(
      "Template with {{leadId}} and {{clientName}}." as never,
    );

    await expect(loadPrompt("lead-qualifier", { leadId: "123" })).rejects.toThrow(
      PromptVariableMissingError,
    );
  });

  it("returns template unchanged when no vars and no placeholders", async () => {
    const template = "This is a static prompt with no variables.";
    mockReadFile.mockResolvedValue(template as never);

    const result = await loadPrompt("simple-agent");
    expect(result).toBe(template);
  });

  it("throws PromptVariableMissingError when template has placeholders but no vars passed", async () => {
    mockReadFile.mockResolvedValue("Hello {{name}}!" as never);

    await expect(loadPrompt("agent-with-vars")).rejects.toThrow(PromptVariableMissingError);
  });

  it("ignores extra vars not in template", async () => {
    mockReadFile.mockResolvedValue("Hello {{name}}!" as never);

    const result = await loadPrompt("test-agent", {
      name: "World",
      extra: "ignored",
    });
    expect(result).toBe("Hello World!");
  });
});
