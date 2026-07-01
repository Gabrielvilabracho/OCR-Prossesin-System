// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any;
import { getClient } from "../supabase-client";
import { normalize } from "../intelligence/fuzzy-matcher";
import { validateNif, normalizeNif } from "../utils/nif-validator";
import { logger } from "@trigger.dev/sdk";
import { maskNif } from "../utils/pii-mask";

// ---------------------------------------------------------------------------
// Supplier resolution interfaces — TASK-2-4
// ---------------------------------------------------------------------------

export interface SupplierRow {
  id: string;
  nif: string;
  normalized_name: string | null;
  legal_name: string | null;
  commercial_name: string | null;
  canonical_group?: string | null;
  /** Computed display name: commercial_name ?? legal_name ?? nif */
  display_name?: string;
}

export interface SupplierAliasRow {
  id: string;
  supplier_id: string;
  alias_text: string;
  alias_type: "nif" | "name_exact" | "name_fuzzy" | "manual";
  confidence: number | null;
}

export interface SupplierAliasInsert {
  supplier_id: string;
  alias_text: string;
  alias_type: "nif" | "name_exact" | "name_fuzzy" | "manual";
  confidence?: number | null;
  created_by?: string | null;
}

// ---------------------------------------------------------------------------
// upsertSupplier
// ---------------------------------------------------------------------------

/**
 * Upserts a supplier by NIF (Portuguese 9-digit fiscal identifier).
 * If the supplier already exists, updates the name but preserves category_id.
 * If nif is null, generates a temporary UNKNOWN-{hash} NIF.
 *
 * @returns supplier UUID
 */
export async function upsertSupplier(
  nif: string | null,
  name: string
): Promise<string> {
  const db = getClient();

  const resolvedNif = nif ?? `UNKNOWN-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

  // REQ-2.3: compute normalized_name using the same normalize() from fuzzy-matcher
  // so getAllSuppliersForFuzzy() can return suppliers for fuzzy matching.
  const normalizedName = normalize(name);

  const { data, error } = await db
    .from("suppliers")
    .upsert(
      { nif: resolvedNif, name, normalized_name: normalizedName },
      { onConflict: "nif", ignoreDuplicates: false }
    )
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? `Failed to upsert supplier with NIF: ${resolvedNif}`);
  }

  return (data as { id: string }).id;
}

// ---------------------------------------------------------------------------
// getSupplierByNif — lookup supplier by exact NIF match (TASK-2-4)
// ---------------------------------------------------------------------------

/**
 * Returns the supplier row matching the given NIF, or null if not found.
 * Used as Level 1 of the entity resolution cascade.
 */
export async function getSupplierByNif(nif: string): Promise<SupplierRow | null> {
  const db = getClient();

  const { data, error } = await db
    .from("suppliers")
    .select("id, nif, normalized_name, legal_name, commercial_name, canonical_group")
    .eq("nif", nif)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to lookup supplier by NIF: ${error.message}`);
  }

  if (!data) return null;
  const row = data as Omit<SupplierRow, "display_name">
  return { ...row, display_name: row.commercial_name ?? row.legal_name ?? row.nif }
}

// ---------------------------------------------------------------------------
// getSupplierAliases — fetch all aliases of a given type (TASK-2-4)
// ---------------------------------------------------------------------------

/**
 * Returns all supplier_aliases rows matching the given alias_type.
 * Used in Levels 2 and 3 of the entity resolution cascade.
 */
export async function getSupplierAliases(
  aliasType: "nif" | "name_exact" | "name_fuzzy" | "manual"
): Promise<SupplierAliasRow[]> {
  const db = getClient();

  const { data, error } = await db
    .from("supplier_aliases")
    .select("id, supplier_id, alias_text, alias_type, confidence")
    .eq("alias_type", aliasType);

  if (error) {
    throw new Error(`Failed to fetch supplier aliases: ${error.message}`);
  }

  return (data as SupplierAliasRow[]) ?? [];
}

// ---------------------------------------------------------------------------
// createSupplierAlias — idempotent upsert of a supplier alias (TASK-2-4)
// ---------------------------------------------------------------------------

/**
 * Upserts a supplier alias by (supplier_id, alias_text, alias_type).
 * Returns the alias UUID (new or existing).
 */
export async function createSupplierAlias(data: SupplierAliasInsert): Promise<string> {
  const db = getClient();

  const { data: row, error } = await db
    .from("supplier_aliases")
    .upsert(data, { onConflict: "supplier_id,alias_text,alias_type", ignoreDuplicates: false })
    .select("id")
    .single();

  if (error || !row) {
    throw new Error(error?.message ?? "Failed to create supplier alias");
  }

  return (row as { id: string }).id;
}

// ---------------------------------------------------------------------------
// getAllSuppliersForFuzzy — fetch all suppliers with normalized_name (TASK-2-5)
// Used by entity-resolver to run fuzzy scan across all suppliers
// ---------------------------------------------------------------------------

/**
 * Returns all suppliers that have a normalized_name set.
 * Used by the fuzzy resolution path (Levels 4 and 5).
 */
export async function getAllSuppliersForFuzzy(): Promise<Pick<SupplierRow, "id" | "normalized_name">[]> {
  const db = getClient();

  const { data, error } = await db
    .from("suppliers")
    .select("id, normalized_name")
    .not("normalized_name", "is", null);

  if (error) {
    throw new Error(`Failed to fetch suppliers for fuzzy match: ${error.message}`);
  }

  return (data as Pick<SupplierRow, "id" | "normalized_name">[]) ?? [];
}

// ---------------------------------------------------------------------------
// resolveIssuerNifByName — fuzzy name→NIF lookup in facturas.suppliers (TASK: sample-issuer-nif-name-lookup)
// ---------------------------------------------------------------------------

/**
 * Normalizes a name for fuzzy comparison:
 * - lowercases
 * - strips punctuation: , . - &
 * - collapses multiple spaces
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[,.\-&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Levenshtein distance between two strings.
 * Implemented inline — no external dependency.
 */
function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1]
        ? dp[i - 1]![j - 1]!
        : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }
  return dp[a.length]![b.length]!;
}

/**
 * Token overlap ratio between two normalized name strings.
 * Tokens shorter than 3 characters are ignored (articles, prepositions).
 * Returns a value in [0, 1]: 1.0 = all tokens from the smaller set are shared.
 */
function tokenOverlap(a: string, b: string): number {
  const tokensA = new Set(a.split(" ").filter((t) => t.length > 2));
  const tokensB = new Set(b.split(" ").filter((t) => t.length > 2));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let shared = 0;
  for (const t of tokensA) if (tokensB.has(t)) shared++;
  return shared / Math.min(tokensA.size, tokensB.size);
}

/**
 * Resolves a supplier NIF by fuzzy-matching the issuerName against facturas.suppliers.name.
 *
 * Matching strategy (hybrid — either condition wins):
 * 1. Levenshtein distance ≤ 5 (names ≤ 40 chars) or ≤ 8 (longer) — handles single-char OCR typos
 * 2. Token overlap ratio ≥ 0.5 — handles truncated names and OCR word substitutions
 *    (e.g. "MAKRO ALFABRIA" matches "MAKRO CASH & CARRY PORTUGAL, S.A." via shared token "makro")
 *
 * When multiple candidates match, picks the one with the highest token overlap.
 * Strips PT prefix, validates PT checksum before returning.
 * NEVER logs raw NIF — uses maskNif().
 *
 * @param supabase  - pre-built Supabase client (injected for testability)
 * @param issuerName - raw issuer name from LLM extraction
 * @returns normalized PT NIF or null
 */
export async function resolveIssuerNifByName(
  supabase: AnySupabaseClient,
  issuerName: string,
): Promise<string | null> {
  // Use schema-qualified query to bypass PostgREST schema cache issues
  // after column drops. rpc with raw SQL avoids the cached column list.
  const { data, error } = await supabase
    .schema("facturas")
    .from("suppliers")
    .select("nif, legal_name, commercial_name")
    .eq("country", "PT");

  if (error) {
    logger.warn("[repository] resolveIssuerNifByName: Supabase error", { error: error.message });
    return null;
  }

  if (!data || (data as { nif: string; legal_name: string | null; commercial_name: string | null }[]).length === 0) return null;

  const normalizedInput = normalizeName(issuerName);
  const levenshteinThreshold = normalizedInput.length <= 40 ? 5 : 8;
  const TOKEN_OVERLAP_MIN = 0.5;

  let bestNif: string | null = null;
  let bestOverlap = -1;

  for (const row of data as { nif: string; legal_name: string | null; commercial_name: string | null }[]) {
    // Match against both commercial and legal name — either can appear on an invoice
    const displayName = row.commercial_name ?? row.legal_name ?? row.nif;
    const normalizedSupplier = normalizeName(displayName);
    const dist = levenshtein(normalizedInput, normalizedSupplier);
    const overlap = tokenOverlap(normalizedInput, normalizedSupplier);

    const levenshteinMatch = dist <= levenshteinThreshold;
    const tokenMatch = overlap >= TOKEN_OVERLAP_MIN;

    if ((levenshteinMatch || tokenMatch) && overlap > bestOverlap) {
      bestOverlap = overlap;
      bestNif = row.nif;
    }
  }

  if (bestNif === null) return null;

  // Strip PT prefix if present
  const stripped = normalizeNif(bestNif);
  if (stripped === null) return null;

  // Validate PT NIFs (9-digit) via mod-11 checksum
  if (/^\d{9}$/.test(stripped)) {
    if (!validateNif(stripped)) {
      logger.warn("[repository] resolveIssuerNifByName: matched NIF fails checksum", {
        nif: maskNif(stripped),
        issuer_name: issuerName,
      });
      return null;
    }
  }

  logger.info("[repository] resolveIssuerNifByName: match found", {
    issuer_name: issuerName,
    nif: maskNif(stripped),
    token_overlap: bestOverlap,
  });

  return stripped;
}
