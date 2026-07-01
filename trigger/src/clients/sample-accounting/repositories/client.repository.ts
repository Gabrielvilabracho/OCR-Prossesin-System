import { getClient } from "../supabase-client";

// ---------------------------------------------------------------------------
// resolveClientId — lookup client from source_client_map
// ---------------------------------------------------------------------------

/**
 * Looks up a client_id from source_client_map by (source_type, source_ref).
 * Returns null if no mapping exists — pipeline continues gracefully.
 *
 * IMPORTANT — Drive source_ref contract:
 *   For Drive sources, sourceRef MUST be the **folder ID** (not the file ID).
 *   The source_client_map maps a Drive folder to a client, not individual files.
 *   Call this ONCE per pipeline run using getDriveFolderId() before the files loop.
 *   Reuse the returned clientId for every file inside that folder.
 *
 * @param sourceType - "drive" or "gmail"
 * @param folderId   - For Drive: the folder ID. For Gmail: the message or label identifier.
 */
export async function resolveClientId(
  sourceType: "drive" | "gmail",
  folderId: string
): Promise<string | null> {
  const sourceRef = folderId;
  const db = getClient();
  const { data, error } = await db
    .from("source_client_map")
    .select("client_id")
    .eq("source_type", sourceType)
    .eq("source_ref", sourceRef)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve client mapping: ${error.message}`);
  }

  return (data as { client_id: string } | null)?.client_id ?? null;
}
