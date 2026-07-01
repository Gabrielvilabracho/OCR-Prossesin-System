import { getClient } from "../supabase-client";

// ---------------------------------------------------------------------------
// Accounting classification types
// ---------------------------------------------------------------------------

export interface AccountingClassificationInsert {
  invoice_id:               string;
  gl_account_id:            string;
  category_id?:             string | null;
  amount:                   number;
  classification_confidence?: number | null;
  classified_by?:           "auto" | "human";
}

// ---------------------------------------------------------------------------
// saveAccountingClassification
// ---------------------------------------------------------------------------

/**
 * saveAccountingClassification — inserts an accounting_classifications row.
 * Called after auto-classification for each approved invoice.
 *
 * @returns UUID of the created row
 */
export async function saveAccountingClassification(data: AccountingClassificationInsert): Promise<string> {
  const db = getClient();

  const { data: row, error } = await db
    .from("accounting_classifications")
    .insert({
      invoice_id:               data.invoice_id,
      gl_account_id:            data.gl_account_id,
      category_id:              data.category_id ?? null,
      amount:                   data.amount,
      classification_confidence: data.classification_confidence ?? null,
      classified_by:            data.classified_by ?? "auto",
    })
    .select("id")
    .single();

  if (error || !row) {
    throw new Error(error?.message ?? `Failed to save accounting classification for invoice ${data.invoice_id}`);
  }

  return (row as { id: string }).id;
}
