import { CONFIDENCE_REVIEW_THRESHOLD, computeReviewRequired } from "../schema";
import type { InvoiceFields } from "../schema";
import type { ValidationResult } from "./validator";
import type { ResolutionResult } from "./entity-resolver";

// ============================================================
// ReasonCode — all 6 reason codes from the design
// ============================================================

export type ReasonCode =
  | "vat_invalid"
  | "supplier_unresolved"
  | "math_mismatch"
  | "first_time_supplier"
  | "amount_above_threshold"
  | "low_confidence";

// ============================================================
// ReviewReason — one entry per reason code triggered
// ============================================================

export interface ReviewReason {
  reason_code: ReasonCode;
  priority: 1 | 2 | 3;
}

// ============================================================
// RouteDecision — output of routeInvoice()
// ============================================================

export interface RouteDecision {
  autoAccept: boolean;
  reasons: ReviewReason[];
}

// ============================================================
// Routing thresholds
// ============================================================

const AMOUNT_THRESHOLD = 10_000; // € 10,000 → amount_above_threshold
// MIN_CONFIDENCE removed — using CONFIDENCE_REVIEW_THRESHOLD from schema (0.7)

// ============================================================
// Math-related rule codes (R1, R2, R5)
// ============================================================

const MATH_RULE_PREFIXES = ["R1", "R2", "R5"];

/**
 * routeInvoice — translates validation outcomes + invoice fields
 * into a RouteDecision (autoAccept=true or reasons to queue for review).
 *
 * Routing rules (all evaluated independently, multi-reason supported):
 *   vat_invalid          — any taxRow.is_valid === false             → priority 1
 *   math_mismatch        — R1|R2|R5 validation rule failed          → priority 1
 *   supplier_unresolved  — resolutionResult.needsReview === true     → priority 1
 *   amount_above_threshold — total_with_vat > 10000                 → priority 1
 *   first_time_supplier  — isFirstTimeSupplier === true (AND resolved) → priority 2
 *   low_confidence       — any field_confidence[f] < CONFIDENCE_REVIEW_THRESHOLD (0.7) → priority 2
 *
 * If ALL conditions pass → autoAccept=true, reasons=[]
 *
 * @param fields              - extracted InvoiceFields
 * @param validationResults   - output of validate()
 * @param resolutionResult    - output of resolveEntity()
 * @param isFirstTimeSupplier - true if this is the supplier's first invoice
 * @returns RouteDecision
 */
export function routeInvoice(
  fields: InvoiceFields,
  validationResults: ValidationResult[],
  resolutionResult: ResolutionResult,
  isFirstTimeSupplier: boolean
): RouteDecision {
  const reasons: ReviewReason[] = [];

  // ------------------------------------------------------------------
  // vat_invalid — any validation result R6 failed
  // Check via validationResults to stay consistent with validator output
  // ------------------------------------------------------------------
  const r6 = validationResults.find((r) => r.rule_code === "R6-invalid-vat-rate");
  if (r6 && !r6.passed) {
    reasons.push({ reason_code: "vat_invalid", priority: 1 });
  }

  // ------------------------------------------------------------------
  // math_mismatch — any R1, R2, or R5 rule failed
  // ------------------------------------------------------------------
  const mathFailed = validationResults.some(
    (r) =>
      !r.passed &&
      MATH_RULE_PREFIXES.some((prefix) => r.rule_code.startsWith(prefix))
  );
  if (mathFailed) {
    reasons.push({ reason_code: "math_mismatch", priority: 1 });
  }

  // ------------------------------------------------------------------
  // supplier_unresolved — resolutionResult.needsReview === true
  // ------------------------------------------------------------------
  if (resolutionResult.needsReview) {
    reasons.push({ reason_code: "supplier_unresolved", priority: 1 });
  }

  // ------------------------------------------------------------------
  // amount_above_threshold — total_with_vat > 10000
  // ------------------------------------------------------------------
  if (fields.total_with_vat !== null && fields.total_with_vat > AMOUNT_THRESHOLD) {
    reasons.push({ reason_code: "amount_above_threshold", priority: 1 });
  }

  // ------------------------------------------------------------------
  // first_time_supplier — only applies when supplier is resolved
  // (if supplier_unresolved already fired, first_time_supplier is N/A)
  // ------------------------------------------------------------------
  if (isFirstTimeSupplier && !resolutionResult.needsReview) {
    reasons.push({ reason_code: "first_time_supplier", priority: 2 });
  }

  // ------------------------------------------------------------------
  // low_confidence — any field_confidence < CONFIDENCE_REVIEW_THRESHOLD (0.7)
  // REQ-05: uses computeReviewRequired for per-field check
  // AC-05.4: boundary 0.7 does NOT trigger (strict less-than)
  // ------------------------------------------------------------------
  const fcForReview = fields.field_confidence ?? {};
  if (computeReviewRequired(fcForReview)) {
    reasons.push({ reason_code: "low_confidence", priority: 2 });
  }

  // ------------------------------------------------------------------
  // autoAccept only when no reasons triggered
  // ------------------------------------------------------------------
  const autoAccept = reasons.length === 0;

  return { autoAccept, reasons };
}
