import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock googleapis before importing the module under test
vi.mock("googleapis", () => {
  const mockFilesListFn = vi.fn();
  const mockFilesGetFn = vi.fn();

  return {
    google: {
      auth: {
        OAuth2: vi.fn().mockImplementation(() => ({
          setCredentials: vi.fn(),
        })),
      },
      drive: vi.fn().mockReturnValue({
        files: {
          list: mockFilesListFn,
          get: mockFilesGetFn,
        },
      }),
    },
    _mockFilesListFn: mockFilesListFn,
    _mockFilesGetFn: mockFilesGetFn,
  };
});

import { google } from "googleapis";
import { listPdfFiles, downloadPdf } from "../sources/drive";

// Helper to access the mock functions set on the module
function getDriveMocks() {
  const driveInstance = (google.drive as ReturnType<typeof vi.fn>).mock.results[0]?.value ?? {
    files: {
      list: vi.fn(),
      get: vi.fn(),
    },
  };
  return driveInstance.files as {
    list: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
}

const mockAuthClient = { setCredentials: vi.fn() };

describe("listPdfFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (google.drive as ReturnType<typeof vi.fn>).mockReturnValue({
      files: {
        list: vi.fn(),
        get: vi.fn(),
      },
    });
  });

  it("returns array of DriveFile objects with id, name, mimeType", async () => {
    const mockFiles = [
      { id: "file-id-1", name: "invoice-001.pdf", mimeType: "application/pdf" },
      { id: "file-id-2", name: "invoice-002.pdf", mimeType: "application/pdf" },
    ];

    (google.drive as ReturnType<typeof vi.fn>).mockReturnValue({
      files: {
        list: vi.fn().mockResolvedValue({ data: { files: mockFiles } }),
        get: vi.fn(),
      },
    });

    const results = await listPdfFiles("folder-123", mockAuthClient as never);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      id: "file-id-1",
      name: "invoice-001.pdf",
      mimeType: "application/pdf",
    });
    expect(results[1].id).toBe("file-id-2");
  });

  it("returns empty array when folder has no PDF files", async () => {
    (google.drive as ReturnType<typeof vi.fn>).mockReturnValue({
      files: {
        list: vi.fn().mockResolvedValue({ data: { files: [] } }),
        get: vi.fn(),
      },
    });

    const results = await listPdfFiles("empty-folder", mockAuthClient as never);

    expect(results).toHaveLength(0);
    expect(Array.isArray(results)).toBe(true);
  });

  it("returns empty array when files field is undefined in response", async () => {
    (google.drive as ReturnType<typeof vi.fn>).mockReturnValue({
      files: {
        list: vi.fn().mockResolvedValue({ data: {} }),
        get: vi.fn(),
      },
    });

    const results = await listPdfFiles("folder-456", mockAuthClient as never);

    expect(results).toHaveLength(0);
  });
});

describe("downloadPdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a non-empty Buffer given a valid fileId", async () => {
    const fakeContent = Buffer.from("%PDF-1.4 fake pdf content");

    (google.drive as ReturnType<typeof vi.fn>).mockReturnValue({
      files: {
        list: vi.fn(),
        get: vi.fn().mockResolvedValue({ data: fakeContent }),
      },
    });

    const result = await downloadPdf("valid-file-id", mockAuthClient as never);

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result.toString()).toContain("%PDF");
  });

  it("throws an error when fileId does not exist (API error)", async () => {
    (google.drive as ReturnType<typeof vi.fn>).mockReturnValue({
      files: {
        list: vi.fn(),
        get: vi.fn().mockRejectedValue(new Error("File not found: invalid-file-id")),
      },
    });

    await expect(downloadPdf("invalid-file-id", mockAuthClient as never)).rejects.toThrow(
      "File not found"
    );
  });

  it("returns Buffer from string data when API returns a string", async () => {
    const pdfString = "%PDF-1.7 minimal pdf";

    (google.drive as ReturnType<typeof vi.fn>).mockReturnValue({
      files: {
        list: vi.fn(),
        get: vi.fn().mockResolvedValue({ data: pdfString }),
      },
    });

    const result = await downloadPdf("string-file-id", mockAuthClient as never);

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.toString()).toContain("%PDF");
  });
});
