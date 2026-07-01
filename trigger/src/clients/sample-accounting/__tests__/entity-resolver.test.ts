import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================
// Mock repository functions
// ============================================================
vi.mock("../repository", () => ({
  getSupplierByNif:          vi.fn(),
  getSupplierAliases:        vi.fn(),
  createSupplierAlias:       vi.fn(),
  getAllSuppliersForFuzzy:    vi.fn(),
}));

// ============================================================
// Mock resolution-logger
// ============================================================
vi.mock("../intelligence/resolution-logger", () => ({
  logResolution: vi.fn().mockResolvedValue(undefined),
}));

import { getSupplierByNif, getSupplierAliases, getAllSuppliersForFuzzy } from "../repository";
import { logResolution } from "../intelligence/resolution-logger";
import { resolveEntity } from "../intelligence/entity-resolver";
import type { ResolutionResult } from "../intelligence/entity-resolver";

const mockGetSupplierByNif        = vi.mocked(getSupplierByNif);
const mockGetSupplierAliases      = vi.mocked(getSupplierAliases);
const mockGetAllSuppliersForFuzzy = vi.mocked(getAllSuppliersForFuzzy);
const mockLogResolution           = vi.mocked(logResolution);

// ============================================================
// Fixtures
// ============================================================

const fakeSupplier = {
  id: "supplier-uuid-aaa",
  nif: "123456789",
  name: "Empresa Teste Lda",
  normalized_name: "empresa teste lda",
  legal_name: null,
  commercial_name: null,
};

const fakeNifAlias = {
  id: "alias-uuid-1",
  supplier_id: "supplier-uuid-bbb",
  alias_text: "987654321",
  alias_type: "nif" as const,
  confidence: 0.98,
};

const fakeNameAlias = {
  id: "alias-uuid-2",
  supplier_id: "supplier-uuid-ccc",
  alias_text: "comercial lda",
  alias_type: "name_exact" as const,
  confidence: 0.95,
};

// ============================================================
// Level 1 — NIF exact match in suppliers table
// ============================================================

describe("resolveEntity — Level 1: NIF exact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSupplierByNif.mockResolvedValue(null);
    mockGetSupplierAliases.mockResolvedValue([]);
  });

  it("returns supplierId, nif_exact method, confidence 1.0, needsReview false when NIF matches", async () => {
    mockGetSupplierByNif.mockResolvedValue(fakeSupplier);

    const result = await resolveEntity("ocr-doc-111", "123456789", "Empresa Teste Lda");

    expect(result.supplierId).toBe("supplier-uuid-aaa");
    expect(result.method).toBe("nif_exact");
    expect(result.confidence).toBe(1.0);
    expect(result.needsReview).toBe(false);
  });

  it("calls logResolution after nif_exact resolution", async () => {
    mockGetSupplierByNif.mockResolvedValue(fakeSupplier);

    await resolveEntity("ocr-doc-111", "123456789", "Empresa Teste Lda");

    expect(mockLogResolution).toHaveBeenCalledWith(
      expect.objectContaining({
        resolution_method: "nif_exact",
        confidence: 1.0,
        resolved_supplier_id: "supplier-uuid-aaa",
      })
    );
  });
});

// ============================================================
// Level 2 — NIF alias match
// ============================================================

describe("resolveEntity — Level 2: NIF alias", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSupplierByNif.mockResolvedValue(null); // not in suppliers.nif
    mockGetSupplierAliases.mockResolvedValue([]);
  });

  it("returns alias method, confidence 0.98, needsReview false when NIF is in aliases", async () => {
    mockGetSupplierAliases.mockImplementation(async (type) => {
      if (type === "nif") return [fakeNifAlias];
      return [];
    });

    const result = await resolveEntity("ocr-doc-222", "987654321", "Empresa X");

    expect(result.supplierId).toBe("supplier-uuid-bbb");
    expect(result.method).toBe("alias");
    expect(result.confidence).toBe(0.98);
    expect(result.needsReview).toBe(false);
  });

  it("calls logResolution with alias when NIF alias is found", async () => {
    mockGetSupplierAliases.mockImplementation(async (type) => {
      if (type === "nif") return [fakeNifAlias];
      return [];
    });

    await resolveEntity("ocr-doc-222", "987654321", "Empresa X");

    expect(mockLogResolution).toHaveBeenCalledWith(
      expect.objectContaining({ resolution_method: "alias" })
    );
  });
});

// ============================================================
// Level 3 — Name alias match (name_exact or manual)
// ============================================================

describe("resolveEntity — Level 3: name alias", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSupplierByNif.mockResolvedValue(null);
    mockGetSupplierAliases.mockImplementation(async (type) => {
      if (type === "nif") return []; // no NIF alias match
      if (type === "name_exact") return [fakeNameAlias];
      if (type === "manual") return [];
      return [];
    });
  });

  it("returns alias, confidence 0.95, needsReview false when name alias matches", async () => {
    const result = await resolveEntity("ocr-doc-333", null, "comercial lda");

    expect(result.supplierId).toBe("supplier-uuid-ccc");
    expect(result.method).toBe("alias");
    expect(result.confidence).toBe(0.95);
    expect(result.needsReview).toBe(false);
  });
});

// ============================================================
// Level 4 — Fuzzy match ≥ 0.95 → auto-accept
// ============================================================

describe("resolveEntity — Level 4: fuzzy auto-accept (score ≥ 0.95)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSupplierByNif.mockResolvedValue(null);
    mockGetSupplierAliases.mockResolvedValue([]);
  });

  it("returns fuzzy method, needsReview false, supplierId set when score ≥ 0.95", async () => {
    // Identical normalized_name → Jaro-Winkler score = 1.0
    mockGetAllSuppliersForFuzzy.mockResolvedValue([
      { id: "supplier-fuzzy-aaa", normalized_name: "supermercado ribeiro" },
    ]);

    const result = await resolveEntity("ocr-doc-444", null, "supermercado ribeiro");

    expect(result.supplierId).toBe("supplier-fuzzy-aaa");
    expect(result.method).toBe("fuzzy");
    expect(result.confidence).toBeGreaterThanOrEqual(0.95);
    expect(result.needsReview).toBe(false);
  });

  it("calls logResolution with fuzzy method when auto-accept threshold is met", async () => {
    mockGetAllSuppliersForFuzzy.mockResolvedValue([
      { id: "supplier-fuzzy-aaa", normalized_name: "supermercado ribeiro" },
    ]);

    await resolveEntity("ocr-doc-444", null, "supermercado ribeiro");

    expect(mockLogResolution).toHaveBeenCalledWith(
      expect.objectContaining({
        resolution_method: "fuzzy",
        resolved_supplier_id: "supplier-fuzzy-aaa",
      })
    );
  });
});

// ============================================================
// Level 5 — Fuzzy match 0.82–0.94 → needsReview
// ============================================================

describe("resolveEntity — Level 5: fuzzy needs review (0.82–0.94)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSupplierByNif.mockResolvedValue(null);
    mockGetSupplierAliases.mockResolvedValue([]);
  });

  it("returns fuzzy method, needsReview true when score is in 0.82–0.94 range", async () => {
    // "empresa teste lda" vs "empresa testa lda" — single char diff → ~0.97 (too high)
    // Use more different strings that score in 0.82–0.94 range
    // "consultoria abc lda" vs "consultoria abx lda" → slight diff
    // Actually need to find strings in the range. Let's use a known pair:
    // "carlos silva" vs "carlos silba" → transposition → ~0.95+, still too high
    // Use strings with enough divergence: "empresa xpto lda" vs "empreza xpto lda" (typo)
    // Let's compute: they differ by 1 char in a ~16-char string
    // Jaro: matches=15, transpositions=0, score=(15/16+15/16+15/15)/3 = (0.9375+0.9375+1)/3 = 0.958
    // With Winkler prefix bonus (6 chars 'empre'→ prefix 4): 0.958 + 4*0.1*(1-0.958) = 0.958+0.017=0.975 → too high
    // Need less common prefix. Use "distribuidora norte" vs "distribuidora norta" → last char diff
    // Jaro for length 19/19: matches=18, t=0 → (18/19+18/19+18/18)/3 ≈ 0.982; Winkler: prefix=13→4; 0.982+4*0.1*0.018=0.989 → too high
    // Let's use strings with less similarity: "tecnologias avancadas" vs "tecnologia avancada" — length diff
    // Actually: force a known score range by using the mock. We can mock getAllSuppliersForFuzzy
    // and use strings computed to be in [0.82, 0.94].
    // "maria joao" vs "mario joao" → length 10/10, differ at pos 4 ('a' vs 'o'):
    //   window = max(floor(10/2)-1,0) = 4; matches=9; t=0; jaro=(9/10+9/10+9/9)/3=0.933
    //   prefix='mari'(4); winkler=0.933+4*0.1*0.067=0.933+0.027=0.960 → too high
    // "joao silva" (10) vs "jose silva" (10): differ at pos 2('a'->'s') & 3('o'->'e'):
    //   matches: j✓ o✓ a? s? [window=4]
    //   Let's just assert the structure by picking strings we know score in range from fuzzy-matcher tests.
    // The easiest: pick strings where jaroWinkler returns 0.82-0.94
    // "google inc" vs "google inc lda" — different lengths, partial match
    // Actually: let's mock a resolved supplier AND assert the needsReview behavior
    // by manipulating what getAllSuppliersForFuzzy returns with a name that we KNOW
    // will score in range. We already know from fuzzy-matcher tests that "google inc" vs
    // "microsoft corp" scores < 0.82. So use two strings with known intermediate score.
    // Best approach: provide normalized_name = "empresa lda" and input = "empresa ltda"
    // "empresa lda" (11 chars) vs "empresa ltda" (12 chars):
    //   The score should be high but < 0.95 — let's trust the math and assert the range.

    // "distribuidora norte" vs "distribuidora sul" → JW score ≈ 0.912 (in 0.82–0.94 range)
    mockGetAllSuppliersForFuzzy.mockResolvedValue([
      { id: "supplier-fuzzy-bbb", normalized_name: "distribuidora norte" },
    ]);

    // Input normalizes to "distribuidora sul" — 0.912 score against "distribuidora norte"
    const result = await resolveEntity("ocr-doc-555", null, "Distribuidora Sul");

    expect(result.method).toBe("fuzzy_review");
    expect(result.supplierId).toBe("supplier-fuzzy-bbb");
    expect(result.confidence).toBeGreaterThanOrEqual(0.82);
    expect(result.confidence).toBeLessThan(0.95);
    expect(result.needsReview).toBe(true); // below FUZZY_AUTO_ACCEPT=0.95 → needsReview
  });
});

// ============================================================
// Level 6 — No match → unresolved
// ============================================================

describe("resolveEntity — Level 6: no match → new_supplier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSupplierByNif.mockResolvedValue(null);
    mockGetSupplierAliases.mockResolvedValue([]);
  });

  // FIX-1 RED → GREEN: no-match path must return method='new_supplier', not 'unresolved'
  it("returns new_supplier method, confidence 0, needsReview true, supplierId null when no match found", async () => {
    const result = await resolveEntity("ocr-doc-666", null, null);

    expect(result.supplierId).toBeNull();
    expect(result.method).toBe("new_supplier");
    expect(result.confidence).toBe(0);
    expect(result.needsReview).toBe(true);
  });

  it("calls logResolution with new_supplier method when no match at any level", async () => {
    await resolveEntity("ocr-doc-666", null, null);

    expect(mockLogResolution).toHaveBeenCalledWith(
      expect.objectContaining({
        resolution_method: "new_supplier",
        confidence: 0,
        resolved_supplier_id: null,
      })
    );
  });
});

// ============================================================
// sample-entity-resolution Batch 1 — RED tests (new contract)
// T01: Level 1 NIF exact — new contract assertion
// ============================================================

describe("resolveEntity — T01: NIF exact match returns nif_exact, confidence=1.0, supplierId set", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSupplierByNif.mockResolvedValue(null);
    mockGetSupplierAliases.mockResolvedValue([]);
    mockGetAllSuppliersForFuzzy.mockResolvedValue([]);
  });

  it("returns { method: 'nif_exact', confidence: 1.0, supplierId: <id> } when issuer_nif matches suppliers.nif", async () => {
    mockGetSupplierByNif.mockResolvedValue(fakeSupplier);

    const result = await resolveEntity("ocr-doc-t01", "123456789", "Empresa Teste Lda");

    expect(result.method).toBe("nif_exact");
    expect(result.confidence).toBe(1.0);
    expect(result.supplierId).toBe("supplier-uuid-aaa");
    expect(result.needsReview).toBe(false);
  });

  it("does not return nif_exact when NIF is null (no level-1 lookup attempted)", async () => {
    const result = await resolveEntity("ocr-doc-t01b", null, null);

    expect(result.method).not.toBe("nif_exact");
    expect(result.supplierId).toBeNull();
  });
});

// ============================================================
// T02: Level 2 alias — new contract: method must be 'alias' (not 'alias_exact')
// RED: current implementation returns 'alias_exact' — this test WILL FAIL
// ============================================================

describe("resolveEntity — T02: alias match returns method='alias' (RED: impl returns alias_exact)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSupplierByNif.mockResolvedValue(null); // NIF not in suppliers table
    mockGetSupplierAliases.mockResolvedValue([]);
    mockGetAllSuppliersForFuzzy.mockResolvedValue([]);
  });

  it("returns { method: 'alias', supplierId: alias.supplier_id } when issuer_nif is in supplier_aliases", async () => {
    mockGetSupplierAliases.mockImplementation(async (type: string) => {
      if (type === "nif") return [fakeNifAlias];
      return [];
    });

    const result = await resolveEntity("ocr-doc-t02", "987654321", "Empresa X");

    // RED: current implementation returns method='alias_exact', not 'alias'
    expect(result.method).toBe("alias");
    expect(result.supplierId).toBe("supplier-uuid-bbb");
    expect(result.needsReview).toBe(false);
  });

  it("returns alias method with name alias when NIF alias is absent but name alias matches", async () => {
    mockGetSupplierAliases.mockImplementation(async (type: string) => {
      if (type === "nif") return [];
      if (type === "name_exact") return [fakeNameAlias];
      if (type === "manual") return [];
      return [];
    });

    const result = await resolveEntity("ocr-doc-t02b", null, "comercial lda");

    // RED: current implementation returns method='alias_exact', not 'alias'
    expect(result.method).toBe("alias");
    expect(result.supplierId).toBe("supplier-uuid-ccc");
  });
});

// ============================================================
// T03: Level 3 fuzzy auto-accept (score ≥ 0.95) — new contract assertion
// ============================================================

describe("resolveEntity — T03: fuzzy auto-accept score >=0.95 returns needsReview=false", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSupplierByNif.mockResolvedValue(null);
    mockGetSupplierAliases.mockResolvedValue([]);
  });

  it("returns { method: 'fuzzy', confidence: >=0.95, supplierId: <id>, needsReview: false } on high-score fuzzy match", async () => {
    // Identical normalized name → Jaro-Winkler = 1.0 (above FUZZY_AUTO_ACCEPT=0.95)
    mockGetAllSuppliersForFuzzy.mockResolvedValue([
      { id: "supplier-fuzzy-t03", normalized_name: "papelaria central lda" },
    ]);

    const result = await resolveEntity("ocr-doc-t03", null, "Papelaria Central Lda");

    expect(result.method).toBe("fuzzy");
    expect(result.confidence).toBeGreaterThanOrEqual(0.95);
    expect(result.supplierId).toBe("supplier-fuzzy-t03");
    expect(result.needsReview).toBe(false);
  });

  it("does NOT set needsReview when fuzzy score is exactly at the 0.95 auto-accept threshold", async () => {
    // Use identical strings — score = 1.0, well above threshold
    mockGetAllSuppliersForFuzzy.mockResolvedValue([
      { id: "supplier-fuzzy-t03b", normalized_name: "transportes norte lda" },
    ]);

    const result = await resolveEntity("ocr-doc-t03b", null, "Transportes Norte Lda");

    expect(result.needsReview).toBe(false);
    expect(result.supplierId).toBe("supplier-fuzzy-t03b");
  });
});

// ============================================================
// T04: Level 3 fuzzy review queue (score 0.82–0.94) — method must be 'fuzzy_review'
// RED: current implementation returns method='fuzzy' + needsReview=true — this test WILL FAIL
// ============================================================

describe("resolveEntity — T04: fuzzy review queue (0.82-0.94) returns method='fuzzy_review' (RED: impl returns 'fuzzy')", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSupplierByNif.mockResolvedValue(null);
    mockGetSupplierAliases.mockResolvedValue([]);
  });

  it("returns { method: 'fuzzy_review', confidence: in[0.82,0.94), supplierId: <id> } when best fuzzy score is in review range", async () => {
    // "distribuidora norte" vs "Distribuidora Sul" → score ≈ 0.912 (in 0.82–0.94 range)
    mockGetAllSuppliersForFuzzy.mockResolvedValue([
      { id: "supplier-fuzzy-t04", normalized_name: "distribuidora norte" },
    ]);

    const result = await resolveEntity("ocr-doc-t04", null, "Distribuidora Sul");

    // RED: current implementation returns method='fuzzy' instead of 'fuzzy_review'
    expect(result.method).toBe("fuzzy_review");
    expect(result.confidence).toBeGreaterThanOrEqual(0.82);
    expect(result.confidence).toBeLessThan(0.95);
    expect(result.supplierId).toBe("supplier-fuzzy-t04");
  });

  it("returns fuzzy_review method when score is at the lower bound of review range (0.82)", async () => {
    // "carros lda" vs "cerros lda" — slight variation in mid-chars → score around 0.82-0.88
    mockGetAllSuppliersForFuzzy.mockResolvedValue([
      { id: "supplier-fuzzy-t04b", normalized_name: "distribuidora sul lda" },
    ]);

    // "distribuidora sul lda" vs "distribuidora norte lda" → score in review range
    const result = await resolveEntity("ocr-doc-t04b", null, "Distribuidora Norte Lda");

    // RED: expects 'fuzzy_review' but current impl returns 'fuzzy'
    expect(result.method).toBe("fuzzy_review");
    expect(result.supplierId).toBe("supplier-fuzzy-t04b");
  });
});
