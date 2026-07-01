import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================
// Mock @supabase/supabase-js before importing the module
// ============================================================

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

vi.mock("../repository", () => ({
  resolveIssuerNifByName: vi.fn(),
}));

import { createClient } from "@supabase/supabase-js";
import { resolveReceiverByNif, enrichReceiverName, enrichIssuerNif } from "../client-resolver";
import { resolveIssuerNifByName } from "../repository"; // mocked via vi.mock("../repository")
import type { InvoiceFields } from "../schema";

const mockCreateClient = vi.mocked(createClient);

// ============================================================
// Supabase chain factory
// ============================================================

function makeDb(result: { data: { legal_name: string } | null; error: null }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  return { from: vi.fn().mockReturnValue(chain) };
}

// ============================================================
// T5.6 RED: resolver selects legal_name column (renamed from name in migration 027)
// ============================================================

describe("resolveReceiverByNif — selects legal_name column", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SUPABASE_URL"] = "https://test.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-key";
  });

  it("queries noxx_clients.legal_name (not name) and returns the value", async () => {
    // Mock returns { legal_name: 'Estrela' } — if resolver still uses 'name' it returns undefined
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { legal_name: "Estrela Didática Unipessoal Lda" }, error: null }),
    };
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue(chain) } as any);

    const result = await resolveReceiverByNif("516315242");

    expect(result).toBe("Estrela Didática Unipessoal Lda");
    expect(chain.select).toHaveBeenCalledWith("legal_name");
  });

  it("returns null when legal_name is null in the DB row", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { legal_name: null }, error: null }),
    };
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue(chain) } as any);

    const result = await resolveReceiverByNif("516315242");

    expect(result).toBeNull();
  });
});

// ============================================================
// Tests
// ============================================================

describe("resolveReceiverByNif", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SUPABASE_URL"] = "https://test.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-key";
  });

  describe("NIF exists in noxx_clients", () => {
    it("returns the registered legal name when NIF matches", async () => {
      mockCreateClient.mockReturnValue(makeDb({ data: { legal_name: "Estrela Didática Unipessoal Lda" }, error: null }) as any);

      const result = await resolveReceiverByNif("516315242");

      expect(result).toBe("Estrela Didática Unipessoal Lda");
    });

    it("returns the correct name for a different NIF", async () => {
      mockCreateClient.mockReturnValue(makeDb({ data: { legal_name: "Sample Accounting Lda" }, error: null }) as any);

      const result = await resolveReceiverByNif("509000001");

      expect(result).toBe("Sample Accounting Lda");
    });
  });

  describe("NIF not found", () => {
    it("returns null when NIF does not exist in noxx_clients", async () => {
      mockCreateClient.mockReturnValue(makeDb({ data: null, error: null }) as any);

      const result = await resolveReceiverByNif("999999999");

      expect(result).toBeNull();
    });
  });

  describe("guard conditions — no Supabase call", () => {
    it("returns null without querying Supabase when receiverNif is null", async () => {
      const result = await resolveReceiverByNif(null);

      expect(result).toBeNull();
      expect(mockCreateClient).not.toHaveBeenCalled();
    });

    it("returns null without querying Supabase when receiverNif is empty string", async () => {
      const result = await resolveReceiverByNif("");

      expect(result).toBeNull();
      expect(mockCreateClient).not.toHaveBeenCalled();
    });
  });
});

// ============================================================
// T01 — enrichReceiverName: eval/pipeline parity
// Fixture: receiver_nif = '516315242', mock returns 'Estrela Didática Unipessoal Lda'
// Asserts that after enrichment receiver_name is the resolved legal name.
// RED: fails until enrichReceiverName is implemented in client-resolver.ts
// ============================================================

describe("enrichReceiverName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SUPABASE_URL"] = "https://test.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-key";
  });

  function makeFields(overrides: Partial<InvoiceFields> = {}): InvoiceFields {
    return {
      invoice_number: null,
      issuer_nif: null,
      receiver_nif: null,
      issuer_name: null,
      receiver_name: null,
      issue_date: null,
      due_date: null,
      total_with_vat: null,
      total_without_vat: null,
      vat_total: null,
      vat_breakdown: null,
      currency: null,
      document_type: "fatura",
      origin_country: null,
      atcud: null,
      items: [],
      llm_confidence: 1.0,
      field_confidence: null,
      extraction_error_categories: [],
      ...overrides,
    } as InvoiceFields;
  }

  it("resolves receiver_name from legal_name when receiver_nif matches a noxx_client", async () => {
    mockCreateClient.mockReturnValue(makeDb({ data: { legal_name: "Estrela Didática Unipessoal Lda" }, error: null }) as any);

    const fields = makeFields({ receiver_nif: "516315242", receiver_name: "Wheelhouse" });
    const enriched = await enrichReceiverName(fields);

    expect(enriched.receiver_name).toBe("Estrela Didática Unipessoal Lda");
    expect(enriched.receiver_nif).toBe("516315242");
  });

  it("leaves receiver_name unchanged when receiver_nif is null", async () => {
    const fields = makeFields({ receiver_nif: null, receiver_name: "Original Name" });
    const enriched = await enrichReceiverName(fields);

    expect(enriched.receiver_name).toBe("Original Name");
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("leaves receiver_name unchanged when NIF not found in noxx_clients", async () => {
    mockCreateClient.mockReturnValue(makeDb({ data: null, error: null }) as any);

    const fields = makeFields({ receiver_nif: "999999999", receiver_name: "Unknown Co" });
    const enriched = await enrichReceiverName(fields);

    expect(enriched.receiver_name).toBe("Unknown Co");
  });
});

// ============================================================
// enrichIssuerNif — S14-S21
// Validation + normalization pipeline (issuer_nif already set — no DB call)
// New signature: async (fields, supabase, supplierNifs?)
// ============================================================

describe("enrichIssuerNif", () => {
  // Pass null — not called when issuer_nif is already set
  const fakeSupabase = null;

  function makeFields(overrides: Partial<InvoiceFields> = {}): InvoiceFields {
    return {
      invoice_number: null,
      issuer_nif: null,
      receiver_nif: null,
      issuer_name: null,
      receiver_name: null,
      issue_date: null,
      due_date: null,
      total_with_vat: null,
      total_without_vat: null,
      vat_total: null,
      vat_breakdown: null,
      currency: null,
      document_type: "fatura",
      origin_country: null,
      atcud: null,
      items: [],
      llm_confidence: 1.0,
      field_confidence: null,
      extraction_error_categories: [],
      ...overrides,
    } as InvoiceFields;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // S14 — null issuer_nif passthrough (no issuer_name → no DB call)
  it("S14: returns fields unchanged when issuer_nif is null and issuer_name is null", async () => {
    const fields = makeFields({ issuer_nif: null, issuer_name: null, receiver_nif: "516315242" });
    const result = await enrichIssuerNif(fields, fakeSupabase);
    expect(result.issuer_nif).toBeNull();
  });

  // S15 — valid PT NIF stays (502030712 is valid)
  it("S15: keeps valid normalized PT NIF", async () => {
    const fields = makeFields({ issuer_nif: "502030712", receiver_nif: "516315242" });
    const result = await enrichIssuerNif(fields, fakeSupabase);
    expect(result.issuer_nif).toBe("502030712");
  });

  // S16 — invalid PT NIF → null
  it("S16: sets issuer_nif to null for invalid PT NIF (bad checksum)", async () => {
    // 502030713 has wrong check digit (valid is 502030712)
    const fields = makeFields({ issuer_nif: "502030713", receiver_nif: "516315242" });
    const result = await enrichIssuerNif(fields, fakeSupabase);
    expect(result.issuer_nif).toBeNull();
  });

  // S17 — swap guard: issuer == receiver → null
  it("S17: nulls issuer_nif when it matches receiver_nif (swap guard)", async () => {
    // Both normalized to same value — issuer is a copy of receiver
    const fields = makeFields({ issuer_nif: "516315242", receiver_nif: "516315242" });
    const result = await enrichIssuerNif(fields, fakeSupabase);
    expect(result.issuer_nif).toBeNull();
  });

  // S18 — PT prefix strip then validate
  it("S18: strips PT prefix and validates (PT502030712 → 502030712, valid)", async () => {
    const fields = makeFields({ issuer_nif: "PT502030712", receiver_nif: "516315242" });
    const result = await enrichIssuerNif(fields, fakeSupabase);
    expect(result.issuer_nif).toBe("502030712");
  });

  // S19 — foreign VAT passthrough (DE prefix)
  it("S19: passes through foreign VAT number without validation (DE351574837)", async () => {
    const fields = makeFields({ issuer_nif: "DE351574837", receiver_nif: "516315242" });
    const result = await enrichIssuerNif(fields, fakeSupabase);
    expect(result.issuer_nif).toBe("DE351574837");
  });

  // S20 — supplier confirmation: NIF in supplierNifs array → confirmed
  it("S20: confirms valid PT NIF found in supplierNifs array", async () => {
    const fields = makeFields({ issuer_nif: "502030712", receiver_nif: "516315242" });
    const result = await enrichIssuerNif(fields, fakeSupabase, ["502030712", "516315242"]);
    expect(result.issuer_nif).toBe("502030712");
  });

  // S21 — hallucination: invalid PT NIF not in suppliers → null
  it("S21: nulls hallucinated issuer_nif (invalid checksum, not in suppliers)", async () => {
    const fields = makeFields({ issuer_nif: "111111111", receiver_nif: "516315242" });
    // 111111111: first digit 1 OK, checksum: sum=1*9+1*8+1*7+1*6+1*5+1*4+1*3+1*2=44, 44%11=0 → check=0, last=1 → INVALID
    const result = await enrichIssuerNif(fields, fakeSupabase, ["516315242"]);
    expect(result.issuer_nif).toBeNull();
  });

  // Extra: PT prefix on invalid PT NIF → strip then invalidate → null
  it("strips PT prefix then nulls if checksum fails (PT502030713)", async () => {
    const fields = makeFields({ issuer_nif: "PT502030713", receiver_nif: "516315242" });
    const result = await enrichIssuerNif(fields, fakeSupabase);
    expect(result.issuer_nif).toBeNull();
  });

  // Extra: normalizeNif returns null (whitespace) → issuer_nif set to null
  it("sets issuer_nif to null when normalizeNif returns null (whitespace)", async () => {
    const fields = makeFields({ issuer_nif: "   ", receiver_nif: "516315242" });
    const result = await enrichIssuerNif(fields, fakeSupabase);
    expect(result.issuer_nif).toBeNull();
  });

  // WARNING-1: swap guard normalizes receiver_nif before comparing
  // issuer_nif="516315242" (bare) vs receiver_nif="PT516315242" (PT prefix)
  // Both normalize to "516315242" — swap guard MUST fire and null issuer_nif.
  it("swap guard fires when issuer_nif matches receiver_nif that has PT prefix (PT516315242)", async () => {
    const fields = makeFields({ issuer_nif: "516315242", receiver_nif: "PT516315242" });
    const result = await enrichIssuerNif(fields, fakeSupabase);
    expect(result.issuer_nif).toBeNull();
  });
});



// ============================================================
// enrichIssuerNif — async with DB fallback via supabase
// RED: current signature is sync (fields, supplierNifs?) — no supabase param
// ============================================================

describe("enrichIssuerNif — DB fallback when issuer_nif is null", () => {
  const mockResolveIssuerNifByName = vi.mocked(resolveIssuerNifByName);

  function makeFields(overrides: Partial<InvoiceFields> = {}): InvoiceFields {
    return {
      invoice_number: null,
      issuer_nif: null,
      receiver_nif: null,
      issuer_name: null,
      receiver_name: null,
      issue_date: null,
      due_date: null,
      total_with_vat: null,
      total_without_vat: null,
      vat_total: null,
      vat_breakdown: null,
      currency: null,
      document_type: "fatura",
      origin_country: null,
      atcud: null,
      items: [],
      llm_confidence: 1.0,
      field_confidence: null,
      extraction_error_categories: [],
      ...overrides,
    } as InvoiceFields;
  }

  function makeFakeSupabase() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return {} as any;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves issuer_nif from DB when issuer_nif is null but issuer_name matches a supplier", async () => {
    mockResolveIssuerNifByName.mockResolvedValue("516301314");

    const fields = makeFields({
      issuer_nif: null,
      issuer_name: "Pão do Beco - Comer Autêntico, Lda",
    });
    const supabase = makeFakeSupabase();

    const result = await enrichIssuerNif(fields, supabase);

    expect(result.issuer_nif).toBe("516301314");
    expect(mockResolveIssuerNifByName).toHaveBeenCalledWith(supabase, "Pão do Beco - Comer Autêntico, Lda");
  });

  it("leaves issuer_nif null when issuer_nif is null and issuer_name has no DB match", async () => {
    mockResolveIssuerNifByName.mockResolvedValue(null);

    const fields = makeFields({
      issuer_nif: null,
      issuer_name: "Unknown Company That Does Not Exist",
    });
    const supabase = makeFakeSupabase();

    const result = await enrichIssuerNif(fields, supabase);

    expect(result.issuer_nif).toBeNull();
  });

  it("does not call DB when issuer_nif is already set (non-null)", async () => {
    const fields = makeFields({
      issuer_nif: "502030712",
      issuer_name: "MAKRO CASH & CARRY PORTUGAL, S.A.",
      receiver_nif: "516315242",
    });
    const supabase = makeFakeSupabase();

    const result = await enrichIssuerNif(fields, supabase);

    // resolveIssuerNifByName should NOT be called — NIF is already set
    expect(mockResolveIssuerNifByName).not.toHaveBeenCalled();
    // Existing NIF normalized and validated (502030712 is valid)
    expect(result.issuer_nif).toBe("502030712");
  });

  it("does not call DB when issuer_nif is null and issuer_name is also null", async () => {
    const fields = makeFields({ issuer_nif: null, issuer_name: null });
    const supabase = makeFakeSupabase();

    const result = await enrichIssuerNif(fields, supabase);

    expect(mockResolveIssuerNifByName).not.toHaveBeenCalled();
    expect(result.issuer_nif).toBeNull();
  });
});
