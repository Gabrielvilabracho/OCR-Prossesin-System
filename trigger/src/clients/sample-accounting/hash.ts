import { createHash } from "node:crypto";

/**
 * Computes a SHA-256 hex digest of the given buffer.
 * Used as the primary duplicate-detection key for invoice PDFs.
 */
export function computeHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
