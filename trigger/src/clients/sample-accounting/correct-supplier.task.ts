import { schemaTask, logger } from "@trigger.dev/sdk";
import { z } from "zod";
import {
  getInvoiceById,
  updateInvoiceStatus,
  createSupplierAlias,
} from "./repository";
import { logResolution } from "./intelligence/resolution-logger";

// ============================================================
// correct-supplier.task.ts — T11 Auto-learning hook (Level 6)
// ============================================================
//
// When a human reviewer corrects the supplier_id on an invoice,
// this task:
//   1. Fetches the invoice (to get issuer_nif / issuer_name)
//   2. Updates invoices.supplier_id to the correct supplier
//   3. Creates a supplier_alias (NIF-based if available, name-based otherwise)
//      so future invoices with the same identifier resolve automatically via alias
//   4. Logs to supplier_resolution_log with method='manual_correction'
//
// Design:
//   - alias_type is always 'manual' (Level 6 human override)
//   - alias_text is issuer_nif when present; falls back to issuer_name
//   - This is idempotent — createSupplierAlias upserts on (supplier_id, alias_text, alias_type)
// ============================================================

const schema = z.object({
  invoiceId:         z.string().uuid(),
  correctSupplierId: z.string().uuid(),
  reviewerId:        z.string(),
});

export type CorrectSupplierPayload = z.infer<typeof schema>;

export const correctSupplierTask = schemaTask({
  id:     "sample-correct-supplier",
  schema,
  run: async (payload: CorrectSupplierPayload) => {
    const { invoiceId, correctSupplierId, reviewerId } = payload;

    // Step 1: Fetch invoice to get issuer identifiers
    const invoice = await getInvoiceById(invoiceId);
    if (!invoice) {
      throw new Error(`Invoice not found: ${invoiceId}`);
    }

    logger.info("Applying manual supplier correction", {
      invoiceId,
      correctSupplierId,
      reviewerId,
      issuerNif:  invoice.issuer_nif,
      issuerName: invoice.issuer_name,
    });

    // Step 2: Update invoice.supplier_id
    await updateInvoiceStatus(invoiceId, "ok", {
      supplier_id: correctSupplierId,
    });

    // Step 3: Create supplier alias for auto-learning
    // Prefer NIF as alias_text (canonical identifier); fall back to name
    const aliasText = invoice.issuer_nif ?? invoice.issuer_name;
    if (aliasText) {
      await createSupplierAlias({
        supplier_id: correctSupplierId,
        alias_text:  aliasText,
        alias_type:  "manual",
        confidence:  1.0,
        created_by:  reviewerId,
      });
    }

    // Step 4: Log to supplier_resolution_log with method='manual_correction'
    await logResolution({
      ocr_document_id:      null,
      input_nif:            invoice.issuer_nif,
      input_name:           invoice.issuer_name,
      resolved_supplier_id: correctSupplierId,
      resolution_method:    "manual_correction",
      confidence:           1.0,
    });

    logger.info("Supplier correction applied and alias registered", {
      invoiceId,
      correctSupplierId,
      aliasText,
    });

    return {
      invoiceId,
      correctSupplierId,
      aliasText,
      aliasType: "manual" as const,
    };
  },
});
