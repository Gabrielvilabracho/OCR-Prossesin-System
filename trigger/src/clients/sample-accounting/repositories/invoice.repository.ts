import { getClient } from "../supabase-client";
import type { MathValidationResult, InvoiceItem } from "../schema";
import { buildInvoiceItemRows } from "./mappers";

// ---------------------------------------------------------------------------
// InvoiceInsert — data shape for DB insert / update
// ---------------------------------------------------------------------------

export interface InvoiceInsert {
  source_type: "drive" | "gmail" | "manual" | "storage";
  source_ref: string;
  file_name: string;
  document_hash: string;
  processing_status: "processing" | "ok" | "duplicado" | "requires_review" | "failed";
  invoice_number?: string | null;
  issuer_nif?: string | null;
  receiver_nif?: string | null;
  issuer_name?: string | null;
  issue_date?: string | null;
  total_with_vat?: number | null;
  total_without_vat?: number | null;
  vat_total?: number | null;
  vat_breakdown?: unknown;
  llm_confidence?: number | null;
  duplicate_of?: string | null;
  review_reason?: string | null;
  raw_extraction?: unknown;
  efactura_result?: unknown;
  // B1 extended fields
  receiver_name?: string | null;
  due_date?: string | null;
  currency?: string | null;
  document_type?: string | null;
  origin_country?: string | null;
  atcud?: string | null;
  // B2 math validation
  math_validation_result?: MathValidationResult | null;
  // Fase 1: client + extractor observability
  client_id?: string | null;
  // raw_ocr_text removed — migrated to satellite table invoice_ocr_text (migration 044)
  processing_time_ms?: number | null;
  extractor_version?: string | null;
  storage_path?: string | null;
  field_confidence?: Record<string, number> | null;
  prompt_hash?: string | null;
  // Fase 1 — document layer
  ocr_document_id?: string | null;
  // REQ-06, AC-06.3: review_required flag (migration 020)
  review_required?: boolean | null;
  // Entity resolution: resolved supplier (sample-entity-resolution)
  supplier_id?: string | null;
}

// ---------------------------------------------------------------------------
// checkDuplicate
// ---------------------------------------------------------------------------

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  duplicateOf?: string;
}

export async function checkDuplicate(
  documentHash: string,
  issuerNif: string | null,
  invoiceNumber: string | null,
  issueDate: string | null,
  totalWithVat: number | null,
  excludeId?: string
): Promise<DuplicateCheckResult> {
  const db = getClient();

  // 1. Check by document hash (fastest path)
  let hashQuery = db
    .from("invoices")
    .select("id")
    .eq("document_hash", documentHash);

  if (excludeId) hashQuery = hashQuery.neq("id", excludeId);

  const { data: byHash } = await hashQuery.limit(1);

  if (byHash && byHash.length > 0) {
    return { isDuplicate: true, duplicateOf: byHash[0].id as string };
  }

  // 2. Check by business key if all fields are present
  if (issuerNif && invoiceNumber && issueDate && totalWithVat !== null) {
    let keyQuery = db
      .from("invoices")
      .select("id")
      .eq("issuer_nif", issuerNif)
      .eq("invoice_number", invoiceNumber)
      .eq("issue_date", issueDate)
      .eq("total_with_vat", totalWithVat)
      .neq("processing_status", "duplicado");

    if (excludeId) keyQuery = keyQuery.neq("id", excludeId);

    const { data: byKey } = await keyQuery.limit(1);

    if (byKey && byKey.length > 0) {
      return { isDuplicate: true, duplicateOf: byKey[0].id as string };
    }
  }

  return { isDuplicate: false };
}

// ---------------------------------------------------------------------------
// updateInvoiceStatus
// ---------------------------------------------------------------------------

export async function updateInvoiceStatus(
  id: string,
  status: InvoiceInsert["processing_status"],
  extra?: Partial<InvoiceInsert>
): Promise<void> {
  const db = getClient();

  const { error } = await db
    .from("invoices")
    .update({ processing_status: status, updated_at: new Date().toISOString(), ...extra })
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to update invoice ${id}: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// InvoiceRow — minimal row shape returned by getInvoiceById
// ---------------------------------------------------------------------------

export interface InvoiceRow {
  id: string;
  issuer_nif: string | null;
  issuer_name: string | null;
  supplier_id: string | null;
}

// ---------------------------------------------------------------------------
// getInvoiceById — fetch minimal invoice fields for correction workflow
// ---------------------------------------------------------------------------

/**
 * Returns the minimal invoice fields needed for a manual supplier correction.
 * Returns null if the invoice does not exist.
 *
 * @param invoiceId - UUID of the invoice to retrieve
 */
export async function getInvoiceById(invoiceId: string): Promise<InvoiceRow | null> {
  const db = getClient();

  const { data, error } = await db
    .from("invoices")
    .select("id, issuer_nif, issuer_name, supplier_id")
    .eq("id", invoiceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch invoice ${invoiceId}: ${error.message}`);
  }

  return (data as InvoiceRow | null) ?? null;
}

// ---------------------------------------------------------------------------
// saveInvoice
// ---------------------------------------------------------------------------

export async function saveInvoice(data: InvoiceInsert): Promise<string> {
  const db = getClient();

  const { data: inserted, error } = await db
    .from("invoices")
    .insert(data)
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to save invoice: ${error.message}`);
  }

  return (inserted as { id: string }).id;
}

// ---------------------------------------------------------------------------
// saveInvoiceItems
// ---------------------------------------------------------------------------

/**
 * Bulk-inserts invoice line items.
 * No-op when items array is empty — does not call Supabase.
 */
export async function saveInvoiceItems(
  invoiceId: string,
  supplierId: string,
  items: InvoiceItem[]
): Promise<void> {
  if (items.length === 0) return;

  const db = getClient();

  const rows = buildInvoiceItemRows({ invoiceId, supplierId, items });

  const { error } = await db.from("invoice_items").insert(rows);

  if (error) {
    throw new Error(error.message ?? `Failed to save invoice items for invoice ${invoiceId}`);
  }
}

// ---------------------------------------------------------------------------
// getInvoiceIdByStoragePath — lookup invoice UUID by storage_path
// ---------------------------------------------------------------------------

/**
 * Returns the invoice UUID for the given storage path, or null if not found.
 * Used by the Python service delegation path to resolve the canonical UUID
 * before calling POST /invoices/{uuid}/process.
 *
 * @param storagePath - Supabase Storage path (e.g. "invoices/client-uuid/2026/file.pdf")
 */
export async function getInvoiceIdByStoragePath(storagePath: string): Promise<string | null> {
  const db = getClient();

  const { data, error } = await db
    .schema("facturas")
    .from("invoices")
    .select("id")
    .eq("storage_path", storagePath)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to lookup invoice by storage_path "${storagePath}": ${error.message}`);
  }

  return (data as { id: string } | null)?.id ?? null;
}
