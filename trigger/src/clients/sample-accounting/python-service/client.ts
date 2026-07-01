/**
 * HTTP client for the Sample Accounting Python AI service.
 *
 * Calls POST /invoices/{id}/process on the sample-accounting-ai FastAPI service.
 * All invoice processing logic (OCR, extraction, validation, persist) runs
 * inside the Python service — this module is a thin typed HTTP boundary.
 *
 * Error handling:
 *   - HTTP 4xx/5xx → throws PythonServiceError (do not retry blindly)
 *   - Network error → throws PythonServiceError with retryable=true hint
 */

import { getPythonServiceUrl } from "./feature-flag";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProcessInvoiceRequest {
  /** UUID of the invoice row already in facturas.invoices */
  invoiceId: string;
  /** Storage path in Supabase Storage (e.g. invoices/sample-accounting/2026/05/uuid.pdf) */
  storageKey: string;
  /** Sample client UUID */
  clientId: string;
  /** When true, pipeline runs but skips DB writes */
  dryRun?: boolean;
}

export interface PythonServiceResult {
  invoice_id: string | null;
  status: "success" | "failed" | "dry_run" | "processing";
  errors: string[];
}

export class PythonServiceError extends Error {
  public readonly statusCode?: number;
  public readonly retryable: boolean;

  constructor(message: string, opts?: { statusCode?: number; retryable?: boolean }) {
    super(message);
    this.name = "PythonServiceError";
    this.statusCode = opts?.statusCode;
    this.retryable = opts?.retryable ?? false;
  }
}

// ─── Client ──────────────────────────────────────────────────────────────────

const TIMEOUT_MS = 120_000; // 120 s — OCR + LLM can be slow

/**
 * Send an invoice to the Python service for processing.
 *
 * @param params - Invoice processing parameters
 * @returns PythonServiceResult with invoice_id, status, and any errors
 * @throws PythonServiceError on HTTP error or network failure
 */
export async function processInvoiceViaPython(
  params: ProcessInvoiceRequest
): Promise<PythonServiceResult> {
  const { invoiceId, storageKey, clientId, dryRun = false } = params;
  const baseUrl = getPythonServiceUrl();
  const url = `${baseUrl}/invoices/${invoiceId}/process`;

  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        storage_key: storageKey,
        client_id: clientId,
        dry_run: dryRun,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? `Python service network error: ${err.message}`
        : "Python service network error (unknown)";
    throw new PythonServiceError(message, { retryable: true });
  }

  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as Record<string, unknown>;
      detail = typeof body?.["detail"] === "string"
        ? body["detail"]
        : JSON.stringify(body);
    } catch {
      detail = await response.text().catch(() => "");
    }
    throw new PythonServiceError(
      `Python service returned HTTP ${response.status}: ${detail}`,
      { statusCode: response.status, retryable: response.status >= 500 }
    );
  }

  const data = (await response.json()) as PythonServiceResult;
  return data;
}
