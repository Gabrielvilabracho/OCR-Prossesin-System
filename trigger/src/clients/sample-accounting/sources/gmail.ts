import { google } from "googleapis";

// ============================================================
// Types
// ============================================================

export interface GmailMessage {
  messageId: string;
  attachmentId: string;
  fileName: string;
}

type AuthClient = InstanceType<typeof google.auth.OAuth2>;

// ============================================================
// Internal helpers
// ============================================================

interface MessagePart {
  mimeType?: string | null;
  filename?: string | null;
  body?: {
    attachmentId?: string | null;
    data?: string | null;
  } | null;
  parts?: MessagePart[] | null;
}

/**
 * Recursively searches message parts for a PDF attachment.
 * Returns the first PDF attachment found, or null.
 */
function findPdfAttachment(
  parts: MessagePart[]
): { attachmentId: string; fileName: string } | null {
  for (const part of parts) {
    if (
      part.mimeType === "application/pdf" &&
      part.filename &&
      part.body?.attachmentId
    ) {
      return { attachmentId: part.body.attachmentId, fileName: part.filename };
    }
    if (part.parts) {
      const nested = findPdfAttachment(part.parts);
      if (nested) return nested;
    }
  }
  return null;
}

// ============================================================
// listMessagesWithPdfAttachments
// ============================================================

/**
 * Lists Gmail messages that contain at least one PDF attachment.
 *
 * @param userId - Gmail user ID (usually "me")
 * @param auth - Authenticated OAuth2 client
 * @returns Array of GmailMessage objects with messageId, attachmentId, fileName
 */
export async function listMessagesWithPdfAttachments(
  userId: string,
  auth: AuthClient
): Promise<GmailMessage[]> {
  const gmail = google.gmail({ version: "v1", auth });

  // List all messages (optionally filtered by has:attachment)
  const listResponse = await gmail.users.messages.list({
    userId,
    q: "has:attachment",
    maxResults: 50,
  });

  const messageRefs = listResponse.data.messages ?? [];
  if (messageRefs.length === 0) return [];

  const results: GmailMessage[] = [];

  for (const ref of messageRefs) {
    if (!ref.id) continue;

    const msg = await gmail.users.messages.get({
      userId,
      id: ref.id,
      format: "full",
    });

    const parts = msg.data.payload?.parts ?? [];
    const pdfAttachment = findPdfAttachment(parts as MessagePart[]);

    if (pdfAttachment) {
      results.push({
        messageId: ref.id,
        attachmentId: pdfAttachment.attachmentId,
        fileName: pdfAttachment.fileName,
      });
    }
  }

  return results;
}

// ============================================================
// downloadAttachment
// ============================================================

/**
 * Downloads a Gmail attachment and returns it as a Buffer.
 *
 * @param userId - Gmail user ID (usually "me")
 * @param messageId - Gmail message ID
 * @param attachmentId - Attachment ID within the message
 * @param auth - Authenticated OAuth2 client
 * @returns Attachment contents as a Buffer
 * @throws Error if attachment does not exist
 */
export async function downloadAttachment(
  userId: string,
  messageId: string,
  attachmentId: string,
  auth: AuthClient
): Promise<Buffer> {
  const gmail = google.gmail({ version: "v1", auth });

  const response = await gmail.users.messages.attachments.get({
    userId,
    messageId,
    id: attachmentId,
  });

  const base64Data = response.data.data ?? "";

  // Gmail returns base64url encoding — convert to standard base64 then decode
  const standardBase64 = base64Data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(standardBase64, "base64");
}
