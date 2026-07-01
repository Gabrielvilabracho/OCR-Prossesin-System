import { createClient } from "@supabase/supabase-js";

// Lazy client — instantiated on first use, not at import time.
// This prevents build-time failures when env vars are not yet available
// during Trigger.dev indexing phase.
let _supabase: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient(): ReturnType<typeof createClient> {
  if (!_supabase) {
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_KEY"];
    if (!url || !key) {
      throw new Error("SUPABASE_URL and SUPABASE_KEY must be set");
    }
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// Backwards-compatible named export for existing code
export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop) {
    return getSupabaseClient()[prop as keyof ReturnType<typeof createClient>];
  },
});
