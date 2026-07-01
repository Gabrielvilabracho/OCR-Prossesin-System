import { schemaTask, logger } from "@trigger.dev/sdk";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { getGmailUser, getGoogleAuthClient } from "./config";
import { listPdfFiles } from "./sources/drive";
import { listMessagesWithPdfAttachments } from "./sources/gmail";
import { processSingleInvoice } from "./process-single-invoice.task";

// ---------------------------------------------------------------------------
// Payload schema
// ---------------------------------------------------------------------------

const CollectInvoicesSchema = z.object({
  sources:            z.array(z.enum(["drive", "gmail"])).min(1),
  dryRun:             z.boolean().optional().default(false),
  maxPerSource:       z.number().int().min(1).optional(),   // NO .max(20) — removed per R1.3
  sourceRefAllowlist: z.array(z.string().min(1)).optional(),
  previewOnly:        z.boolean().optional().default(false),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SourceRef {
  sourceType:   "drive" | "gmail";
  sourceRef:    string;
  fileName:     string;
  mimeType?:    string;
  attachmentId?: string;
  folderRef?:   string;
  client_id?:   string;
}

type CollectResult =
  | { dispatched: number; dryRun: boolean }
  | { previewed: SourceRef[]; dryRun: boolean };

interface SampleClientRow {
  id:              string;
  legal_name:      string;
  drive_folder_id: string;
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
// Query active noxx_clients with a Drive folder
// ---------------------------------------------------------------------------

async function queryActiveClients(): Promise<SampleClientRow[]> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from("noxx_clients")
    .select("id, legal_name, drive_folder_id")
    .eq("status", "active")
    .not("drive_folder_id", "is", null);

  if (error) {
    throw new Error(`Failed to query noxx_clients: ${error.message}`);
  }

  return (data ?? []) as SampleClientRow[];
}

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

export const collectInvoices = schemaTask({
  id:     "sample-invoice-pipeline",   // SAME as original — zero breaking change
  schema: CollectInvoicesSchema,
  retry:  { maxAttempts: 2 },

  run: async (payload): Promise<CollectResult> => {
    const startMs = Date.now();
    const { sources, dryRun, maxPerSource, sourceRefAllowlist, previewOnly } = payload;

    // -----------------------------------------------------------------------
    // Multi-client: load active clients from DB (Drive sources only)
    // -----------------------------------------------------------------------

    const clients: SampleClientRow[] = sources.includes("drive")
      ? await logger.trace("query-sample-clients", () => queryActiveClients())
      : [];

    logger.info("collect-invoices: start", {
      task:          "collect-invoices",
      client:        "sample-accounting",
      sources,
      dryRun,
      clients_found: clients.length,
    });

    const auth = getGoogleAuthClient();

    // -----------------------------------------------------------------------
    // Discover Drive sources — one folder per client
    // -----------------------------------------------------------------------

    const allowlist      = new Set(sourceRefAllowlist ?? []);
    const shouldFilter   = allowlist.size > 0;
    const driveRefs: SourceRef[] = [];

    if (sources.includes("drive")) {
      for (const client of clients) {
        const rawFiles = await logger.trace(`list-drive-files:${client.id}`, async () =>
          listPdfFiles(client.drive_folder_id, auth)
        );

        const filtered = shouldFilter
          ? rawFiles.filter((f) => allowlist.has(f.id))
          : rawFiles;

        const sliced = typeof maxPerSource === "number"
          ? filtered.slice(0, maxPerSource)
          : filtered;

        for (const f of sliced) {
          driveRefs.push({
            sourceType: "drive",
            sourceRef:  f.id,
            fileName:   f.name,
            mimeType:   f.mimeType,
            folderRef:  client.drive_folder_id,
            client_id:  client.id,
          });
        }
      }
    }

    // -----------------------------------------------------------------------
    // Discover Gmail sources
    // -----------------------------------------------------------------------

    const gmailMessagesRaw = sources.includes("gmail")
      ? await logger.trace("list-gmail-messages", async () => {
          const user = getGmailUser();
          return listMessagesWithPdfAttachments(user, auth);
        })
      : [];

    const gmailFiltered = shouldFilter
      ? gmailMessagesRaw.filter((m) => allowlist.has(m.messageId))
      : gmailMessagesRaw;

    const gmailMessages = typeof maxPerSource === "number"
      ? gmailFiltered.slice(0, maxPerSource)
      : gmailFiltered;

    const gmailRefs: SourceRef[] = gmailMessages.map((m) => ({
      sourceType:   "gmail" as const,
      sourceRef:    m.messageId,
      fileName:     m.fileName,
      attachmentId: m.attachmentId,
    }));

    // -----------------------------------------------------------------------
    // Combined refs
    // -----------------------------------------------------------------------

    const refs: SourceRef[] = [...driveRefs, ...gmailRefs];

    logger.info("collect-invoices: sources collected", {
      task:                  "collect-invoices",
      driveRefsSelected:     driveRefs.length,
      gmailMessagesSelected: gmailRefs.length,
      maxPerSource:          maxPerSource ?? null,
      allowlistSize:         allowlist.size,
      previewOnly,
      dryRun,
    });

    // -----------------------------------------------------------------------
    // previewOnly: return discovered refs without dispatching
    // -----------------------------------------------------------------------

    if (previewOnly) {
      logger.info("collect-invoices: preview mode", {
        task:            "collect-invoices",
        discoveredCount: refs.length,
        dryRun,
      });
      return { previewed: refs, dryRun };
    }

    // -----------------------------------------------------------------------
    // Guard: skip refs that have no client_id (Gmail path is out of scope for
    // multi-client — those refs are created without a client_id).
    // -----------------------------------------------------------------------

    const refsWithClient: Array<SourceRef & { client_id: string }> = [];
    for (const ref of refs) {
      if (!ref.client_id) {
        logger.warn("Skipping ref without client_id (Gmail source not yet multi-client)", {
          sourceType: ref.sourceType,
          fileName:   ref.fileName,
        });
        continue;
      }
      refsWithClient.push(ref as SourceRef & { client_id: string });
    }

    // -----------------------------------------------------------------------
    // Dispatch: chunk into groups of 500 (batchTrigger limit is 1000, 500 is safer)
    // -----------------------------------------------------------------------

    const CHUNK_SIZE = 500;
    let dispatched = 0;

    for (let i = 0; i < refsWithClient.length; i += CHUNK_SIZE) {
      const chunk = refsWithClient.slice(i, i + CHUNK_SIZE);
      const items = chunk.map((ref) => ({
        payload: {
          sourceType:   ref.sourceType,
          sourceRef:    ref.sourceRef,
          fileName:     ref.fileName,
          dryRun,
          mimeType:     ref.mimeType,
          attachmentId: ref.attachmentId,
          folderRef:    ref.folderRef,
          client_id:    ref.client_id,
        },
      }));

      await processSingleInvoice.batchTrigger(items);
      dispatched += chunk.length;
    }

    const durationMs = Date.now() - startMs;
    logger.info("collect-invoices: complete", {
      task:        "collect-invoices",
      client:      "sample-accounting",
      sources,
      dispatched,
      dryRun,
      duration_ms: durationMs,
    });

    return { dispatched, dryRun };
  },
});
