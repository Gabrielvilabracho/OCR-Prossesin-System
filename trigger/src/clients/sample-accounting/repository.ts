export {
  checkDuplicate,
  getInvoiceById,
  getInvoiceIdByStoragePath,
  updateInvoiceStatus,
  saveInvoice,
  saveInvoiceItems,
} from "./repositories/invoice.repository";
export type { DuplicateCheckResult, InvoiceRow, InvoiceInsert } from "./repositories/invoice.repository";

export {
  getSupplierByNif,
  getAllSuppliersForFuzzy,
  getSupplierAliases,
  upsertSupplier,
  createSupplierAlias,
  resolveIssuerNifByName,
} from "./repositories/supplier.repository";
export type { SupplierRow, SupplierAliasRow, SupplierAliasInsert } from "./repositories/supplier.repository";

export { addToReviewQueue, saveReview } from "./repositories/review-queue.repository";
export type { ReviewQueueInsert, ReviewInsert } from "./repositories/review-queue.repository";

export { saveInvoiceTaxes } from "./repositories/tax.repository";
export { saveValidationResults } from "./repositories/validation.repository";

export { savePayment, updatePaymentStatus } from "./repositories/payment.repository";
export type { PaymentInsert } from "./repositories/payment.repository";

export {
  getAgingReport,
  getCashFlow,
  getSupplierResolutionCount,
} from "./repositories/analytics.repository";
export type { AgingReportRow, CashFlowRow } from "./repositories/analytics.repository";

export { saveAccountingClassification } from "./repositories/accounting-classification.repository";
export type { AccountingClassificationInsert } from "./repositories/accounting-classification.repository";

export { saveOcrDocument, saveExtractionRun, saveInvoiceOcrText } from "./repositories/ocr.repository";

export { resolveClientId } from "./repositories/client.repository";
