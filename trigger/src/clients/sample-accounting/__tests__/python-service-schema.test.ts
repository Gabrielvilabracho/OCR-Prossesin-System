import { describe, it, expect } from "vitest";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ProcessInvoiceRequestSchema,
  ProcessInvoiceResponseSchema,
} from "../python-service/schema";

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeSchema(schema: any): any {
  if (typeof schema !== "object" || schema === null) {
    return schema;
  }

  if (Array.isArray(schema)) {
    return schema.map(normalizeSchema);
  }

  // Handle arrays: anyOf -> type
  if (schema.anyOf && schema.anyOf.length === 2) {
    const types = schema.anyOf.map((s: any) => s.type);
    if (types.includes("null")) {
      const nonNullType = types.find((t: string) => t !== "null");
      return { type: [nonNullType, "null"] };
    }
  }

  const result: any = {};
  for (const [key, value] of Object.entries(schema)) {
    // Strip metadata fields
    if (["$id", "$schema", "title", "description", "default"].includes(key)) {
      continue;
    }
    result[key] = normalizeSchema(value);
  }
  return result;
}

function readCommittedSchema(name: string): any {
  const path = resolve(
    __dirname,
    "../../../../../contracts/sample-accounting",
    name
  );
  return normalizeSchema(JSON.parse(readFileSync(path, "utf-8")));
}

// ─── Drift tests ──────────────────────────────────────────────────────────────

describe("ProcessInvoiceRequestSchema drift", () => {
  it("matches committed JSON Schema", () => {
    const generated = zodToJsonSchema(ProcessInvoiceRequestSchema, {
      target: "jsonSchema2019-09",
    });
    const committed = readCommittedSchema("process-invoice-request.schema.json");
    expect(normalizeSchema(generated)).toEqual(committed);
  });

  it("rejects invalid data", () => {
    const invalid = {
      storage_key: "test.pdf",
      client_id: "not-a-uuid",
    };
    const result = ProcessInvoiceRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("accepts valid data", () => {
    const valid = {
      storage_key: "invoices/sample-accounting/2026/05/uuid.pdf",
      client_id: "550e8400-e29b-41d4-a716-446655440000",
      dry_run: true,
      mime_type: "application/pdf",
    };
    const result = ProcessInvoiceRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
});

describe("ProcessInvoiceResponseSchema drift", () => {
  it("matches committed JSON Schema", () => {
    const generated = zodToJsonSchema(ProcessInvoiceResponseSchema, {
      target: "jsonSchema2019-09",
    });
    const committed = readCommittedSchema(
      "process-invoice-response.schema.json"
    );
    expect(normalizeSchema(generated)).toEqual(committed);
  });

  it("rejects invalid status", () => {
    const invalid = {
      status: "invalid",
      invoice_id: null,
      errors: [],
    };
    const result = ProcessInvoiceResponseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("accepts valid data", () => {
    const valid = {
      status: "success",
      invoice_id: "550e8400-e29b-41d4-a716-446655440000",
      errors: [],
    };
    const result = ProcessInvoiceResponseSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
});
