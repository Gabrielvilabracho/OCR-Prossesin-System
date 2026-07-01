import { getSupplierByNif, getSupplierAliases, getAllSuppliersForFuzzy } from "../repository";
import { logResolution } from "./resolution-logger";
import { jaroWinkler, normalize } from "./fuzzy-matcher";

// ============================================================
// ResolutionResult — output contract for every resolution path
// ============================================================

export interface ResolutionResult {
  supplierId: string | null;
  method: "nif_exact" | "alias" | "fuzzy" | "fuzzy_review" | "manual" | "new_supplier";
  confidence: number;
  needsReview: boolean;
}

// ============================================================
// Thresholds
// ============================================================

const FUZZY_AUTO_ACCEPT = 0.95;     // Level 4 — auto-accept fuzzy match (NOT CONFIDENCE_REVIEW_THRESHOLD)
const FUZZY_NEEDS_REVIEW = 0.82;    // Level 5 — flag for review
const NAME_ALIAS_CONFIDENCE = 0.95; // Level 3 — reported confidence for name alias exact match

// ============================================================
// resolveEntity — 6-level priority cascade
// ============================================================

/**
 * Resolves a supplier from OCR-extracted NIF + name.
 * Runs through 6 resolution levels in priority order.
 * Always calls logResolution() at the end of the selected path.
 *
 * @param ocrDocumentId - UUID of the ocr_document being processed
 * @param inputNif      - extracted issuer NIF (may be null)
 * @param inputName     - extracted issuer name (may be null)
 * @returns ResolutionResult with supplierId, method, confidence, needsReview
 */
export async function resolveEntity(
  ocrDocumentId: string,
  inputNif: string | null,
  inputName: string | null
): Promise<ResolutionResult> {

  // ------------------------------------------------------------------
  // Level 1 — NIF exact match in suppliers.nif
  // ------------------------------------------------------------------
  if (inputNif) {
    const supplier = await getSupplierByNif(inputNif);
    if (supplier) {
      const result: ResolutionResult = {
        supplierId: supplier.id,
        method: "nif_exact",
        confidence: 1.0,
        needsReview: false,
      };
      await logResolution({
        ocr_document_id: ocrDocumentId,
        input_nif: inputNif,
        input_name: inputName,
        resolved_supplier_id: supplier.id,
        resolution_method: result.method,
        confidence: result.confidence,
      });
      return result;
    }
  }

  // ------------------------------------------------------------------
  // Level 2 — NIF in supplier_aliases (alias_type = 'nif')
  // ------------------------------------------------------------------
  if (inputNif) {
    const nifAliases = await getSupplierAliases("nif");
    const nifAlias = nifAliases.find((a) => a.alias_text === inputNif);
    if (nifAlias) {
      const result: ResolutionResult = {
        supplierId: nifAlias.supplier_id,
        method: "alias",
        confidence: 0.98,
        needsReview: false,
      };
      await logResolution({
        ocr_document_id: ocrDocumentId,
        input_nif: inputNif,
        input_name: inputName,
        resolved_supplier_id: nifAlias.supplier_id,
        resolution_method: result.method,
        confidence: result.confidence,
      });
      return result;
    }
  }

  // ------------------------------------------------------------------
  // Level 3 — Name in supplier_aliases (name_exact or manual)
  // ------------------------------------------------------------------
  if (inputName) {
    const nameExactAliases = await getSupplierAliases("name_exact");
    const manualAliases    = await getSupplierAliases("manual");
    const allNameAliases   = [...nameExactAliases, ...manualAliases];

    const normalizedInput = normalize(inputName);
    const nameAlias = allNameAliases.find(
      (a) => normalize(a.alias_text) === normalizedInput
    );

    if (nameAlias) {
      const result: ResolutionResult = {
        supplierId: nameAlias.supplier_id,
        method: "alias",
        confidence: NAME_ALIAS_CONFIDENCE,
        needsReview: false,
      };
      await logResolution({
        ocr_document_id: ocrDocumentId,
        input_nif: inputNif,
        input_name: inputName,
        resolved_supplier_id: nameAlias.supplier_id,
        resolution_method: result.method,
        confidence: result.confidence,
      });
      return result;
    }
  }

  // ------------------------------------------------------------------
  // Level 4 + 5 — Fuzzy match against all suppliers.normalized_name
  // ------------------------------------------------------------------
  if (inputName) {
    const normalizedInput = normalize(inputName);
    const allSuppliers = await getAllSuppliersForFuzzy();

    let bestScore = 0;
    let bestSupplierId: string | null = null;

    for (const supplier of allSuppliers) {
      if (!supplier.normalized_name) continue;
      const score = jaroWinkler(normalizedInput, supplier.normalized_name);
      if (score > bestScore) {
        bestScore = score;
        bestSupplierId = supplier.id;
      }
    }

    if (bestScore >= FUZZY_AUTO_ACCEPT && bestSupplierId) {
      // Level 4 — auto-accept
      const result: ResolutionResult = {
        supplierId: bestSupplierId,
        method: "fuzzy",
        confidence: bestScore,
        needsReview: false,
      };
      await logResolution({
        ocr_document_id: ocrDocumentId,
        input_nif: inputNif,
        input_name: inputName,
        resolved_supplier_id: bestSupplierId,
        resolution_method: result.method,
        confidence: bestScore,
      });
      return result;
    }

    if (bestScore >= FUZZY_NEEDS_REVIEW && bestSupplierId) {
      // Level 5 — needs human review
      const result: ResolutionResult = {
        supplierId: bestSupplierId,
        method: "fuzzy_review",
        confidence: bestScore,
        needsReview: true,
      };
      await logResolution({
        ocr_document_id: ocrDocumentId,
        input_nif: inputNif,
        input_name: inputName,
        resolved_supplier_id: bestSupplierId,
        resolution_method: result.method,
        confidence: bestScore,
      });
      return result;
    }
  }

  // ------------------------------------------------------------------
  // Level 6 — No match at any level → new_supplier (unknown entity)
  // ------------------------------------------------------------------
  const result: ResolutionResult = {
    supplierId: null,
    method: "new_supplier",
    confidence: 0,
    needsReview: true,
  };
  await logResolution({
    ocr_document_id: ocrDocumentId,
    input_nif: inputNif,
    input_name: inputName,
    resolved_supplier_id: null,
    resolution_method: result.method,
    confidence: 0,
  });
  return result;
}
