import { createClient } from "@supabase/supabase-js";
import type { InvoiceFields } from "../schema";
import { getClient } from "../supabase-client";

// ---------------------------------------------------------------------------
// Loose Supabase client type
// We use a loose client type via unknown cast to avoid generics without
// introducing `any`. Supabase's typed generics require a generated Database
// type from the schema — not available yet for the facturas schema.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSupabaseClient = ReturnType<typeof createClient<Record<string, any>, string>>;

function getClientTyped(): LooseSupabaseClient {
  return getClient() as unknown as LooseSupabaseClient;
}

// ---------------------------------------------------------------------------
// ClassificationResult — output of classifyInvoice()
// ---------------------------------------------------------------------------

export interface ClassificationResult {
  glAccountCode: string;
  glAccountId: string;
  categorySlug: string | null;
  categoryId: string | null;
  confidence: number;
  classifiedBy: "auto";
}

// ---------------------------------------------------------------------------
// Internal DB row shapes (minimal — only fields we read)
// ---------------------------------------------------------------------------

interface DocumentProfileRow {
  gl_account_id: string;
  category_id:   string | null;
  match_count:   number;
}

interface GlAccountRow {
  id:   string;
  code: string;
}

interface CategoryRow {
  id:   string;
  slug: string;
}

// ---------------------------------------------------------------------------
// DEFAULT_GL_CODE — SNC PT class 6 "Fornecimentos e serviços externos"
// Used when no document_profile exists for the supplier
// ---------------------------------------------------------------------------

const DEFAULT_GL_CODE = "62";
const DEFAULT_CONFIDENCE = 0.5;
const PROFILE_CONFIDENCE = 0.9;

// ---------------------------------------------------------------------------
// classifyInvoice — auto GL/category classification for approved invoices
//
// Logic:
// 1. If supplierId is non-null: query document_profiles for this supplier
//    → if profile found: use its gl_account_id + category_id, confidence=0.9
//      AND upsert document_profile (match_count+1, last_seen_at=NOW())
// 2. No profile found: resolve default GL code='62', category=null, confidence=0.5
//    AND upsert document_profile with default GL for next time
// ---------------------------------------------------------------------------

export async function classifyInvoice(
  invoiceId: string,
  supplierId: string | null,
  fields: InvoiceFields
): Promise<ClassificationResult> {
  // Suppress "unused" warning — fields may be used for future keyword-based rules
  void invoiceId;
  void fields;

  const db = getClientTyped();

  if (supplierId) {
    // Step 1: Look up existing document_profile for this supplier
    const { data: profiles, error: profileError } = await db
      .from("document_profiles")
      .select("gl_account_id, category_id, match_count")
      .eq("supplier_id", supplierId)
      .order("match_count", { ascending: false })
      .limit(1);

    if (profileError) {
      throw new Error(`Failed to query document_profiles: ${profileError.message}`);
    }

    const profile = (profiles as DocumentProfileRow[] | null)?.[0] ?? null;

    if (profile) {
      // Profile found — resolve code + slug from IDs
      const [glRow, catRow] = await Promise.all([
        resolveGlAccount(db, profile.gl_account_id),
        profile.category_id ? resolveCategory(db, profile.category_id) : null,
      ]);

      // Update profile: increment match_count + last_seen_at
      await db
        .from("document_profiles")
        .update({ match_count: profile.match_count + 1, last_seen_at: new Date().toISOString() })
        .eq("supplier_id", supplierId)
        .eq("gl_account_id", profile.gl_account_id);

      return {
        glAccountCode: glRow?.code ?? DEFAULT_GL_CODE,
        glAccountId:   profile.gl_account_id,
        categorySlug:  catRow?.slug ?? null,
        categoryId:    profile.category_id,
        confidence:    PROFILE_CONFIDENCE,
        classifiedBy:  "auto",
      };
    }

    // No profile yet — fall through to default, then create initial profile
    const defaultGl = await resolveGlAccountByCode(db, DEFAULT_GL_CODE);
    if (!defaultGl) {
      throw new Error(`Default GL account '${DEFAULT_GL_CODE}' not found in gl_accounts`);
    }

    // Upsert document_profile with the default GL (match_count starts at 1)
    await db
      .from("document_profiles")
      .upsert(
        {
          supplier_id:   supplierId,
          gl_account_id: defaultGl.id,
          category_id:   null,
          match_count:   1,
          last_seen_at:  new Date().toISOString(),
        },
        { onConflict: "supplier_id,gl_account_id", ignoreDuplicates: false }
      );

    return {
      glAccountCode: defaultGl.code,
      glAccountId:   defaultGl.id,
      categorySlug:  null,
      categoryId:    null,
      confidence:    DEFAULT_CONFIDENCE,
      classifiedBy:  "auto",
    };
  }

  // No supplierId — cannot store profile, return default code without DB writes
  const defaultGl = await resolveGlAccountByCode(db, DEFAULT_GL_CODE);
  if (!defaultGl) {
    throw new Error(`Default GL account '${DEFAULT_GL_CODE}' not found in gl_accounts`);
  }

  return {
    glAccountCode: defaultGl.code,
    glAccountId:   defaultGl.id,
    categorySlug:  null,
    categoryId:    null,
    confidence:    DEFAULT_CONFIDENCE,
    classifiedBy:  "auto",
  };
}

// ---------------------------------------------------------------------------
// Helpers — resolve GL account and category by ID or code
// ---------------------------------------------------------------------------

async function resolveGlAccount(
  db: LooseSupabaseClient,
  id: string
): Promise<GlAccountRow | null> {
  const { data, error } = await db
    .from("gl_accounts")
    .select("id, code")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to resolve gl_account: ${error.message}`);
  return (data as GlAccountRow | null) ?? null;
}

async function resolveGlAccountByCode(
  db: LooseSupabaseClient,
  code: string
): Promise<GlAccountRow | null> {
  const { data, error } = await db
    .from("gl_accounts")
    .select("id, code")
    .eq("code", code)
    .maybeSingle();

  if (error) throw new Error(`Failed to resolve gl_account by code: ${error.message}`);
  return (data as GlAccountRow | null) ?? null;
}

async function resolveCategory(
  db: LooseSupabaseClient,
  id: string
): Promise<CategoryRow | null> {
  const { data, error } = await db
    .from("categories")
    .select("id, slug")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to resolve category: ${error.message}`);
  return (data as CategoryRow | null) ?? null;
}
