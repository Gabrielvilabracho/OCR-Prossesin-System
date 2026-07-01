import type { ClassificationResult, EfacturaMockResult, InvoiceFields, InvoiceItem } from "../schema";
import { normalizeUnit } from "../intelligence/unit-normalizer";

export interface BuildInvoiceInsertParams {
  sourceType: "drive" | "gmail" | "manual" | "storage";
  sourceRef: string;
  fileName: string;
  documentHash: string;
  fields: InvoiceFields;
  efacturaResult: EfacturaMockResult;
  classification: ClassificationResult;
}

export function buildInvoiceInsert(params: BuildInvoiceInsertParams) {
  const { sourceType, sourceRef, fileName, documentHash, fields, efacturaResult, classification } =
    params;

  return {
    source_type: sourceType,
    source_ref: sourceRef,
    file_name: fileName,
    document_hash: documentHash,
    processing_status: classification.status,
    invoice_number: fields.invoice_number,
    issuer_nif: fields.issuer_nif,
    receiver_nif: fields.receiver_nif,
    issuer_name: fields.issuer_name,
    issue_date: fields.issue_date,
    total_with_vat: fields.total_with_vat,
    total_without_vat: fields.total_without_vat,
    vat_total: fields.vat_total,
    vat_breakdown: fields.vat_breakdown,
    llm_confidence: fields.llm_confidence,
    duplicate_of: classification.duplicate_of ?? null,
    review_reason: classification.reason ?? null,
    raw_extraction: fields,
    efactura_result: efacturaResult,
    // B1 extended fields
    receiver_name:  fields.receiver_name  ?? null,
    due_date:       fields.due_date       ?? null,
    currency:       fields.currency       ?? null,
    document_type:  fields.document_type  ?? null,
    origin_country: fields.origin_country ?? null,
    atcud:          fields.atcud          ?? null,
  };
}

export interface BuildInvoiceItemRowsParams {
  invoiceId: string;
  supplierId: string;
  items: InvoiceItem[];
}

export interface InvoiceItemInsertRow {
  invoice_id: string;
  supplier_id: string;
  line_number: number | null;
  description: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  net_amount: number | null;
  vat_rate: number | null;
  vat_amount: number | null;
  gross_amount: number | null;
}

export function buildInvoiceItemRows(params: BuildInvoiceItemRowsParams): InvoiceItemInsertRow[] {
  const { invoiceId, supplierId, items } = params;

  return items.map((item) => ({
    invoice_id: invoiceId,
    supplier_id: supplierId,
    line_number: item.line_number,
    description: item.description,
    quantity: item.quantity ?? null,
    unit: normalizeUnit(item.unit),
    unit_price: item.unit_price ?? null,
    net_amount: item.net_amount,
    vat_rate: item.vat_rate ?? null,
    vat_amount: item.vat_amount ?? null,
    gross_amount: item.gross_amount,
  }));
}
