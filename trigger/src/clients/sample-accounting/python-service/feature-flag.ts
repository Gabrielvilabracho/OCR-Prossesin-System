/**
 * Configuration for the Sample Accounting Python AI service.
 */

/**
 * Returns the base URL of the Python AI service.
 * Defaults to localhost for local development.
 */
export function getPythonServiceUrl(): string {
  return process.env["SAMPLE_ACCOUNTING_AI_URL"] ?? "http://localhost:8001";
}
