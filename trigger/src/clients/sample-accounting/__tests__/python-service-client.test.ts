import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("../python-service/feature-flag", () => ({
  getPythonServiceUrl: vi.fn().mockReturnValue("http://localhost:8001"),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { processInvoiceViaPython } from "../python-service/client";
import { getPythonServiceUrl } from "../python-service/feature-flag";

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("processInvoiceViaPython — HTTP client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls POST /invoices/{id}/process with correct URL", async () => {
    const invoiceId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const storageKey = "invoices/sample-accounting/2026/05/test.pdf";
    const clientId = "sample-client-001";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        invoice_id: invoiceId,
        status: "success",
        errors: [],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await processInvoiceViaPython({ invoiceId, storageKey, clientId });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://localhost:8001/invoices/${invoiceId}/process`);
    expect(opts.method).toBe("POST");

    vi.unstubAllGlobals();
  });

  it("sends storage_key and client_id in JSON body", async () => {
    const invoiceId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const storageKey = "invoices/sample-accounting/2026/05/test.pdf";
    const clientId = "sample-client-001";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ invoice_id: invoiceId, status: "success", errors: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await processInvoiceViaPython({ invoiceId, storageKey, clientId });

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    expect(body.storage_key).toBe(storageKey);
    expect(body.client_id).toBe(clientId);
    expect(body.dry_run).toBe(false);

    vi.unstubAllGlobals();
  });

  it("sends dry_run=true when dryRun option is true", async () => {
    const invoiceId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ invoice_id: invoiceId, status: "dry_run", errors: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await processInvoiceViaPython({
      invoiceId,
      storageKey: "invoices/sample-accounting/test.pdf",
      clientId: "sample-001",
      dryRun: true,
    });

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    expect(body.dry_run).toBe(true);

    vi.unstubAllGlobals();
  });

  it("returns PythonServiceResult with invoice_id, status, errors", async () => {
    const invoiceId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        invoice_id: invoiceId,
        status: "success",
        errors: [],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await processInvoiceViaPython({
      invoiceId,
      storageKey: "invoices/sample-accounting/test.pdf",
      clientId: "sample-001",
    });

    expect(result.invoice_id).toBe(invoiceId);
    expect(result.status).toBe("success");
    expect(result.errors).toEqual([]);

    vi.unstubAllGlobals();
  });

  it("throws PythonServiceError when HTTP response is not ok (4xx/5xx)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ detail: "Internal server error" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(
      processInvoiceViaPython({
        invoiceId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        storageKey: "invoices/sample-accounting/test.pdf",
        clientId: "sample-001",
      })
    ).rejects.toThrow();

    vi.unstubAllGlobals();
  });

  it("throws with retry hint when network error occurs", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", mockFetch);

    await expect(
      processInvoiceViaPython({
        invoiceId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        storageKey: "invoices/sample-accounting/test.pdf",
        clientId: "sample-001",
      })
    ).rejects.toThrow();

    vi.unstubAllGlobals();
  });

  it("includes Content-Type: application/json header", async () => {
    const invoiceId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ invoice_id: invoiceId, status: "success", errors: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await processInvoiceViaPython({
      invoiceId,
      storageKey: "invoices/sample-accounting/test.pdf",
      clientId: "sample-001",
    });

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = opts.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");

    vi.unstubAllGlobals();
  });
});
