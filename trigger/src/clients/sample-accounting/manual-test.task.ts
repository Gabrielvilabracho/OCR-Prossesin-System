import { schemaTask, logger } from "@trigger.dev/sdk";
import { z } from "zod";
import { processInvoiceViaPython, PythonServiceError } from "./python-service/client";
import type { PythonServiceResult } from "./python-service/client";

// ---------------------------------------------------------------------------
// Payload schema
// ---------------------------------------------------------------------------

const ManualTestPayloadSchema = z.object({
  invoiceId:  z.string().uuid(),
  storageKey: z.string(),
  client_id:  z.string().uuid(),
  dryRun:     z.boolean().optional().default(false),
});

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

export interface ManualTestOutput {
  invoiceId:  string | null;
  status:     PythonServiceResult["status"];
  errors:     string[];
}

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

export const sampleManualTest = schemaTask({
  id: "sample-manual-test",
  schema: ManualTestPayloadSchema,
  maxDuration: 300,
  retry: { maxAttempts: 2 },

  run: async (payload): Promise<ManualTestOutput> => {
    const { invoiceId, storageKey, client_id, dryRun } = payload;

    logger.info("sample-manual-test: start", { invoiceId, storageKey, dryRun });

    try {
      const result = await processInvoiceViaPython({
        invoiceId,
        storageKey,
        clientId: client_id,
        dryRun,
      });

      logger.info("sample-manual-test: done", {
        invoiceId:  result.invoice_id,
        status:     result.status,
        errors:     result.errors.length,
      });

      return {
        invoiceId: result.invoice_id,
        status:    result.status,
        errors:    result.errors,
      };

    } catch (err: unknown) {
      const message = err instanceof PythonServiceError
        ? err.message
        : err instanceof Error ? err.message : String(err);

      logger.error("sample-manual-test: Python service failed", { invoiceId, error: message });
      throw err;
    }
  },
});
