import { google } from "googleapis";

// ============================================================
// Types
// ============================================================

export type SupportedMimeType =
  | "application/pdf"
  | "image/jpeg"
  | "image/png";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: SupportedMimeType;
}

type AuthClient = InstanceType<typeof google.auth.OAuth2>;

// ============================================================
// listPdfFiles
// ============================================================

/**
 * Lists all PDF files inside a given Drive folder.
 *
 * @param folderId - Google Drive folder ID to query
 * @param auth - Authenticated OAuth2 client
 * @returns Array of DriveFile objects (id, name, mimeType)
 */
export async function listPdfFiles(
  folderId: string,
  auth: AuthClient
): Promise<DriveFile[]> {
  const drive = google.drive({ version: "v3", auth });

  const SUPPORTED: Set<string> = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
  ]);

  const allFiles: DriveFile[] = [];
  let pageToken: string | undefined = undefined;

  do {
    // googleapis overloads make the return type ambiguous — cast via unknown
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (drive.files.list as any)({
      q: `'${folderId}' in parents and (mimeType='application/pdf' or mimeType='image/jpeg' or mimeType='image/png') and trashed=false`,
      fields: "nextPageToken, files(id, name, mimeType)",
      pageSize: 1000,
      pageToken,
    }) as { data: { files?: Array<{ id?: string | null; name?: string | null; mimeType?: string | null }>; nextPageToken?: string | null } };

    const files = response.data.files ?? [];

    const valid = files
      .filter(
        (f): f is { id: string; name: string; mimeType: SupportedMimeType } =>
          typeof f.id === "string" &&
          typeof f.name === "string" &&
          typeof f.mimeType === "string" &&
          SUPPORTED.has(f.mimeType)
      )
      .map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType as SupportedMimeType }));

    allFiles.push(...valid);
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return allFiles;
}

// ============================================================
// downloadPdf
// ============================================================

/**
 * Downloads a PDF file from Google Drive and returns it as a Buffer.
 *
 * @param fileId - Google Drive file ID
 * @param auth - Authenticated OAuth2 client
 * @returns PDF contents as a Buffer
 * @throws Error if fileId does not exist or API returns an error
 */
export async function downloadPdf(fileId: string, auth: AuthClient): Promise<Buffer> {
  const drive = google.drive({ version: "v3", auth });

  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );

  const data = response.data;

  if (Buffer.isBuffer(data)) {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }

  // Fallback: string or any other serializable data
  return Buffer.from(String(data));
}
