import { createClient } from "@supabase/supabase-js";

/**
 * Lazy Supabase client factory — instantiated on first use.
 * Returns a client connected to the `facturas` schema.
 */
export function getClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return createClient(url, key, {
    db: {
      schema: "facturas",
    },
  });
}
