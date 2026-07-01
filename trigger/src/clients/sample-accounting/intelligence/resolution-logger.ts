import { getClient } from "../supabase-client";

// ============================================================
// resolution-logger.ts — Write resolution attempts to DB
// ============================================================

// -----------------------------------------------------------------------
// ResolutionLogInsert — shape of data passed into logResolution()
// -----------------------------------------------------------------------
export interface ResolutionLogInsert {
  ocr_document_id: string | null;
  input_nif: string | null;
  input_name: string | null;
  resolved_supplier_id: string | null;
  resolution_method: "nif_exact" | "alias" | "fuzzy" | "fuzzy_review" | "manual" | "manual_correction" | "new_supplier";
  confidence: number;
}

// -----------------------------------------------------------------------
// logResolution — insert one row into supplier_resolution_log
// created_by is always 'auto' for pipeline-generated entries
// -----------------------------------------------------------------------
export async function logResolution(data: ResolutionLogInsert): Promise<void> {
  const db = getClient();

  const { error } = await db
    .from("supplier_resolution_log")
    .insert({
      ocr_document_id:      data.ocr_document_id,
      input_nif:            data.input_nif,
      input_name:           data.input_name,
      resolved_supplier_id: data.resolved_supplier_id,
      resolution_method:    data.resolution_method,
      confidence:           data.confidence,
      created_by:           "auto",
    });

  if (error) {
    throw new Error(`Failed to log resolution: ${error.message}`);
  }
}
