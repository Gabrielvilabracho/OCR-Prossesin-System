import { schemaTask, logger } from "@trigger.dev/sdk";
import { z } from "zod";
import { maskNif } from "./utils/pii-mask";
import { processInvoiceViaPython, PythonServiceError } from "./python-service/client";
import { getInvoiceIdByStoragePath } from "./repository";

// ---------------------------------------------------------------------------
// Payload schema
// ---------------------------------------------------------------------------

export const ProcessSingleInvoiceSchema = z.object({
  sourceType:   z.enum(["drive", "gmail", "storage"]),
  sourceRef:    z.string(),
  fileName:     z.string(),
  dryRun:       z.boolean().default(false),
  mimeType:     z.string().optional(),
  attachmentId: z.string().optional(),
  folderRef:    z.string().optional(),
  client_id:    z.string().uuid(),
  storageKey:   z.string().optional(),  // required when sourceType="storage"
  batch_id:     z.string().uuid().optional(),
});

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface ProcessSingleInvoiceResult {
  sourceType:  "drive" | "gmail" | "storage";
  sourceRef:   string;
  status:      "ok" | "requires_review" | "duplicate" | "fiscal_duplicate" | "error" | "skipped";
  invoiceId?:  string;
  error?:      string;
  skipped?:    boolean;
}

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

export const processSingleInvoice = schemaTask({
  id:    "sample-process-single-invoice",
  schema: ProcessSingleInvoiceSchema,
  queue: { concurrencyLimit: 10 },
  retry: { maxAttempts: 2 },

  run: async (payload): Promise<ProcessSingleInvoiceResult> => {
    const startTime = Date.now();
    const { sourceType, sourceRef, dryRun, client_id, storageKey } = payload;

    logger.info("process-single-invoice: start", {
      task:       "process-single-invoice",
      client:     "sample-accounting",
      sourceType,
      sourceRef,
      dryRun,
    });

    // dryRun short-circuit — no DB writes whatsoever
    if (dryRun) {
      logger.info("process-single-invoice: dryRun skip", { sourceType, sourceRef: maskNif(sourceRef) });
      return { sourceType, sourceRef, status: "skipped", skipped: true };
    }

    return processViaPythonService({ sourceType, sourceRef, storageKey, clientId: client_id, startTime });
  },
});

// ── Python service delegation ──────────────────────────────────────────────

async function processViaPythonService({
  sourceType,
  sourceRef,
  storageKey,
  clientId,
  startTime,
}: {
  sourceType: "drive" | "gmail" | "storage";
  sourceRef:  string;
  storageKey?: string;
  clientId:   string;
  startTime:  number;
}): Promise<ProcessSingleInvoiceResult> {
  const resolvedStorageKey = storageKey ?? sourceRef;

  try {
    // Resolve the canonical invoice UUID from the storage path.
    // The Python service endpoint expects a real UUID in the URL:
    // POST /invoices/{uuid}/process — NOT the storage path.
    const invoiceId = await getInvoiceIdByStoragePath(resolvedStorageKey);

    if (!invoiceId) {
      logger.warn("process-single-invoice: invoice not found by storage_path", { resolvedStorageKey });
      return { sourceType, sourceRef, status: "error", error: `Invoice not found for storage_path: ${resolvedStorageKey}` };
    }

    const result = await processInvoiceViaPython({
      invoiceId,
      storageKey: resolvedStorageKey,
      clientId,
    });

    logger.info("process-single-invoice: Python service done", {
      task:        "process-single-invoice",
      sourceType,
      sourceRef,
      duration_ms: Date.now() - startTime,
      status:      result.status,
      errors:      result.errors.length,
    });

    return {
      sourceType,
      sourceRef,
      status:     result.status === "success" ? "ok" : "error",
      invoiceId:  result.invoice_id ?? undefined,
      error:      result.errors.length > 0 ? result.errors.join("; ") : undefined,
    };

  } catch (err: unknown) {
    const message = err instanceof PythonServiceError
      ? err.message
      : err instanceof Error ? err.message : String(err);

    logger.error("process-single-invoice: Python service failed", {
      sourceType,
      sourceRef,
      error: message,
    });

    return { sourceType, sourceRef, status: "error", error: message };
  }
}
