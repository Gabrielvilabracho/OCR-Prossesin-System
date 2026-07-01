import { describe, it, expect } from "vitest";
import { jaroWinkler, normalize } from "../intelligence/fuzzy-matcher";

// ============================================================
// normalize() — string normalization helper
// ============================================================

describe("normalize", () => {
  it("lowercases input", () => {
    expect(normalize("EMPRESA LIDA")).toBe("empresa lida");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalize("  empresa  ")).toBe("empresa");
  });

  it("removes punctuation characters", () => {
    expect(normalize("Empresa, Lda.")).toBe("empresa lda");
  });

  it("collapses multiple spaces into one", () => {
    expect(normalize("empresa   lda")).toBe("empresa lda");
  });

  it("handles empty string", () => {
    expect(normalize("")).toBe("");
  });

  it("handles string with only punctuation", () => {
    expect(normalize("...,,,---")).toBe("");
  });
});

// ============================================================
// jaroWinkler() — similarity score
// ============================================================

describe("jaroWinkler", () => {
  it("returns 1.0 for identical strings", () => {
    expect(jaroWinkler("empresa teste lda", "empresa teste lda")).toBe(1.0);
  });

  it("returns ~0.0 for completely unrelated strings", () => {
    const score = jaroWinkler("abc", "xyz");
    expect(score).toBeLessThan(0.6);
  });

  it("returns high score for transposition (near-match)", () => {
    // "MARTHA" vs "MARHTA" — classic Jaro example, score ~0.944
    const score = jaroWinkler("MARTHA", "MARHTA");
    expect(score).toBeGreaterThan(0.9);
  });

  it("returns perfect score when both strings are empty", () => {
    expect(jaroWinkler("", "")).toBe(1.0);
  });

  it("returns 0.0 when one string is empty and other is not", () => {
    expect(jaroWinkler("empresa", "")).toBe(0.0);
    expect(jaroWinkler("", "empresa")).toBe(0.0);
  });

  it("scores near-match names above 0.82 threshold", () => {
    // "Empresa Teste Lda" vs "Empresa Testa Lda" — one char diff
    const score = jaroWinkler("empresa teste lda", "empresa testa lda");
    expect(score).toBeGreaterThan(0.82);
  });

  it("scores clearly different names below auto-accept threshold", () => {
    // Different company, different characters
    const score = jaroWinkler("google inc", "microsoft corp");
    expect(score).toBeLessThan(0.82);
  });

  it("scores prefix-matching strings with Winkler boost above 0.95", () => {
    // Long common prefix boosts score
    const score = jaroWinkler("supermercado ribeiro", "supermercado ribeira");
    expect(score).toBeGreaterThan(0.95);
  });
});
