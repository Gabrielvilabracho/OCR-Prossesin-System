import { schedules, logger } from "@trigger.dev/sdk";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface PurgeExpiredInvoicesResult {
  dry_run:    boolean;
  found:      number;
  deleted:    number;
  client_id?: string;
}

// ---------------------------------------------------------------------------
// Supabase client (lazy, facturas schema)
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
// Payload schema — dry_run defaults to true (B1-FR-002: first run ALWAYS dry)
// ---------------------------------------------------------------------------

const PurgeExpiredInvoicesSchema = z.object({
  dry_run:   z.boolean().default(true),
  client_id: z.string().uuid().optional(),
});

// ---------------------------------------------------------------------------
// Task — daily 02:00 UTC (B1-FR-001)
// ---------------------------------------------------------------------------

export const purgeExpiredInvoices = schedules.task({
  id:   "sample-purge-expired-invoices",
  cron: "0 2 * * *",

  run: async (payload): Promise<PurgeExpiredInvoicesResult> => {
    // schedules.task receives ScheduledRunPayload — extract our fields from metadata
    // When triggered manually (tests / portal), payload contains our schema fields.
    // Parse from payload with defaults.
    const parsed = PurgeExpiredInvoicesSchema.parse(payload);
    const { dry_run, client_id } = parsed;

    const db = getSupabaseClient();
    const now = new Date().toISOString();

    // -----------------------------------------------------------------------
    // Step 1: SELECT invoices WHERE retention_until < now()
    //         Optionally scoped to a single client (B1-FR-003)
    // -----------------------------------------------------------------------

    let query = db
      .from("invoices")
      .select("id, client_id, retention_until")
      .lt("retention_until", now);

    if (client_id) {
      query = query.eq("client_id", client_id);
    }

    const { data, error: selectError } = await query;

    if (selectError) {
      logger.error("purge-expired-invoices: query failed", { error: selectError.message, dry_run });
      throw new Error(`purge-expired-invoices: SELECT failed — ${selectError.message}`);
    }

    const expired = (data ?? []) as { id: string; client_id: string; retention_until: string }[];
    const found   = expired.length;

    logger.info("purge-expired-invoices: dry_run summary", {
      task:      "purge-expired-invoices",
      client:    "sample-accounting",
      dry_run,
      found,
      client_id: client_id ?? null,
      note:      dry_run ? "dry_run=true — no data will be deleted" : "proceeding with delete",
    });

    // -----------------------------------------------------------------------
    // Step 2: dry_run=true → log and return (B1-FR-002)
    // -----------------------------------------------------------------------

    if (dry_run) {
      return { dry_run: true, found, deleted: 0, ...(client_id ? { client_id } : {}) };
    }

    // -----------------------------------------------------------------------
    // Step 3: dry_run=false → for each invoice:
    //   a) INSERT audit_log BEFORE delete (B1-FR-003)
    //   b) Batch delete
    // -----------------------------------------------------------------------

    if (found === 0) {
      return { dry_run: false, found: 0, deleted: 0, ...(client_id ? { client_id } : {}) };
    }

    // Insert one audit_log row per invoice before deleting (immutable audit trail)
    for (const invoice of expired) {
      const { error: auditError } = await db.from("audit_log").insert({
        table_name:    "invoices",
        operation:     "GDPR_PURGE",
        row_id:        invoice.id,
        staff_user_id: null,   // system operation
        new_data: {
          invoice_id:      invoice.id,
          client_id:       invoice.client_id,
          retention_until: invoice.retention_until,
          purged_at:       now,
        },
      });

      if (auditError) {
        // Log but don't abort — missing audit is logged, not silently ignored
        logger.error("purge-expired-invoices: audit_log insert failed", {
          invoice_id: invoice.id,
          error:      auditError.message,
        });
      }
    }

    // Batch delete by IDs
    const ids = expired.map((i) => i.id);
    const { error: deleteError } = await db
      .from("invoices")
      .delete()
      .in("id", ids);

    if (deleteError) {
      logger.error("purge-expired-invoices: delete failed", {
        ids_attempted: ids.length,
        error:         deleteError.message,
      });
      throw new Error(`purge-expired-invoices: DELETE failed — ${deleteError.message}`);
    }

    logger.info("purge-expired-invoices: complete", {
      task:      "purge-expired-invoices",
      client:    "sample-accounting",
      dry_run:   false,
      found,
      deleted:   found,
      client_id: client_id ?? null,
    });

    return { dry_run: false, found, deleted: found, ...(client_id ? { client_id } : {}) };
  },
});
