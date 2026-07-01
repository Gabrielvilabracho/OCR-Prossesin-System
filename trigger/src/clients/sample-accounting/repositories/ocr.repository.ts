import { getClient } from "../supabase-client";
import type { OcrDocumentInsert, ExtractionRunInsert } from "../schema";

// ---------------------------------------------------------------------------
// saveOcrDocument — idempotent upsert by document_hash (TASK-1-6)
// ---------------------------------------------------------------------------

/**
 * Upserts an ocr_document row by document_hash.
 * If the hash already exists, updates updated_at and returns the existing id.
 * This makes re-processing the same PDF safe — no duplicate ocr_document rows.
 *
 * @returns UUID of the ocr_document row (new or existing)
 */
export async function saveOcrDocument(data: OcrDocumentInsert): Promise<string> {
  const db = getClient();

  const { data: row, error } = await db
    .from("ocr_documents")
    .upsert(
      { ...data, updated_at: new Date().toISOString() },
      { onConflict: "document_hash", ignoreDuplicates: false }
    )
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to save ocr_document: ${error.message}`);
  }

  return (row as { id: string }).id;
}

// ---------------------------------------------------------------------------
// saveExtractionRun — insert per extraction attempt (TASK-1-7)
// ---------------------------------------------------------------------------

/**
 * Inserts one row per OCR/LLM extraction attempt into extraction_runs.
 * Multiple calls with the same ocr_document_id are valid — each attempt gets its own row.
 * If extraction fails, do NOT call this function — the ocr_document row already exists.
 *
 * @returns UUID of the newly created extraction_run row
 */
export async function saveExtractionRun(data: ExtractionRunInsert): Promise<string> {
  const db = getClient();

  const { data: row, error } = await db
    .from("extraction_runs")
    .insert(data)
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to save extraction_run: ${error.message}`);
  }

  return (row as { id: string }).id;
}

// ---------------------------------------------------------------------------
// saveInvoiceOcrText — write raw OCR text to satellite table (migration 044)
// ---------------------------------------------------------------------------

/**
 * Inserts raw OCR text into the invoice_ocr_text satellite table.
 * No-op when rawOcrText is null or empty string (invoice without OCR text).
 *
 * Called by process-single-invoice after extraction, replacing the former
 * raw_ocr_text column on the invoices table (dropped in migration 044).
 *
 * @param invoiceId  - UUID of the invoice row
 * @param rawOcrText - full OCR text (post-cleanup), or null/empty if unavailable
 */
export async function saveInvoiceOcrText(
  invoiceId:   string,
  rawOcrText:  string | null | undefined
): Promise<void> {
  if (!rawOcrText) return; // null, undefined, or empty string — skip

  const db = getClient();

  const { error } = await db
    .from("invoice_ocr_text")
    .insert({ invoice_id: invoiceId, raw_ocr_text: rawOcrText });

  if (error) {
    throw new Error(`Failed to save invoice_ocr_text for invoice ${invoiceId}: ${error.message}`);
  }
}
