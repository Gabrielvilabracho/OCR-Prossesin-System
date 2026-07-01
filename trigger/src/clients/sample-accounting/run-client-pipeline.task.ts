import { schemaTask, logger, idempotencyKeys } from "@trigger.dev/sdk";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { processSingleInvoice } from "./process-single-invoice.task";

// ---------------------------------------------------------------------------
// Payload schema
// ---------------------------------------------------------------------------

export const RunClientPipelineSchema = z.object({
  client_id:    z.string().uuid(),
  triggered_by: z.string().uuid(),
  batch_id:     z.string().uuid().optional(),
});

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface RunClientPipelineResult {
  dispatched: number;
  client_id:  string;
}

// ---------------------------------------------------------------------------
// Supabase client (lazy)
// ---------------------------------------------------------------------------

function getSupabaseClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return createClient(url, key, { db: { schema: "facturas" } });
}

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

export const runClientPipeline = schemaTask({
  id:     "sample-run-client-pipeline",
  schema: RunClientPipelineSchema,
  retry:  { maxAttempts: 2 },

  run: async (payload): Promise<RunClientPipelineResult> => {
    const startMs = Date.now();
    const { client_id, triggered_by, batch_id } = payload;

    logger.info("run-client-pipeline: start", {
      task:         "run-client-pipeline",
      client:       "sample-accounting",
      client_id,
      triggered_by,
      batch_id:     batch_id ?? null,
    });

    const db = getSupabaseClient();

    // -----------------------------------------------------------------------
    // List files in noxx-invoices/invoices/{client_id}/{year}/{month}/
    // Portal uploads to: invoices/{clientId}/{year}/{month}/{uuid}-{filename}.pdf
    // We need 2-level recursive listing: year → month → files
    // -----------------------------------------------------------------------

    const rootPath = `invoices/${client_id}`;

    // Helper: list a directory prefix — returns entries with name and id
    type ListEntry = { name: string; id: string | null };
    async function listPrefix(prefix: string): Promise<ListEntry[]> {
      const { data, error } = await db.storage
        .from("noxx-invoices")
        .list(prefix, { limit: 1000 });
      if (error) {
        logger.warn("run-client-pipeline: storage list warning", { prefix, error: error.message });
        return [];
      }
      return (data ?? []).map((f) => ({ name: f.name, id: f.id ?? null }));
    }

    // Level 0: list year subdirectories under invoices/{client_id}/
    const yearEntries = await listPrefix(rootPath);

    // Collect all PDF files across year/month subdirectories
    const pdfFiles: { name: string; storageKey: string }[] = [];

    for (const yearEntry of yearEntries) {
      if (!yearEntry.id) {
        // It's a "directory" placeholder — list month subdirs inside it
        const yearPath = `${rootPath}/${yearEntry.name}`;
        const monthEntries = await listPrefix(yearPath);

        for (const monthEntry of monthEntries) {
          if (!monthEntry.id) {
            // Another directory level — list files inside month dir
            const monthPath = `${yearPath}/${monthEntry.name}`;
            const fileEntries = await listPrefix(monthPath);
            for (const f of fileEntries) {
              if (f.id && f.name.toLowerCase().endsWith(".pdf")) {
                pdfFiles.push({ name: f.name, storageKey: `${monthPath}/${f.name}` });
              }
            }
          } else if (monthEntry.name.toLowerCase().endsWith(".pdf")) {
            // File directly under year dir (non-standard but handle it)
            pdfFiles.push({ name: monthEntry.name, storageKey: `${yearPath}/${monthEntry.name}` });
          }
        }
      } else if (yearEntry.name.toLowerCase().endsWith(".pdf")) {
        // File directly under client root (non-standard)
        pdfFiles.push({ name: yearEntry.name, storageKey: `${rootPath}/${yearEntry.name}` });
      }
    }

    if (yearEntries.length === 0) {
      logger.warn("run-client-pipeline: storage list error", {
        client_id,
        path:  rootPath,
        error: "empty root",
      });
    }

    if (pdfFiles.length === 0) {
      logger.info("run-client-pipeline: no files found", {
        task:      "run-client-pipeline",
        client_id,
        path:      rootPath,
      });

      // Still insert audit_log even when empty
      await db.from("audit_log").insert({
        table_name:    "pipeline_trigger",
        operation:     "TRIGGER",
        row_id:        client_id,
        staff_user_id: triggered_by,
        new_data: {
          client_id,
          triggered_by,
          run_id:      null,
          batch_id:    batch_id ?? null,
          files_found: 0,
        },
      });

      return { dispatched: 0, client_id };
    }

    // -----------------------------------------------------------------------
    // batchTrigger one process-single-invoice per file
    // Idempotency key: scoped per client + batch (or timestamp) + file
    // Prevents duplicate processing if the pipeline is re-triggered (A3-FR-001)
    // -----------------------------------------------------------------------

    const batchScope = batch_id ?? Date.now();
    const batchKey   = await idempotencyKeys.create(`sample-pipeline-${client_id}-${batchScope}`);

    const items = pdfFiles.map((f) => ({
      payload: {
        sourceType: "storage" as const,
        sourceRef:  f.storageKey,
        fileName:   f.name,
        client_id,
        storageKey: f.storageKey,
        ...(batch_id ? { batch_id } : {}),
      },
      options: {
        idempotencyKey:    `${batchKey}-${f.name}`,
        idempotencyKeyTTL: "1h" as const,
      },
    }));

    await processSingleInvoice.batchTrigger(items as Parameters<typeof processSingleInvoice.batchTrigger>[0]);

    const dispatched = pdfFiles.length;

    logger.info("run-client-pipeline: dispatched", {
      task:        "run-client-pipeline",
      client:      "sample-accounting",
      client_id,
      dispatched,
      duration_ms: Date.now() - startMs,
    });

    // -----------------------------------------------------------------------
    // INSERT audit_log
    // -----------------------------------------------------------------------

    await db.from("audit_log").insert({
      table_name:    "pipeline_trigger",
      operation:     "TRIGGER",
      row_id:        client_id,
      staff_user_id: triggered_by,
      new_data: {
        client_id,
        triggered_by,
        run_id:      null,
        batch_id:    batch_id ?? null,
        files_found: dispatched,
      },
    });

    return { dispatched, client_id };
  },
});
