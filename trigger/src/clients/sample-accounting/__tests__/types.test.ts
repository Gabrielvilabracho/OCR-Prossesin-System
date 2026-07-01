/**
 * T2.1 — Contract tests for sample-accounting types.ts
 *
 * TDD: RED first — these tests fail until types.ts is created (T2.2).
 * Verifies const-object unions and interface shapes per spec S2.4, S2.5.
 */
import { describe, it, expect } from "vitest";
import {
  CLIENT_STATUS,
  CLIENT_LEGAL_FORM,
  type ClientStatus,
  type ClientLegalForm,
  type SampleClient,
  type ShareholderEntry,
} from "../types";

describe("CLIENT_STATUS const object", () => {
  it("has all required status keys", () => {
    expect(CLIENT_STATUS.draft).toBe("draft");
    expect(CLIENT_STATUS.pending_compliance).toBe("pending_compliance");
    expect(CLIENT_STATUS.active).toBe("active");
    expect(CLIENT_STATUS.suspended).toBe("suspended");
    expect(CLIENT_STATUS.dissolved).toBe("dissolved");
  });

  it("has exactly 5 keys", () => {
    expect(Object.keys(CLIENT_STATUS)).toHaveLength(5);
  });

  it("values match keys (const-object union pattern)", () => {
    for (const [key, value] of Object.entries(CLIENT_STATUS)) {
      expect(value).toBe(key);
    }
  });
});

describe("CLIENT_LEGAL_FORM const object", () => {
  it("has all required legal form keys", () => {
    expect(CLIENT_LEGAL_FORM.LDA).toBe("LDA");
    expect(CLIENT_LEGAL_FORM.SA).toBe("SA");
    expect(CLIENT_LEGAL_FORM.ENI).toBe("ENI");
    expect(CLIENT_LEGAL_FORM.UNIPESSOAL).toBe("UNIPESSOAL");
    expect(CLIENT_LEGAL_FORM.OUTRO).toBe("OUTRO");
  });

  it("has exactly 5 keys", () => {
    expect(Object.keys(CLIENT_LEGAL_FORM)).toHaveLength(5);
  });

  it("values match keys (const-object union pattern)", () => {
    for (const [key, value] of Object.entries(CLIENT_LEGAL_FORM)) {
      expect(value).toBe(key);
    }
  });
});

describe("SampleClient type shape (structural test)", () => {
  it("satisfies the SampleClient interface with all required fields", () => {
    // Type-level test: if this compiles, the interface is correct
    const client: SampleClient = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      legal_name: "Empresa Teste Lda",
      nif: "123456789",
      legal_form: CLIENT_LEGAL_FORM.LDA,
      status: CLIENT_STATUS.active,
      drive_folder_id: "folder-abc",
      allows_manual_upload: false,
      created_by: "550e8400-e29b-41d4-a716-446655440001",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      account_manager: null,
      incorporation_date: null,
      registration_number: null,
      trade_name: null,
      capital_social: null,
      shareholders: null,
      notes: null,
      email: null,
      phone: null,
    };

    expect(client.legal_name).toBe("Empresa Teste Lda");
    expect(client.status).toBe("active");
    expect(client.legal_form).toBe("LDA");
  });

  it("accepts null for all optional Level 2 and Level 3 fields", () => {
    const minimal: SampleClient = {
      id: "550e8400-e29b-41d4-a716-446655440002",
      legal_name: "Minimal SA",
      nif: "987654321",
      legal_form: CLIENT_LEGAL_FORM.SA,
      status: CLIENT_STATUS.draft,
      drive_folder_id: null,
      allows_manual_upload: true,
      created_by: "550e8400-e29b-41d4-a716-446655440003",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      account_manager: null,
      incorporation_date: null,
      registration_number: null,
      trade_name: null,
      capital_social: null,
      shareholders: null,
      notes: null,
      email: null,
      phone: null,
    };

    expect(minimal.drive_folder_id).toBeNull();
    expect(minimal.allows_manual_upload).toBe(true);
    expect(minimal.status).toBe("draft");
  });
});

describe("ShareholderEntry type shape", () => {
  it("satisfies the ShareholderEntry interface", () => {
    const shareholder: ShareholderEntry = {
      name: "João Silva",
      nif: "234567890",
      pct: 51,
    };

    expect(shareholder.name).toBe("João Silva");
    expect(shareholder.nif).toBe("234567890");
    expect(shareholder.pct).toBe(51);
  });
});

describe("ClientStatus and ClientLegalForm union types", () => {
  it("ClientStatus values are assignable from CLIENT_STATUS", () => {
    const status: ClientStatus = CLIENT_STATUS.active;
    expect(status).toBe("active");
  });

  it("ClientLegalForm values are assignable from CLIENT_LEGAL_FORM", () => {
    const form: ClientLegalForm = CLIENT_LEGAL_FORM.LDA;
    expect(form).toBe("LDA");
  });
});
