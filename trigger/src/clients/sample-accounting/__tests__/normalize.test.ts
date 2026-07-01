import { describe, it, expect } from "vitest";
import { normalizeSource } from "../sources/normalize";
import { SourceDocumentSchema } from "../schema";
import type { DriveFile } from "../sources/drive";
import type { GmailMessage } from "../sources/gmail";

const fakePdfBytes = Buffer.from("%PDF-1.4 minimal pdf content for testing");

describe("normalizeSource — drive", () => {
  const driveFile: DriveFile = {
    id: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
    name: "invoice-2026-001.pdf",
    mimeType: "application/pdf",
  };

  it("returns a SourceDocument with source_type=drive", () => {
    const result = normalizeSource("drive", driveFile, fakePdfBytes);

    expect(result.source_type).toBe("drive");
    expect(result.source_ref).toBe(driveFile.id);
    expect(result.file_name).toBe(driveFile.name);
  });

  it("returns a SourceDocument with non-empty pdf_bytes", () => {
    const result = normalizeSource("drive", driveFile, fakePdfBytes);

    expect(Buffer.isBuffer(result.pdf_bytes)).toBe(true);
    expect(result.pdf_bytes.length).toBeGreaterThan(0);
    expect(result.pdf_bytes.toString()).toContain("%PDF");
  });

  it("includes mimeType in metadata for drive source", () => {
    const result = normalizeSource("drive", driveFile, fakePdfBytes);

    expect(result.metadata["mimeType"]).toBe("application/pdf");
  });
});

describe("normalizeSource — gmail", () => {
  const gmailMessage: GmailMessage = {
    messageId: "18f2e1a2b3c4d5e6",
    attachmentId: "ANGjdJ9xyz",
    fileName: "factura-enero-2026.pdf",
  };

  it("returns a SourceDocument with source_type=gmail", () => {
    const result = normalizeSource("gmail", gmailMessage, fakePdfBytes);

    expect(result.source_type).toBe("gmail");
    expect(result.source_ref).toBe(gmailMessage.messageId);
    expect(result.file_name).toBe(gmailMessage.fileName);
  });

  it("includes attachmentId in metadata for gmail source", () => {
    const result = normalizeSource("gmail", gmailMessage, fakePdfBytes);

    expect(result.metadata["attachmentId"]).toBe("ANGjdJ9xyz");
  });

  it("returns a SourceDocument that passes Zod validation", () => {
    const result = normalizeSource("gmail", gmailMessage, fakePdfBytes);

    const parsed = SourceDocumentSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });
});
