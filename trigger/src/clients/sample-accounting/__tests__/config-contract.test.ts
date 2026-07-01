/**
 * T3.1 — Contract test: getDriveFolderId must NOT be exported from config.ts
 *
 * TDD: RED first — this test fails while getDriveFolderId still exists (T3.2 will make it GREEN).
 * Spec: S5.1, S5.6 — Drive folder ID comes from noxx_clients DB, not env var.
 */
import { describe, it, expect } from "vitest";
import * as config from "../config";

describe("config.ts — removed exports contract", () => {
  it("getDriveFolderId should not exist (drive folder ID now comes from DB)", () => {
    expect((config as Record<string, unknown>)["getDriveFolderId"]).toBeUndefined();
  });
});

describe("config.ts — retained exports contract", () => {
  it("getGoogleAuthClient is still exported", () => {
    expect(typeof (config as Record<string, unknown>)["getGoogleAuthClient"]).toBe("function");
  });

  it("getGmailUser is still exported", () => {
    expect(typeof (config as Record<string, unknown>)["getGmailUser"]).toBe("function");
  });
});
