import { resolveEntity } from "./entity-resolver";
import type { ResolutionResult } from "./entity-resolver";
import { upsertSupplier } from "../repository";

// ============================================================
// supplier-resolver.ts — Shared supplier resolution + persistence
// ============================================================
//
// Encapsulates the resolve → log → upsert-fallback pattern
// used by all 3 ingestion paths (Drive, Gmail, Storage).
//
// Design decisions:
// - resolveEntity() is always called first (authoritative)
// - upsertSupplier() is ONLY called when resolveEntity returns supplierId=null
//   (new supplier: no NIF match, no alias, no fuzzy match above threshold)
// - Returns { supplierId, resolutionResult } — supplierId is always non-null
// - logResolution() is called internally by resolveEntity()
//
// REQ-1: invoice.supplier_id MUST come from resolutionResult.supplierId
// REQ-2: Both Drive and Gmail paths use this function to produce a resolution log row

// ============================================================
// SupplierResolutionOutcome
// ============================================================

export interface SupplierResolutionOutcome {
  supplierId: string;
  resolutionResult: ResolutionResult;
}

// ============================================================
// resolveAndPersistSupplier
// ============================================================

/**
 * Resolves a supplier from OCR-extracted NIF + name, persisting a new supplier
 * only when no existing supplier is found at any resolution level.
 *
 * Resolution cascade (via resolveEntity):
 *   L1: NIF exact match
 *   L2: NIF alias match
 *   L3: Name alias match
 *   L4: Fuzzy auto-accept (score >= 0.95)
 *   L5: Fuzzy review queue (score 0.82–0.94) — supplierId is set but needsReview=true
 *   L6: Unresolved → upsertSupplier() fallback
 *
 * @param ocrDocumentId - UUID of the ocr_document being processed
 * @param issuerNif     - extracted issuer NIF (may be null)
 * @param issuerName    - extracted issuer name (may be null)
 * @returns SupplierResolutionOutcome with non-null supplierId and full ResolutionResult
 */
export async function resolveAndPersistSupplier(
  ocrDocumentId: string,
  issuerNif: string | null,
  issuerName: string | null
): Promise<SupplierResolutionOutcome> {

  // Step 1: Attempt entity resolution via cascade (L1–L5)
  const resolutionResult = await resolveEntity(ocrDocumentId, issuerNif, issuerName);

  // Step 2: If resolved (L1–L5 all return a supplierId), use it directly
  if (resolutionResult.supplierId !== null) {
    return {
      supplierId: resolutionResult.supplierId,
      resolutionResult,
    };
  }

  // Step 3: L6 — no match at any level. Upsert as new supplier (fallback only).
  // This prevents orphan invoices from bad OCR NIFs from polluting the supplier table
  // with duplicates — only truly new suppliers reach this path.
  const fallbackName = issuerName ?? "Fornecedor Desconhecido";
  const newSupplierId = await upsertSupplier(issuerNif, fallbackName);

  return {
    supplierId: newSupplierId,
    resolutionResult,  // method='new_supplier', supplierId=null in log — upsert created the actual supplier
  };
}
