import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================
// Mock @trigger.dev/sdk (logger used in repository.ts)
// ============================================================

vi.mock("@trigger.dev/sdk", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn().mockImplementation((_name: string, fn: () => unknown) => fn()),
  },
}));

// ============================================================
// Mock @supabase/supabase-js (not needed here — supabase injected)
// ============================================================

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

// Import the REAL function (no repository mock in this file)
import { resolveIssuerNifByName } from "../repository";

// ============================================================
// Supabase mock factory
// Implementation calls:
//   supabase.schema("facturas").from("suppliers")
//     .select("nif, legal_name, commercial_name").eq("country", "PT")
// ============================================================

function makeSupabaseMock(
  rows: { nif: string; legal_name: string | null; commercial_name: string | null }[],
  error: { message: string } | null = null,
) {
  const chain = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: error ? null : rows, error }),
    }),
  };
  const fromMock = vi.fn().mockReturnValue(chain);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: fromMock, schema: vi.fn().mockReturnValue({ from: fromMock }) } as any;
}

// ============================================================
// Tests — resolveIssuerNifByName
// RED: function does not exist in repository.ts yet (will be implemented in GREEN phase)
// ============================================================

describe("resolveIssuerNifByName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exact name match returns the correct NIF", async () => {
    const supabase = makeSupabaseMock([
      { nif: "516301314", legal_name: "Pão do Beco - Comer Autêntico, Lda", commercial_name: null },
      { nif: "502030712", legal_name: "MAKRO CASH & CARRY PORTUGAL, S.A.", commercial_name: null },
    ]);

    const result = await resolveIssuerNifByName(supabase, "Pão do Beco - Comer Autêntico, Lda");

    expect(result).toBe("516301314");
  });

  it("OCR typo within Levenshtein threshold (Mammatiore vs Mammafiore, distance=1) returns correct NIF", async () => {
    const supabase = makeSupabaseMock([
      { nif: "517034573", legal_name: "Mammafiore Portugal, Unipessoal Lda", commercial_name: null },
      { nif: "502030712", legal_name: "MAKRO CASH & CARRY PORTUGAL, S.A.", commercial_name: null },
    ]);

    // "Mammatiore" has 1 char transposition vs "Mammafiore" → distance=1 ≤ 5
    const result = await resolveIssuerNifByName(supabase, "Mammatiore Portugal, Unipessoal Lda");

    expect(result).toBe("517034573");
  });

  it("no match returns null when distance exceeds threshold", async () => {
    const supabase = makeSupabaseMock([
      { nif: "502030712", legal_name: "MAKRO CASH & CARRY PORTUGAL, S.A.", commercial_name: null },
    ]);

    // Completely different name — distance >> threshold
    const result = await resolveIssuerNifByName(supabase, "Completely Different Company Xyz 999");

    expect(result).toBeNull();
  });

  it("strips PT prefix from matched NIF before returning", async () => {
    const supabase = makeSupabaseMock([
      { nif: "PT516301314", legal_name: "Pão do Beco - Comer Autêntico, Lda", commercial_name: null },
    ]);

    const result = await resolveIssuerNifByName(supabase, "Pão do Beco - Comer Autêntico, Lda");

    // PT prefix stripped → "516301314"
    expect(result).toBe("516301314");
  });

  it("returns null when matched NIF fails PT checksum validation", async () => {
    const supabase = makeSupabaseMock([
      // 999999999: first digit 9 is not a valid PT NIF start digit — validateNif returns false
      { nif: "999999999", legal_name: "Some Company Lda", commercial_name: null },
    ]);

    const result = await resolveIssuerNifByName(supabase, "Some Company Lda");

    expect(result).toBeNull();
  });

  it("returns null on Supabase error", async () => {
    const supabase = makeSupabaseMock([], { message: "connection timeout" });

    const result = await resolveIssuerNifByName(supabase, "Pão do Beco - Comer Autêntico, Lda");

    expect(result).toBeNull();
  });

  it("returns null when supplier list is empty", async () => {
    const supabase = makeSupabaseMock([]);

    const result = await resolveIssuerNifByName(supabase, "Any Company Name");

    expect(result).toBeNull();
  });
});
