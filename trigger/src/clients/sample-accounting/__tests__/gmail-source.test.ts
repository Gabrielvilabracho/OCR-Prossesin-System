import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock googleapis before importing the module under test
vi.mock("googleapis", () => {
  return {
    google: {
      auth: {
        OAuth2: vi.fn().mockImplementation(() => ({
          setCredentials: vi.fn(),
        })),
      },
      gmail: vi.fn().mockReturnValue({
        users: {
          messages: {
            list: vi.fn(),
            get: vi.fn(),
            attachments: {
              get: vi.fn(),
            },
          },
        },
      }),
    },
  };
});

import { google } from "googleapis";
import {
  listMessagesWithPdfAttachments,
  downloadAttachment,
} from "../sources/gmail";

const mockAuthClient = { setCredentials: vi.fn() };

function makeGmailMock(overrides: {
  messagesList?: ReturnType<typeof vi.fn>;
  messagesGet?: ReturnType<typeof vi.fn>;
  attachmentsGet?: ReturnType<typeof vi.fn>;
}) {
  const mock = {
    users: {
      messages: {
        list: overrides.messagesList ?? vi.fn(),
        get: overrides.messagesGet ?? vi.fn(),
        attachments: {
          get: overrides.attachmentsGet ?? vi.fn(),
        },
      },
    },
  };
  (google.gmail as ReturnType<typeof vi.fn>).mockReturnValue(mock);
  return mock;
}

describe("listMessagesWithPdfAttachments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns messages that have PDF attachments", async () => {
    // Simulate two messages: one with PDF, one without
    const messageRefs = [{ id: "msg-001" }, { id: "msg-002" }];
    const messageWithPdf = {
      data: {
        id: "msg-001",
        payload: {
          parts: [
            {
              mimeType: "application/pdf",
              filename: "invoice.pdf",
              body: { attachmentId: "att-001" },
            },
          ],
        },
      },
    };
    const messageWithoutPdf = {
      data: {
        id: "msg-002",
        payload: {
          parts: [
            {
              mimeType: "text/plain",
              filename: "",
              body: { data: "bWVzc2FnZQ==" },
            },
          ],
        },
      },
    };

    const messagesGetFn = vi
      .fn()
      .mockResolvedValueOnce(messageWithPdf)
      .mockResolvedValueOnce(messageWithoutPdf);

    makeGmailMock({
      messagesList: vi.fn().mockResolvedValue({ data: { messages: messageRefs } }),
      messagesGet: messagesGetFn,
    });

    const results = await listMessagesWithPdfAttachments("me", mockAuthClient as never);

    // Only the message with a PDF attachment is returned
    expect(results).toHaveLength(1);
    expect(results[0].messageId).toBe("msg-001");
    expect(results[0].attachmentId).toBe("att-001");
    expect(results[0].fileName).toBe("invoice.pdf");
  });

  it("returns empty array when no messages match", async () => {
    makeGmailMock({
      messagesList: vi.fn().mockResolvedValue({ data: { messages: [] } }),
    });

    const results = await listMessagesWithPdfAttachments("me", mockAuthClient as never);

    expect(results).toHaveLength(0);
    expect(Array.isArray(results)).toBe(true);
  });

  it("filters messages without PDF attachments returning empty", async () => {
    const messageRefs = [{ id: "msg-003" }];
    const messageNoAttachment = {
      data: {
        id: "msg-003",
        payload: {
          parts: [
            {
              mimeType: "text/html",
              filename: "",
              body: { data: "PGh0bWw+" },
            },
          ],
        },
      },
    };

    makeGmailMock({
      messagesList: vi.fn().mockResolvedValue({ data: { messages: messageRefs } }),
      messagesGet: vi.fn().mockResolvedValue(messageNoAttachment),
    });

    const results = await listMessagesWithPdfAttachments("me", mockAuthClient as never);

    expect(results).toHaveLength(0);
  });
});

describe("downloadAttachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a Buffer from a valid messageId + attachmentId", async () => {
    // Gmail returns base64url-encoded data
    const base64urlData = Buffer.from("%PDF-1.4 fake pdf").toString("base64");

    makeGmailMock({
      attachmentsGet: vi.fn().mockResolvedValue({ data: { data: base64urlData, size: 100 } }),
    });

    const result = await downloadAttachment(
      "me",
      "msg-001",
      "att-001",
      mockAuthClient as never
    );

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns Buffer whose content matches the base64-decoded attachment data", async () => {
    const originalContent = "fake-pdf-binary-content";
    const base64Data = Buffer.from(originalContent).toString("base64");

    makeGmailMock({
      attachmentsGet: vi.fn().mockResolvedValue({ data: { data: base64Data, size: originalContent.length } }),
    });

    const result = await downloadAttachment(
      "user@example.com",
      "msg-xyz",
      "att-xyz",
      mockAuthClient as never
    );

    expect(result.toString()).toBe(originalContent);
  });

  it("throws an error when the attachment does not exist", async () => {
    makeGmailMock({
      attachmentsGet: vi.fn().mockRejectedValue(new Error("Attachment not found")),
    });

    await expect(
      downloadAttachment("me", "msg-bad", "att-bad", mockAuthClient as never)
    ).rejects.toThrow("Attachment not found");
  });
});
