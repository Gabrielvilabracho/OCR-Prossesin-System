import { getClient } from "../supabase-client";
import type { ValidationResult } from "../intelligence/validator";

// ---------------------------------------------------------------------------
// saveValidationResults — bulk-insert validation_results rows (TASK-3-6)
// Idempotent: deletes existing rows for this invoice_id before inserting.
// ---------------------------------------------------------------------------

/**
 * Replaces all validation_results rows for the given invoice_id.
 * Safe to call multiple times — existing rows are removed first.
 * No-op if results is empty.
 *
 * @param invoiceId - UUID of the invoice
 * @param results   - array of ValidationResult from validate()
 */
export async function saveValidationResults(
  invoiceId: string,
  results: ValidationResult[]
): Promise<void> {
  if (results.length === 0) return;

  const db = getClient();

  // Delete existing rows for this invoice (idempotent)
  const { error: delError } = await db
    .from("validation_results")
    .delete()
    .eq("invoice_id", invoiceId);

  if (delError) {
    throw new Error(`Failed to clear validation_results for invoice ${invoiceId}: ${delError.message}`);
  }

  const rows = results.map((r) => ({
    invoice_id:       invoiceId,
    rule_code:        r.rule_code,
    rule_description: r.rule_description,
    passed:           r.passed,
    detail:           r.detail,
  }));

  const { error } = await db.from("validation_results").insert(rows);

  if (error) {
    throw new Error(`Failed to save validation_results for invoice ${invoiceId}: ${error.message}`);
  }
}
