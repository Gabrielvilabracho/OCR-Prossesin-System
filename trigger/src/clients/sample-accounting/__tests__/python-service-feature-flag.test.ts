import { describe, it, expect, afterEach } from "vitest";
import { getPythonServiceUrl } from "../python-service/feature-flag";

describe("getPythonServiceUrl", () => {
  const originalEnv = process.env["SAMPLE_ACCOUNTING_AI_URL"];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env["SAMPLE_ACCOUNTING_AI_URL"];
    } else {
      process.env["SAMPLE_ACCOUNTING_AI_URL"] = originalEnv;
    }
  });

  it("returns default URL when SAMPLE_ACCOUNTING_AI_URL is not set", () => {
    delete process.env["SAMPLE_ACCOUNTING_AI_URL"];
    expect(getPythonServiceUrl()).toBe("http://localhost:8001");
  });

  it("returns configured URL when SAMPLE_ACCOUNTING_AI_URL is set", () => {
    process.env["SAMPLE_ACCOUNTING_AI_URL"] = "http://sample-accounting-ai:8001";
    expect(getPythonServiceUrl()).toBe("http://sample-accounting-ai:8001");
  });

  it("returns URL without trailing slash", () => {
    process.env["SAMPLE_ACCOUNTING_AI_URL"] = "http://sample-accounting-ai:8001";
    const url = getPythonServiceUrl();
    expect(url).not.toMatch(/\/$/);
  });
});
