import { describe, it, expect } from "vitest";
import { normalizeUnit } from "../intelligence/unit-normalizer";
import type { CanonicalUnit } from "../intelligence/unit-normalizer";

// ============================================================
// Spec S4: normalizeUnit() — pure function, vocabulary mapping
// ============================================================

describe("normalizeUnit — UN variants", () => {
  it("maps 'un' to UN", () => {
    expect(normalizeUnit("un")).toBe("UN");
  });

  it("maps 'und' to UN", () => {
    expect(normalizeUnit("und")).toBe("UN");
  });

  it("maps 'uds' to UN", () => {
    expect(normalizeUnit("uds")).toBe("UN");
  });

  it("maps 'u' to UN", () => {
    expect(normalizeUnit("u")).toBe("UN");
  });

  it("maps 'unid' to UN", () => {
    expect(normalizeUnit("unid")).toBe("UN");
  });

  it("maps 'unidade' to UN", () => {
    expect(normalizeUnit("unidade")).toBe("UN");
  });

  it("maps 'UN' (uppercase) to UN", () => {
    expect(normalizeUnit("UN")).toBe("UN");
  });
});

describe("normalizeUnit — KG variants", () => {
  it("maps 'kg' to KG", () => {
    expect(normalizeUnit("kg")).toBe("KG");
  });

  it("maps 'kgs' to KG", () => {
    expect(normalizeUnit("kgs")).toBe("KG");
  });

  it("maps 'kilogramo' to KG", () => {
    expect(normalizeUnit("kilogramo")).toBe("KG");
  });

  it("maps 'kilogramos' to KG", () => {
    expect(normalizeUnit("kilogramos")).toBe("KG");
  });

  it("maps 'kilo' to KG", () => {
    expect(normalizeUnit("kilo")).toBe("KG");
  });

  it("maps 'KG' (uppercase) to KG", () => {
    expect(normalizeUnit("KG")).toBe("KG");
  });
});

describe("normalizeUnit — G variants", () => {
  it("maps 'gr' to G", () => {
    expect(normalizeUnit("gr")).toBe("G");
  });

  it("maps 'grs' to G", () => {
    expect(normalizeUnit("grs")).toBe("G");
  });

  it("maps 'g' to G", () => {
    expect(normalizeUnit("g")).toBe("G");
  });

  it("maps 'gramo' to G", () => {
    expect(normalizeUnit("gramo")).toBe("G");
  });

  it("maps 'gramos' to G", () => {
    expect(normalizeUnit("gramos")).toBe("G");
  });

  it("maps 'gram' to G", () => {
    expect(normalizeUnit("gram")).toBe("G");
  });

  it("maps 'GR' (uppercase) to G", () => {
    expect(normalizeUnit("GR")).toBe("G");
  });
});

describe("normalizeUnit — L variants", () => {
  it("maps 'lt' to L", () => {
    expect(normalizeUnit("lt")).toBe("L");
  });

  it("maps 'lts' to L", () => {
    expect(normalizeUnit("lts")).toBe("L");
  });

  it("maps 'l' to L", () => {
    expect(normalizeUnit("l")).toBe("L");
  });

  it("maps 'litro' to L", () => {
    expect(normalizeUnit("litro")).toBe("L");
  });

  it("maps 'litros' to L", () => {
    expect(normalizeUnit("litros")).toBe("L");
  });

  it("maps 'litre' to L", () => {
    expect(normalizeUnit("litre")).toBe("L");
  });

  it("maps 'LT' (uppercase) to L", () => {
    expect(normalizeUnit("LT")).toBe("L");
  });
});

describe("normalizeUnit — ML variants", () => {
  it("maps 'ml' to ML", () => {
    expect(normalizeUnit("ml")).toBe("ML");
  });

  it("maps 'mililitro' to ML", () => {
    expect(normalizeUnit("mililitro")).toBe("ML");
  });

  it("maps 'ML' (uppercase) to ML", () => {
    expect(normalizeUnit("ML")).toBe("ML");
  });
});

describe("normalizeUnit — CAIXA variants", () => {
  it("maps 'cx' to CAIXA", () => {
    expect(normalizeUnit("cx")).toBe("CAIXA");
  });

  it("maps 'caixa' to CAIXA", () => {
    expect(normalizeUnit("caixa")).toBe("CAIXA");
  });

  it("maps 'caja' to CAIXA", () => {
    expect(normalizeUnit("caja")).toBe("CAIXA");
  });

  it("maps 'box' to CAIXA", () => {
    expect(normalizeUnit("box")).toBe("CAIXA");
  });

  it("maps 'CX' (uppercase) to CAIXA", () => {
    expect(normalizeUnit("CX")).toBe("CAIXA");
  });
});

describe("normalizeUnit — PACK variants", () => {
  it("maps 'pack' to PACK", () => {
    expect(normalizeUnit("pack")).toBe("PACK");
  });

  it("maps 'pck' to PACK", () => {
    expect(normalizeUnit("pck")).toBe("PACK");
  });

  it("maps 'paquete' to PACK", () => {
    expect(normalizeUnit("paquete")).toBe("PACK");
  });

  it("maps 'PACK' (uppercase) to PACK", () => {
    expect(normalizeUnit("PACK")).toBe("PACK");
  });
});

describe("normalizeUnit — null/unknown inputs", () => {
  it("returns null for null input", () => {
    expect(normalizeUnit(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(normalizeUnit(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(normalizeUnit("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(normalizeUnit("   ")).toBeNull();
  });

  it("returns null for unknown unit 'xyz'", () => {
    expect(normalizeUnit("xyz")).toBeNull();
  });

  it("returns null for 'pcs' (not in vocab)", () => {
    expect(normalizeUnit("pcs")).toBeNull();
  });
});

describe("normalizeUnit — case and whitespace handling", () => {
  it("is case-insensitive: 'Kg' → KG", () => {
    expect(normalizeUnit("Kg")).toBe("KG");
  });

  it("trims whitespace: ' kg ' → KG", () => {
    expect(normalizeUnit(" kg ")).toBe("KG");
  });

  it("trims and lowercases: '  UN  ' → UN", () => {
    expect(normalizeUnit("  UN  ")).toBe("UN");
  });
});

describe("normalizeUnit — CanonicalUnit type completeness", () => {
  it("returned values conform to CanonicalUnit type", () => {
    const validUnits: CanonicalUnit[] = ["UN", "KG", "G", "L", "ML", "CAIXA", "PACK"];
    const inputs = ["un", "kg", "g", "l", "ml", "cx", "pack"];
    for (let i = 0; i < inputs.length; i++) {
      const result = normalizeUnit(inputs[i]);
      expect(validUnits).toContain(result);
    }
  });
});
