import { describe, it, expect } from "vitest";
import { formatDuration, truncate, slugify } from "./format";

describe("formatDuration", () => {
  it("returns milliseconds for values under 1 second", () => {
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(500)).toBe("500ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  it("returns seconds for values under 1 minute", () => {
    expect(formatDuration(1000)).toBe("1s");
    expect(formatDuration(45_000)).toBe("45s");
  });

  it("returns minutes and seconds", () => {
    expect(formatDuration(125_000)).toBe("2m 5s");
    expect(formatDuration(60_000)).toBe("1m");
  });

  it("returns hours, minutes, and seconds", () => {
    expect(formatDuration(3_661_000)).toBe("1h 1m 1s");
    expect(formatDuration(7_200_000)).toBe("2h");
  });

  it("handles negative values", () => {
    expect(formatDuration(-100)).toBe("0ms");
  });
});

describe("truncate", () => {
  it("returns the string unchanged if within limit", () => {
    expect(truncate("hi", 10)).toBe("hi");
    expect(truncate("exact", 5)).toBe("exact");
  });

  it("truncates with ellipsis when exceeding limit", () => {
    expect(truncate("hello world", 8)).toBe("hello...");
    expect(truncate("abcdefgh", 6)).toBe("abc...");
  });

  it("handles maxLength < 4 without ellipsis", () => {
    expect(truncate("hello", 3)).toBe("hel");
  });
});

describe("slugify", () => {
  it("converts to lowercase kebab-case", () => {
    expect(slugify("My Task Name")).toBe("my-task-name");
  });

  it("removes special characters", () => {
    expect(slugify("hello_world 123!")).toBe("hello-world-123");
  });

  it("collapses multiple separators", () => {
    expect(slugify("a--b__c  d")).toBe("a-b-c-d");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify(" -hello- ")).toBe("hello");
  });

  it("handles empty string", () => {
    expect(slugify("")).toBe("");
  });
});
