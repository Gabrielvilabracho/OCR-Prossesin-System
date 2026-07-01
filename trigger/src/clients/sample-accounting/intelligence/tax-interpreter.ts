import type { InvoiceFields } from "../schema";

// ============================================================
// InvoiceTaxRow — one row per tax band from vat_breakdown
// ============================================================

export interface InvoiceTaxRow {
  invoice_id: string;
  tax_code: "IVA" | "VAT" | "TVA" | "MwSt";
  rate: number;
  taxable_base: number;
  tax_amount: number;
  is_valid: boolean;
}

// ============================================================
// Valid Portuguese IVA rates (%)
// ============================================================

const VALID_PT_RATES = new Set<number>([0, 6, 13, 23]);

// ============================================================
// VatBreakdownEntry — shape extracted from raw vat_breakdown
// Flexible: LLM may produce various key names, all optional
// ============================================================

interface VatBreakdownEntry {
  rate?: number | null;
  vat_rate?: number | null;
  taxable_base?: number | null;
  base?: number | null;
  tax_amount?: number | null;
  vat_amount?: number | null;
  amount?: number | null;      // extraction prompt uses this key
  tax_code?: string | null;
  [key: string]: unknown;
}

/**
 * Resolve the tax code from a vat_breakdown entry.
 * Falls back to "IVA" (default for PT invoices).
 */
function resolveTaxCode(entry: VatBreakdownEntry): InvoiceTaxRow["tax_code"] {
  const raw = entry.tax_code;
  if (typeof raw === "string") {
    const normalized = raw.trim().toUpperCase();
    if (normalized === "IVA" || normalized === "VAT" || normalized === "TVA" || normalized === "MWST") {
      if (normalized === "MWST") return "MwSt";
      return normalized as InvoiceTaxRow["tax_code"];
    }
  }
  return "IVA";
}

/**
 * interpretTax — converts raw vat_breakdown array from InvoiceFields
 * into normalized InvoiceTaxRow[] with PT IVA rate validation.
 *
 * Valid PT rates: 0, 6, 13, 23 (%). Any other rate → is_valid=false.
 * Empty or null vat_breakdown → returns [].
 *
 * @param invoiceId - UUID of the invoice row (already persisted)
 * @param fields    - extracted InvoiceFields from LLM
 * @returns         - array of InvoiceTaxRow (may be empty)
 */
export function interpretTax(invoiceId: string, fields: InvoiceFields): InvoiceTaxRow[] {
  const breakdown = fields.vat_breakdown;

  // No breakdown provided
  if (!breakdown || !Array.isArray(breakdown) || breakdown.length === 0) {
    return [];
  }

  const rows: InvoiceTaxRow[] = [];

  for (const entry of breakdown as VatBreakdownEntry[]) {
    // Resolve numeric rate — check both "rate" and "vat_rate" keys
    const rawRate = entry.rate ?? entry.vat_rate ?? null;
    if (rawRate === null || rawRate === undefined || typeof rawRate !== "number") {
      // Malformed entry: skip
      continue;
    }

    // Resolve taxable_base — check both "taxable_base" and "base"
    const taxableBase = entry.taxable_base ?? entry.base ?? 0;
    if (typeof taxableBase !== "number") continue;

    // Resolve tax_amount — extraction returns "amount", SDK may return "tax_amount" or "vat_amount"
    const taxAmount = entry.tax_amount ?? entry.vat_amount ?? entry.amount ?? 0;
    if (typeof taxAmount !== "number") continue;

    const taxCode = resolveTaxCode(entry);
    const isValid = VALID_PT_RATES.has(rawRate);

    rows.push({
      invoice_id: invoiceId,
      tax_code: taxCode,
      rate: rawRate,
      taxable_base: taxableBase,
      tax_amount: taxAmount,
      is_valid: isValid,
    });
  }

  return rows;
}
