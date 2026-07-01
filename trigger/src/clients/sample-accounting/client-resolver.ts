// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any;
import type { InvoiceFields } from "./schema";
import { validateNif, normalizeNif } from "./utils/nif-validator";
import { maskNif } from "./utils/pii-mask";
import { resolveIssuerNifByName } from "./repository";
import { logger } from "@trigger.dev/sdk";
import { getClient } from "./supabase-client";

/**
 * Resolves receiver_name by looking up the NIF in noxx_clients.
 * Returns the registered legal name if found, null otherwise.
 * Logs Supabase errors instead of silently swallowing them.
 */
export async function resolveReceiverByNif(
  receiverNif: string | null | undefined,
): Promise<string | null> {
  if (!receiverNif || receiverNif.trim() === "") return null;

  const supabase = getClient();
  const { data, error } = await supabase
    .from("noxx_clients")
    .select("legal_name")
    .eq("nif", receiverNif)
    .maybeSingle();

  if (error) {
    console.error("[client-resolver] resolveReceiverByNif Supabase error", { nif: maskNif(receiverNif), error: error.message });
  }

  return (data as { legal_name: string } | null)?.legal_name ?? null;
}

/**
 * Enriches fields.receiver_name by looking up fields.receiver_nif in noxx_clients.
 * If a legal name is found it is set as receiver_name.
 * Returns the (potentially enriched) fields object — mutates in place for consistency
 * with the existing inline enrichment pattern in process-single-invoice.task.ts.
 * Never throws — Supabase errors are caught and the original LLM value is kept.
 */
export async function enrichReceiverName(fields: InvoiceFields): Promise<InvoiceFields> {
  if (!fields.receiver_nif || fields.receiver_nif.trim() === "") return fields;

  try {
    const resolvedName = await resolveReceiverByNif(fields.receiver_nif);
    if (resolvedName) {
      fields.receiver_name = resolvedName;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[client-resolver] enrichReceiverName failed — keeping LLM value", { error: message });
  }

  return fields;
}

/**
 * Enriches fields.issuer_nif by:
 * 1. If issuer_nif is NOT null: normalize, validate PT checksum, apply swap guard
 * 2. If issuer_nif IS null AND issuer_name is present: resolve from supplier DB via fuzzy name match
 * 3. Passing through foreign VAT numbers (2-letter country prefix)
 * 4. Optionally confirming against a pre-loaded supplierNifs array
 *
 * Requires a Supabase client for the DB name-lookup fallback.
 * Returns the (potentially mutated) fields object.
 */
export async function enrichIssuerNif(
  fields: InvoiceFields,
  supabase: AnySupabaseClient | null,
  supplierNifs?: string[],
): Promise<InvoiceFields> {
  // Step 1: DB fallback when LLM failed to extract issuer_nif
  if (fields.issuer_nif == null) {
    if (supabase !== null && fields.issuer_name && fields.issuer_name.trim() !== "") {
      try {
        const resolved = await resolveIssuerNifByName(supabase, fields.issuer_name);
        if (resolved !== null) {
          fields.issuer_nif = resolved;
          logger.info("issuer_nif resolved from supplier DB", {
            issuer_name: fields.issuer_name,
            nif: maskNif(resolved),
          });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn("[client-resolver] enrichIssuerNif DB lookup failed — issuer_nif remains null", { error: message });
      }
    }
    // If still null after DB attempt, return as-is
    if (fields.issuer_nif == null) return fields;
  }

  // Step 2: normalize (strip PT prefix, spaces/dots/hyphens)
  const normalized = normalizeNif(fields.issuer_nif);
  if (normalized == null) {
    fields.issuer_nif = null;
    return fields;
  }

  // Step 3: validate if it looks like a 9-digit PT NIF
  // If checksum fails, fall back to DB name lookup before giving up
  if (/^\d{9}$/.test(normalized)) {
    if (!validateNif(normalized)) {
      if (supabase !== null && fields.issuer_name && fields.issuer_name.trim() !== "") {
        try {
          const resolved = await resolveIssuerNifByName(supabase, fields.issuer_name);
          if (resolved !== null) {
            fields.issuer_nif = resolved;
            logger.info("issuer_nif recovered via name lookup after checksum fail", {
              issuer_name: fields.issuer_name,
              nif: maskNif(resolved),
            });
            return fields;
          }
        } catch {
          // ignore — fall through to null
        }
      }
      fields.issuer_nif = null;
      return fields;
    }
  }

  // Step 4: swap guard — issuer must not equal receiver (normalize receiver for comparison only)
  const normalizedReceiver = normalizeNif(fields.receiver_nif ?? '') ?? fields.receiver_nif;
  if (normalized === normalizedReceiver) {
    fields.issuer_nif = null;
    return fields;
  }

  // Step 5: optional supplier confirmation (no-op if supplierNifs not provided)
  // If the NIF is in the known suppliers list, it's confirmed — no further action needed.
  // If not in the list AND not a foreign VAT, it still passes (validation already confirmed it).
  // supplierNifs is kept in signature for API compatibility with existing callers.

  // Step 6: assign normalized value
  fields.issuer_nif = normalized;
  return fields;
}
