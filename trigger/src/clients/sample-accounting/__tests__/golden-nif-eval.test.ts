/**
 * golden-nif-eval.test.ts — Task 4.3 synthetic public eval (static, no Mistral)
 *
 * Validates that enrichIssuerNif() correctly normalizes and validates the
 * issuer_nif from each of the 20 synthetic invoice fixtures.
 *
 * This eval does NOT call Mistral — it uses public-safe synthetic fixture data,
 * runs enrichIssuerNif() on each, and asserts:
 *   - PT NIFs pass mod-11 checksum after normalization
 *   - Foreign VATs are passed through unchanged
 *   - Null NIFs remain null (no false validation)
 *   - No swap-guard false positives (issuer ≠ receiver in all 20 cases)
 *
 * AC: AC-1, AC-2, AC-3, AC-4, AC-8
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================
// Mocks required by enrichIssuerNif dependencies
// ============================================================

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

vi.mock("@trigger.dev/sdk", () => ({
  logger: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  },
}));

vi.mock("../repository", () => ({
  resolveIssuerNifByName: vi.fn().mockResolvedValue(null),
}));

import { enrichIssuerNif } from "../client-resolver";
import { validateNif, normalizeNif } from "../utils/nif-validator";
import type { InvoiceFields } from "../schema";

// ============================================================
// Synthetic public dataset loader
// ============================================================

interface GoldenExpected {
  issuer_nif: string | null;
  receiver_nif: string | null;
  document_type: string | null;
  total_with_vat: number | null;
  [key: string]: unknown;
}

function loadGoldenCase(name: typeof INVOICE_CASES[number]): GoldenExpected {
  return SYNTHETIC_EXPECTED[name];
}

function makeFields(overrides: Partial<InvoiceFields>): InvoiceFields {
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

// ============================================================
// Synthetic case definitions (20 public-safe invoices)
// ============================================================

const INVOICE_CASES = [
  "invoice-001", "invoice-002", "invoice-003", "invoice-004", "invoice-005",
  "invoice-006", "invoice-007", "invoice-008", "invoice-009", "invoice-010",
  "invoice-011", "invoice-012", "invoice-013", "invoice-014", "invoice-015",
  "invoice-016", "invoice-017", "invoice-018", "invoice-019", "invoice-020",
] as const;

const SYNTHETIC_EXPECTED: Record<typeof INVOICE_CASES[number], GoldenExpected> = {
  "invoice-001": { issuer_nif: "502030712", receiver_nif: "516315242", document_type: "fatura", total_with_vat: 123.00 },
  "invoice-002": { issuer_nif: "PT502030712", receiver_nif: "516315242", document_type: "fatura", total_with_vat: 246.00 },
  "invoice-003": { issuer_nif: "516315242", receiver_nif: "502030712", document_type: "fatura", total_with_vat: 369.00 },
  "invoice-004": { issuer_nif: "PT516315242", receiver_nif: "502030712", document_type: "fatura", total_with_vat: 492.00 },
  "invoice-005": { issuer_nif: "502030712", receiver_nif: null, document_type: "fatura", total_with_vat: 615.00 },
  "invoice-006": { issuer_nif: "516315242", receiver_nif: null, document_type: "fatura", total_with_vat: 738.00 },
  "invoice-007": { issuer_nif: "PT516315242", receiver_nif: null, document_type: "fatura", total_with_vat: 861.00 },
  "invoice-008": { issuer_nif: null, receiver_nif: "516315242", document_type: "fatura", total_with_vat: 984.00 },
  "invoice-009": { issuer_nif: "DE351574837", receiver_nif: "516315242", document_type: "fatura", total_with_vat: 1107.00 },
  "invoice-010": { issuer_nif: "502030712", receiver_nif: "516315242", document_type: "nota_credito", total_with_vat: 1230.00 },
  "invoice-011": { issuer_nif: "ESN7207874D", receiver_nif: "516315242", document_type: "fatura", total_with_vat: 1353.00 },
  "invoice-012": { issuer_nif: "502030712", receiver_nif: "516315242", document_type: "fatura", total_with_vat: 1476.00 },
  "invoice-013": { issuer_nif: "PT502030712", receiver_nif: null, document_type: "fatura", total_with_vat: 1599.00 },
  "invoice-014": { issuer_nif: "PL5263565340", receiver_nif: "516315242", document_type: "fatura", total_with_vat: 1722.00 },
  "invoice-015": { issuer_nif: "516315242", receiver_nif: "502030712", document_type: "fatura", total_with_vat: 1845.00 },
  "invoice-016": { issuer_nif: "502030712", receiver_nif: "516315242", document_type: "fatura", total_with_vat: 1968.00 },
  "invoice-017": { issuer_nif: "PT516315242", receiver_nif: "502030712", document_type: "fatura", total_with_vat: 2091.00 },
  "invoice-018": { issuer_nif: "DE351574837", receiver_nif: null, document_type: "fatura", total_with_vat: 2214.00 },
  "invoice-019": { issuer_nif: null, receiver_nif: null, document_type: "fatura", total_with_vat: 2337.00 },
  "invoice-020": { issuer_nif: "ESN7207874D", receiver_nif: null, document_type: "fatura", total_with_vat: 2460.00 },
};

// ============================================================
// AC-2: validateNif 0 false negatives on PT NIFs in golden dataset
// ============================================================

describe("Golden eval — AC-2: validateNif has 0 false negatives on PT NIFs (20 cases)", () => {
  beforeEach(() => vi.clearAllMocks());

  const ptNifCases = INVOICE_CASES.map((name) => {
    const expected = loadGoldenCase(name);
    const rawNif = expected.issuer_nif;
    if (rawNif === null) return null;
    const normalized = normalizeNif(rawNif);
    if (normalized === null || !/^\d{9}$/.test(normalized)) return null;
    return { name, rawNif, normalized };
  }).filter(Boolean) as Array<{ name: string; rawNif: string; normalized: string }>;

  it(`has ${INVOICE_CASES.length} invoice golden cases loaded`, () => {
    expect(INVOICE_CASES).toHaveLength(20);
  });

  for (const { name, rawNif, normalized } of ptNifCases) {
    it(`${name}: normalized PT NIF "${normalized}" (from "${rawNif}") passes validateNif — no false negative`, () => {
      expect(validateNif(normalized)).toBe(true);
    });
  }
});

// ============================================================
// AC-3: swap guard — invoice-007 (PT516315242 / receiver null)
// enrichIssuerNif should NOT null the issuer because receiver is null
// ============================================================

describe("Golden eval — AC-3: swap guard correctness", () => {
  beforeEach(() => vi.clearAllMocks());

  it("invoice-007: enrichIssuerNif does NOT null issuer_nif when receiver_nif is null (no swap)", async () => {
    const expected = loadGoldenCase("invoice-007");
    // invoice-007 has issuer_nif='PT516315242', receiver_nif=null
    // After normalization: issuer='516315242', receiver=null → no swap guard → keep NIF
    const fields = makeFields({
      issuer_nif: expected.issuer_nif,
      receiver_nif: expected.receiver_nif,
    });

    const result = await enrichIssuerNif(fields, null);
    // After PT prefix strip: 516315242 (valid) — no swap (receiver is null) → keep
    expect(result.issuer_nif).toBe("516315242");
  });

  it("invoice-012: enrichIssuerNif keeps valid PT NIF when receiver is different NIF", async () => {
    const expected = loadGoldenCase("invoice-012");
    // invoice-012: issuer='502030712', receiver='516315242' → different → no swap
    const fields = makeFields({
      issuer_nif: expected.issuer_nif,
      receiver_nif: expected.receiver_nif,
    });

    const result = await enrichIssuerNif(fields, null);
    expect(result.issuer_nif).toBe("502030712");
  });
});

// ============================================================
// AC-4: foreign VAT passthrough (invoice-009 DE, invoice-011 ES, invoice-014 PL)
// ============================================================

describe("Golden eval — AC-4: foreign VAT passthrough", () => {
  beforeEach(() => vi.clearAllMocks());

  it("invoice-009: DE351574837 is passed through unchanged (German VAT)", async () => {
    const expected = loadGoldenCase("invoice-009");
    const fields = makeFields({
      issuer_nif: expected.issuer_nif,
      receiver_nif: expected.receiver_nif,
    });

    const result = await enrichIssuerNif(fields, null);
    expect(result.issuer_nif).toBe("DE351574837");
  });

  it("invoice-011: ESN7207874D is passed through unchanged (Spanish VAT)", async () => {
    const expected = loadGoldenCase("invoice-011");
    const fields = makeFields({
      issuer_nif: expected.issuer_nif,
      receiver_nif: expected.receiver_nif,
    });

    const result = await enrichIssuerNif(fields, null);
    expect(result.issuer_nif).toBe("ESN7207874D");
  });

  it("invoice-014: PL5263565340 is passed through unchanged (Polish VAT)", async () => {
    const expected = loadGoldenCase("invoice-014");
    const fields = makeFields({
      issuer_nif: expected.issuer_nif,
      receiver_nif: expected.receiver_nif,
    });

    const result = await enrichIssuerNif(fields, null);
    expect(result.issuer_nif).toBe("PL5263565340");
  });
});

// ============================================================
// AC-8: No regression on document_type / total_with_vat
// enrichIssuerNif must NOT mutate document_type or total_with_vat
// ============================================================

describe("Golden eval — AC-8: enrichIssuerNif does not mutate document_type or total_with_vat", () => {
  beforeEach(() => vi.clearAllMocks());

  const regressionCases: Array<{ name: typeof INVOICE_CASES[number] }> = INVOICE_CASES.map(
    (name) => ({ name })
  );

  for (const { name } of regressionCases) {
    it(`${name}: document_type and total_with_vat are unchanged after enrichIssuerNif`, async () => {
      const expected = loadGoldenCase(name);
      const fields = makeFields({
        issuer_nif: expected.issuer_nif,
        receiver_nif: expected.receiver_nif,
        document_type: expected.document_type as InvoiceFields["document_type"],
        total_with_vat: expected.total_with_vat,
      });

      const originalDocType = fields.document_type;
      const originalTotalWithVat = fields.total_with_vat;

      const result = await enrichIssuerNif(fields, null);

      expect(result.document_type).toBe(originalDocType);
      expect(result.total_with_vat).toBe(originalTotalWithVat);
    });
  }
});

// ============================================================
// Summary: full 20-case pass/fail table (informational)
// ============================================================

describe("Golden eval — Full 20-case issuer_nif enrichment summary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("all 20 golden cases produce expected enriched issuer_nif behavior", async () => {
    const results: Array<{ name: string; status: string; issuerNifOut: string | null }> = [];

    for (const name of INVOICE_CASES) {
      const expected = loadGoldenCase(name);
      const fields = makeFields({
        issuer_nif: expected.issuer_nif,
        receiver_nif: expected.receiver_nif,
      });

      const result = await enrichIssuerNif(fields, null);

      let status = "unknown";
      const rawNif = expected.issuer_nif;
      if (rawNif === null) {
        status = result.issuer_nif === null ? "null→null PASS" : "null→non-null FAIL";
      } else {
        const normalized = normalizeNif(rawNif);
        if (normalized !== null && /^\d{9}$/.test(normalized)) {
          // PT NIF — should be kept (valid) or nulled (invalid or swap)
          status = result.issuer_nif !== null ? "PT NIF PASS" : "PT NIF NULLED";
        } else if (normalized !== null && /^[A-Z]{2}/i.test(normalized)) {
          // Foreign VAT — should be passed through
          status = result.issuer_nif === normalized ? "foreign VAT PASS" : "foreign VAT FAIL";
        }
      }

      results.push({ name, status, issuerNifOut: result.issuer_nif });
    }

    // No null→non-null errors, no foreign VAT failures
    const failures = results.filter(
      (r) => r.status.includes("FAIL") || r.status === "unknown"
    );
    expect(failures).toHaveLength(0);
  });
});
