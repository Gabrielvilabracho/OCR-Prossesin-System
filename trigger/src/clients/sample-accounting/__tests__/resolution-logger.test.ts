import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================
// Mock @supabase/supabase-js before importing logger
// ============================================================
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@supabase/supabase-js";
import { logResolution } from "../intelligence/resolution-logger";
import type { ResolutionLogInsert } from "../intelligence/resolution-logger";

const mockCreateClient = vi.mocked(createClient);

function makeChain(overrides: Record<string, unknown> = {}) {
  return {
    insert: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
}

function makeDb(chain: ReturnType<typeof makeChain>) {
  return { from: vi.fn().mockReturnValue(chain) };
}

// ============================================================
// Tests — TASK-2-3
// ============================================================

describe("logResolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SUPABASE_URL"] = "https://test.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-key";
  });

  it("inserts one row into supplier_resolution_log with correct fields", async () => {
    const chain = makeChain();
    mockCreateClient.mockReturnValue(makeDb(chain) as unknown as ReturnType<typeof createClient>);

    const data: ResolutionLogInsert = {
      ocr_document_id: "ocr-uuid-111",
      input_nif: "123456789",
      input_name: "Empresa Teste Lda",
      resolved_supplier_id: "supplier-uuid-aaa",
      resolution_method: "nif_exact",
      confidence: 1.0,
    };

    await logResolution(data);

    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        ocr_document_id: "ocr-uuid-111",
        input_nif: "123456789",
        input_name: "Empresa Teste Lda",
        resolved_supplier_id: "supplier-uuid-aaa",
        resolution_method: "nif_exact",
        confidence: 1.0,
        created_by: "auto",
      })
    );
  });

  it("inserts row with null resolved_supplier_id for unresolved method", async () => {
    const chain = makeChain();
    mockCreateClient.mockReturnValue(makeDb(chain) as unknown as ReturnType<typeof createClient>);

    const data: ResolutionLogInsert = {
      ocr_document_id: "ocr-uuid-222",
      input_nif: null,
      input_name: "Empresa X",
      resolved_supplier_id: null,
      resolution_method: "new_supplier",
      confidence: 0,
    };

    await logResolution(data);

    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        resolved_supplier_id: null,
        resolution_method: "new_supplier",
        confidence: 0,
        created_by: "auto",
      })
    );
  });

  it("throws when Supabase insert fails", async () => {
    const chain = makeChain({
      insert: vi.fn().mockResolvedValue({ error: { message: "connection refused" } }),
    });
    mockCreateClient.mockReturnValue(makeDb(chain) as unknown as ReturnType<typeof createClient>);

    await expect(
      logResolution({
        ocr_document_id: null,
        input_nif: null,
        input_name: null,
        resolved_supplier_id: null,
        resolution_method: "new_supplier",
        confidence: 0,
      })
    ).rejects.toThrow("connection refused");
  });
});
