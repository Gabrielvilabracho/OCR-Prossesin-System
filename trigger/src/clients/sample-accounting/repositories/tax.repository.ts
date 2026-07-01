import { getClient } from "../supabase-client";
import type { InvoiceTaxRow } from "../intelligence/tax-interpreter";

// ---------------------------------------------------------------------------
// saveInvoiceTaxes — bulk-insert invoice_taxes rows (TASK-3-6)
// Idempotent: deletes existing rows for this invoice_id before inserting.
// ---------------------------------------------------------------------------

/**
 * Replaces all invoice_taxes rows for the given invoice_id with the provided rows.
 * Safe to call multiple times — existing rows are removed first.
 * No-op if taxRows is empty.
 *
 * @param taxRows - array of InvoiceTaxRow (invoice_id must be populated)
 */
export async function saveInvoiceTaxes(taxRows: InvoiceTaxRow[]): Promise<void> {
  if (taxRows.length === 0) return;

  const db = getClient();
  const invoiceId = taxRows[0].invoice_id;

  // Delete existing rows for this invoice (idempotent)
  const { error: delError } = await db
    .from("invoice_taxes")
    .delete()
    .eq("invoice_id", invoiceId);

  if (delError) {
    throw new Error(`Failed to clear invoice_taxes for invoice ${invoiceId}: ${delError.message}`);
  }

  const rows = taxRows.map((t) => ({
    invoice_id:   t.invoice_id,
    tax_code:     t.tax_code,
    rate:         t.rate,
    taxable_base: t.taxable_base,
    tax_amount:   t.tax_amount,
    is_valid:     t.is_valid,
  }));

  const { error } = await db.from("invoice_taxes").insert(rows);

  if (error) {
    throw new Error(`Failed to save invoice_taxes for invoice ${invoiceId}: ${error.message}`);
  }
}
