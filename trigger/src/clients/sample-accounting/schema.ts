import { z } from "zod";

// ============================================================
// ExtractionErrorCategory — const-object + type + Zod enum
// REQ-01: describes quality issues found during extraction
// ============================================================

export const EXTRACTION_ERROR_CATEGORY = {
  OCR_QUALITY:   "ocr_quality",
  SEMANTIC:      "semantic",
  ARITHMETIC:    "arithmetic",
  FORMAT:        "format",
  MISSING_FIELD: "missing_field",
} as const;

export type ExtractionErrorCategory = typeof EXTRACTION_ERROR_CATEGORY[keyof typeof EXTRACTION_ERROR_CATEGORY];

export const ExtractionErrorCategorySchema = z.enum([
  "ocr_quality",
  "semantic",
  "arithmetic",
  "format",
  "missing_field",
]);

// ============================================================
// CONFIDENCE_REVIEW_THRESHOLD — unified threshold for all rules
// REQ-04: any field_confidence value below this triggers review
// AC-05.4: boundary === 0.7 does NOT trigger (strict less-than)
// ============================================================

export const CONFIDENCE_REVIEW_THRESHOLD = 0.7;

// ============================================================
// INVOICE_FIELD_KEYS — canonical per-field confidence keys
// REQ-03: 10 fixed keys used for normalizeFieldConfidence()
// ============================================================

export const INVOICE_FIELD_KEYS = [
  "invoice_number",
  "issue_date",
  "issuer_name",
  "issuer_nif",
  "receiver_name",
  "receiver_nif",
  "total_without_vat",
  "vat_total",
  "total_with_vat",
  "currency",
] as const;

export type InvoiceFieldKey = typeof INVOICE_FIELD_KEYS[number];

// ============================================================
// normalizeFieldConfidence — fills missing canonical fields with 0.5
// REQ-03: pure function, exported for use by extractor and tests
// ============================================================

export function normalizeFieldConfidence(
  raw: Record<string, number> | undefined
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const key of INVOICE_FIELD_KEYS) {
    result[key] = raw?.[key] ?? 0.5;
  }
  return result;
}

// ============================================================
// deriveGlobalConfidence — weighted average across canonical fields
// REQ-04: backward-compatible scalar for legacy paths
//
// Critical fields (weight 2): invoice_number, issue_date, issuer_name,
//   issuer_nif, total_with_vat
// Standard fields (weight 1): receiver_name, receiver_nif,
//   total_without_vat, vat_total, currency
//
// Rationale: Math.min was too strict — a single 0 on an optional field
// like receiver_name would collapse global confidence to 0 even when
// all critical fields were extracted correctly.
// ============================================================

const FIELD_WEIGHTS: Record<string, number> = {
  invoice_number:    2,
  issue_date:        2,
  issuer_name:       2,
  issuer_nif:        2,
  total_with_vat:    2,
  receiver_name:     1,
  receiver_nif:      1,
  total_without_vat: 1,
  vat_total:         1,
  currency:          1,
};

export function deriveGlobalConfidence(fc: Record<string, number>): number {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const key of INVOICE_FIELD_KEYS) {
    const weight = FIELD_WEIGHTS[key] ?? 1;
    const value  = fc[key] ?? 0.5;
    weightedSum += value * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return 0.5;
  return Math.round((weightedSum / totalWeight) * 100) / 100;
}

// ============================================================
// computeReviewRequired — any field < CONFIDENCE_REVIEW_THRESHOLD
// REQ-05: AC-05.4 boundary 0.7 === false (strict less-than)
// ============================================================

export function computeReviewRequired(fc: Record<string, number>): boolean {
  return Object.values(fc).some((v) => v < CONFIDENCE_REVIEW_THRESHOLD);
}

// ============================================================
// InvoiceItemSchema — single line item extracted from invoice
// PT IVA rates: 0% (isento), 6% (reduzida), 13% (intermédia), 23% (normal)
// ============================================================
export const InvoiceItemSchema = z.object({
  line_number:  z.number().int().positive().nullable(),
  description:  z.string().min(1),
  quantity:     z.number().nullable(),
  unit:         z.string().nullable().default(null),
  unit_price:   z.number().nullable(),
  net_amount:   z.number().nullable(),
  vat_rate:     z.number().min(0).max(100).nullable(),
  vat_amount:   z.number().nullable(),
  gross_amount: z.number().nullable(),
});

export type InvoiceItem = z.infer<typeof InvoiceItemSchema>;

// ============================================================
// InvoiceFieldsSchema — header fields + line items
// items defaults to [] — valid for invoices without line detail
// ============================================================
export const InvoiceFieldsSchema = z.object({
  // Core invoice fields (nullable: LLM may fail to extract any of them)
  invoice_number:    z.string().nullable(),
  issuer_nif:        z.string().nullable(),
  receiver_nif:      z.string().nullable(),
  issuer_name:       z.string().nullable(),
  issue_date:        z.string().nullable(), // ISO 8601 date string, e.g. "2026-01-15"
  total_with_vat:    z.number().nullable(),
  total_without_vat: z.number().nullable(),
  vat_total:         z.number().nullable(),
  vat_breakdown:     z.unknown().nullable(), // flexible: array of rate/base/amount objects

  // Line items (v3) — empty array is valid for header-only invoices
  items: z.array(InvoiceItemSchema).default([]),

  // B1 extended header fields — all nullable for backward-compat
  receiver_name:   z.string().nullable().optional().default(null),
  due_date:        z.string().nullable().optional().default(null),
  currency:        z.string().nullable().optional().default(null),
  document_type:   z.enum([
    "fatura",
    "fatura_simplificada",
    "fatura_recibo",
    "nota_credito",
    "nota_debito",
    "recibo",
    "proforma",
  ]).nullable().optional().default(null),
  origin_country:  z.string().nullable().optional().default(null),
  atcud:           z.string().nullable().optional().default(null),

  // LLM metadata
  // llm_confidence: derived = Math.min(...field_confidence values), kept optional for backward compat
  llm_confidence: z.number().min(0).max(1).optional(),
  missing_fields: z.array(z.string()),

  // Per-field extraction confidence (REQ-02, REQ-03)
  field_confidence: z.record(z.string(), z.number().min(0).max(1)).optional(),

  // Extraction error categories (REQ-01)
  extraction_error_categories: z.array(ExtractionErrorCategorySchema).default([]),
});

export type InvoiceFields = z.infer<typeof InvoiceFieldsSchema>;

// ============================================================
// DOCUMENT_TYPES — valid values for document_type field (sprint1)
// ============================================================
export const DOCUMENT_TYPES = [
  "fatura",
  "fatura_simplificada",
  "fatura_recibo",
  "nota_credito",
  "nota_debito",
  "recibo",
  "proforma",
] as const;

export type DocumentType = typeof DOCUMENT_TYPES[number];

// ============================================================
// SourceDocumentSchema — normalized input from Drive or Gmail
// ============================================================
export const SourceDocumentSchema = z.object({
  source_type: z.enum(["drive", "gmail"]),
  source_ref:  z.string(),           // fileId (Drive) or messageId (Gmail)
  file_name:   z.string(),
  pdf_bytes:   z.instanceof(Buffer),
  metadata:    z.record(z.string(), z.unknown()), // flexible key-value metadata
});

export type SourceDocument = z.infer<typeof SourceDocumentSchema>;

// ============================================================
// EfacturaMockResultSchema — mock eFactura verification result
// ============================================================
export const EfacturaMockResultSchema = z.object({
  provider:         z.string(),
  check_id:         z.string(),
  status:           z.enum(["matched", "mismatch", "not_found"]),
  matched_fields:   z.array(z.string()),
  mismatch_reasons: z.array(z.string()),
  checked_at:       z.string(), // ISO 8601 datetime
  next_step:        z.string(),
});

export type EfacturaMockResult = z.infer<typeof EfacturaMockResultSchema>;

// ============================================================
// ClassificationResultSchema — outcome of duplicate detection
// ============================================================
export const ClassificationResultSchema = z.object({
  status:       z.enum(["ok", "duplicado", "requires_review"]),
  reason:       z.string().optional(),
  duplicate_of: z.string().uuid().optional(), // uuid of existing prototype_invoice
});

export type ClassificationResult = z.infer<typeof ClassificationResultSchema>;

// ============================================================
// MathValidationResultSchema — output of validateInvoiceMath()
// ============================================================
export const MathValidationResultSchema = z.object({
  valid:  z.boolean(),
  errors: z.array(z.string()),
});

export type MathValidationResult = z.infer<typeof MathValidationResultSchema>;

// ============================================================
// ReviewActionSchema — human review decision
// ============================================================
export const ReviewActionSchema = z.object({
  decision:    z.enum(["approved", "rejected", "edited"]),
  reason:      z.string().optional(),
  reviewed_by: z.string(),
});

export type ReviewAction = z.infer<typeof ReviewActionSchema>;

// ============================================================
// OcrDocument — DB row from facturas.ocr_documents
// ============================================================
export interface OcrDocument {
  id: string;
  organization_id: string | null;
  client_id: string | null;
  source_type: "drive" | "storage" | "gmail";
  source_ref: string;
  folder_ref: string | null;
  file_name: string | null;
  file_size_bytes: number | null;
  storage_path: string | null;
  document_hash: string;
  created_at: string;
  updated_at: string;
}

export interface OcrDocumentInsert {
  organization_id?: string | null;
  client_id?: string | null;
  source_type: "drive" | "storage" | "gmail";
  source_ref: string;
  folder_ref?: string | null;
  file_name?: string | null;
  file_size_bytes?: number | null;
  storage_path?: string | null;
  document_hash: string;
  mime_type?: string;
}

// ============================================================
// ExtractionRun — DB row from facturas.extraction_runs
// ============================================================
export interface ExtractionRun {
  id: string;
  ocr_document_id: string;
  raw_ocr_text: string | null;
  structured_json: unknown;
  confidence: number | null;
  extractor_version: string | null;
  prompt_hash: string | null;
  processing_time_ms: number | null;
  created_at: string;
}

export interface ExtractionRunInsert {
  ocr_document_id: string;
  raw_ocr_text?: string | null;
  structured_json?: unknown;
  confidence?: number | null;
  extractor_version?: string | null;
  prompt_hash?: string | null;
  processing_time_ms?: number | null;
  // REQ-06, AC-06.2: error categories from extraction (migration 020)
  error_categories?: string[] | null;
}
