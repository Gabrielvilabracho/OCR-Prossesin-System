import { SourceDocumentSchema, type SourceDocument } from "../schema";
import type { DriveFile } from "./drive";
import type { GmailMessage } from "./gmail";

// ============================================================
// normalizeSource
// ============================================================

/**
 * Normalizes a raw Drive or Gmail source into a validated SourceDocument.
 *
 * Pure function: same input always produces same output.
 *
 * @param source - The originating platform
 * @param raw - DriveFile (for 'drive') or GmailMessage (for 'gmail')
 * @param pdfBytes - PDF content already downloaded as Buffer
 * @returns SourceDocument validated by Zod
 * @throws ZodError if the resulting document is structurally invalid
 */
export function normalizeSource(
  source: "drive" | "gmail",
  raw: DriveFile | GmailMessage,
  pdfBytes: Buffer
): SourceDocument {
  let sourceRef: string;
  let fileName: string;
  let metadata: Record<string, unknown>;

  if (source === "drive") {
    const driveFile = raw as DriveFile;
    sourceRef = driveFile.id;
    fileName = driveFile.name;
    metadata = { mimeType: driveFile.mimeType };
  } else {
    const gmailMsg = raw as GmailMessage;
    sourceRef = gmailMsg.messageId;
    fileName = gmailMsg.fileName;
    metadata = { attachmentId: gmailMsg.attachmentId };
  }

  const document = {
    source_type: source,
    source_ref: sourceRef,
    file_name: fileName,
    pdf_bytes: pdfBytes,
    metadata,
  };

  // Validate with Zod — throws ZodError on schema mismatch
  return SourceDocumentSchema.parse(document);
}
