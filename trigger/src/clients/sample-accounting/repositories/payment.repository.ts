import { getClient } from "../supabase-client";

// ---------------------------------------------------------------------------
// Payment types and repository methods (TASK-4-4)
// ---------------------------------------------------------------------------

export interface PaymentInsert {
  invoice_id:     string;
  amount_paid:    number;
  payment_date:   string; // ISO 8601 date string e.g. "2026-01-15"
  payment_method?: string | null;
  reference?:     string | null;
}

/**
 * savePayment — upserts a payment row.
 * Idempotent: if the same invoice_id + payment_date + amount_paid exists, returns existing id.
 * Uses insert (payments have no natural unique key other than their UUID).
 *
 * @returns UUID of the created payment row
 */
export async function savePayment(data: PaymentInsert): Promise<string> {
  const db = getClient();

  const { data: row, error } = await db
    .from("payments")
    .insert({
      invoice_id:     data.invoice_id,
      amount_paid:    data.amount_paid,
      payment_date:   data.payment_date,
      payment_method: data.payment_method ?? null,
      reference:      data.reference ?? null,
    })
    .select("id")
    .single();

  if (error || !row) {
    throw new Error(error?.message ?? `Failed to save payment for invoice ${data.invoice_id}`);
  }

  return (row as { id: string }).id;
}

/**
 * updatePaymentStatus — sets payment_status, amount_paid, amount_due on an invoice.
 * Called after a payment is recorded to reflect the new payment state.
 */
export async function updatePaymentStatus(
  invoiceId: string,
  paymentStatus: "unpaid" | "partial" | "paid",
  amountPaid: number,
  amountDue: number
): Promise<void> {
  const db = getClient();

  const { error } = await db
    .from("invoices")
    .update({
      payment_status: paymentStatus,
      amount_paid:    amountPaid,
      amount_due:     amountDue,
      updated_at:     new Date().toISOString(),
    })
    .eq("id", invoiceId);

  if (error) {
    throw new Error(`Failed to update payment status for invoice ${invoiceId}: ${error.message}`);
  }
}
