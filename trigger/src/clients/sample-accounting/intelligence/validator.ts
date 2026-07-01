import { CONFIDENCE_REVIEW_THRESHOLD, computeReviewRequired } from "../schema";
import type { InvoiceFields } from "../schema";
import type { InvoiceTaxRow } from "./tax-interpreter";
import type { ResolutionResult } from "./entity-resolver";

// ============================================================
// ValidationResult — per-rule result returned by validate()
// ============================================================

export interface ValidationResult {
  rule_code: string;
  rule_description: string;
  passed: boolean;
  detail: string;
}

// ============================================================
// Math tolerance — must match math-validator.ts (€ 0.02)
// ============================================================

const MATH_TOLERANCE = 0.02;

function approxEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= MATH_TOLERANCE;
}

// MIN_CONFIDENCE removed — using CONFIDENCE_REVIEW_THRESHOLD from schema (0.7)

/**
 * validate — unified validator emitting structured ValidationResult[]
 *
 * Rules:
 *   R1-total-integrity        — total_without_vat + vat_total ≈ total_with_vat
 *   R2-items-sum              — sum of item.gross_amount ≈ total_with_vat (if items)
 *   R5-vat-breakdown-mismatch — vat_breakdown tax_amount sum ≈ vat_total
 *   R6-invalid-vat-rate       — all taxRows must have is_valid=true
 *   R7-low-confidence         — all field_confidence[f] ≥ CONFIDENCE_REVIEW_THRESHOLD (0.7)
 *   R8-supplier-unresolved    — resolutionResult.needsReview must be false
 *
 * @param fields           - extracted invoice fields
 * @param taxRows          - output of interpretTax()
 * @param resolutionResult - output of resolveEntity()
 * @returns                - ValidationResult[] one per rule
 */
export function validate(
  fields: InvoiceFields,
  taxRows: InvoiceTaxRow[],
  resolutionResult: ResolutionResult
): ValidationResult[] {
  const results: ValidationResult[] = [];

  // ------------------------------------------------------------------
  // R1 — total-integrity: total_without_vat + vat_total ≈ total_with_vat
  // ------------------------------------------------------------------
  const { total_with_vat, total_without_vat, vat_total } = fields;

  if (total_with_vat !== null && total_without_vat !== null && vat_total !== null) {
    const computed = total_without_vat + vat_total;
    const passed = approxEqual(computed, total_with_vat);
    results.push({
      rule_code: "R1-total-integrity",
      rule_description: "Total with VAT must equal total without VAT plus VAT amount",
      passed,
      detail: passed
        ? `${total_without_vat} + ${vat_total} = ${computed.toFixed(2)} ≈ ${total_with_vat}`
        : `${total_without_vat} + ${vat_total} = ${computed.toFixed(2)}, expected ${total_with_vat} (diff: ${Math.abs(computed - total_with_vat).toFixed(2)})`,
    });
  } else {
    // Skipped when fields are absent — mark as passed (not enough data to fail)
    results.push({
      rule_code: "R1-total-integrity",
      rule_description: "Total with VAT must equal total without VAT plus VAT amount",
      passed: true,
      detail: "Skipped — one or more total fields are null",
    });
  }

  // ------------------------------------------------------------------
  // R2 — items-sum: sum(item.gross_amount) ≈ total_with_vat (only if items present)
  // ------------------------------------------------------------------
  const { items } = fields;

  if (items.length > 0 && total_with_vat !== null) {
    const grossSum = items.reduce((acc, i) => acc + (i.gross_amount ?? 0), 0);
    const passed = approxEqual(grossSum, total_with_vat);
    results.push({
      rule_code: "R2-items-sum",
      rule_description: "Sum of line item gross amounts must equal total with VAT",
      passed,
      detail: passed
        ? `sum(gross_amount) = ${grossSum.toFixed(2)} ≈ ${total_with_vat}`
        : `sum(gross_amount) = ${grossSum.toFixed(2)}, expected ${total_with_vat} (diff: ${Math.abs(grossSum - total_with_vat).toFixed(2)})`,
    });
  } else {
    results.push({
      rule_code: "R2-items-sum",
      rule_description: "Sum of line item gross amounts must equal total with VAT",
      passed: true,
      detail: "Skipped — no line items present",
    });
  }

  // ------------------------------------------------------------------
  // R5 — vat-breakdown-mismatch: sum of taxRow.tax_amount ≈ vat_total
  // ------------------------------------------------------------------
  if (taxRows.length > 0 && vat_total !== null) {
    const taxSum = taxRows.reduce((acc, t) => acc + t.tax_amount, 0);
    const passed = approxEqual(taxSum, vat_total);
    results.push({
      rule_code: "R5-vat-breakdown-mismatch",
      rule_description: "Sum of VAT breakdown tax amounts must equal total VAT",
      passed,
      detail: passed
        ? `sum(tax_amount) = ${taxSum.toFixed(2)} ≈ ${vat_total}`
        : `sum(tax_amount) = ${taxSum.toFixed(2)}, expected ${vat_total} (diff: ${Math.abs(taxSum - vat_total).toFixed(2)})`,
    });
  } else {
    results.push({
      rule_code: "R5-vat-breakdown-mismatch",
      rule_description: "Sum of VAT breakdown tax amounts must equal total VAT",
      passed: true,
      detail: "Skipped — no VAT breakdown rows or vat_total is null",
    });
  }

  // ------------------------------------------------------------------
  // R6 — invalid-vat-rate: all taxRows must be is_valid=true
  // ------------------------------------------------------------------
  {
    const invalidRows = taxRows.filter((t) => !t.is_valid);
    const passed = invalidRows.length === 0;
    results.push({
      rule_code: "R6-invalid-vat-rate",
      rule_description: "All VAT rates must be valid Portuguese rates (0, 6, 13, 23%)",
      passed,
      detail: passed
        ? "All VAT rates are valid"
        : `Invalid rates: ${invalidRows.map((t) => `${t.rate}%`).join(", ")}`,
    });
  }

  // ------------------------------------------------------------------
  // R7 — low-confidence: all field_confidence[f] >= CONFIDENCE_REVIEW_THRESHOLD (0.7)
  // REQ-04: uses computeReviewRequired for per-field check
  // ------------------------------------------------------------------
  {
    const fc = fields.field_confidence ?? {};
    const reviewRequired = computeReviewRequired(fc);
    const passed = !reviewRequired;
    const derivedConf = fields.llm_confidence ?? 0;
    results.push({
      rule_code: "R7-low-confidence",
      rule_description: `All field confidence values must be at least ${CONFIDENCE_REVIEW_THRESHOLD}`,
      passed,
      detail: passed
        ? `All field confidences >= ${CONFIDENCE_REVIEW_THRESHOLD} (derived: ${derivedConf})`
        : `One or more field confidence values below ${CONFIDENCE_REVIEW_THRESHOLD} (derived: ${derivedConf})`,
    });
  }

  // ------------------------------------------------------------------
  // R8 — supplier-unresolved: resolutionResult.needsReview must be false
  // ------------------------------------------------------------------
  {
    const passed = !resolutionResult.needsReview;
    results.push({
      rule_code: "R8-supplier-unresolved",
      rule_description: "Supplier must be resolved without requiring human review",
      passed,
      detail: passed
        ? `Resolved via ${resolutionResult.method} (confidence: ${resolutionResult.confidence})`
        : `Supplier resolution requires review — method: ${resolutionResult.method}, confidence: ${resolutionResult.confidence}`,
    });
  }

  return results;
}
