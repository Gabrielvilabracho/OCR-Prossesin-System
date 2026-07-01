import type { InvoiceFields, EfacturaMockResult } from "./schema";

const NIF_REGEX = /^\d{9}$/;

/**
 * Simulates an eFactura (AT Portugal) validation response.
 *
 * Rules (deterministic — suitable for demo):
 * - issuer_nif valid format (9 digits) + all required fields present → "matched"
 * - issuer_nif invalid format → "mismatch" with reason
 * - missing required fields (nif, invoice_number, issue_date) → "not_found"
 *
 * In production this adapter would be replaced by the real AT API call
 * using per-client credentials from the secure credential store.
 */
export function mockEfacturaValidate(
  fields: InvoiceFields,
  sourceRef: string
): EfacturaMockResult {
  const checkedAt = new Date().toISOString();
  const hashSuffix = sourceRef.slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, "X");
  const checkId = `EF-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${hashSuffix}`;

  // Missing required fields → not_found
  if (!fields.issuer_nif || !fields.invoice_number || !fields.issue_date) {
    return {
      provider: "AT eFactura (mock sandbox)",
      check_id: checkId,
      status: "not_found",
      matched_fields: [],
      mismatch_reasons: ["required_fields_missing"],
      checked_at: checkedAt,
      next_step: "manual_review",
    };
  }

  // Invalid NIF format → mismatch
  if (!NIF_REGEX.test(fields.issuer_nif)) {
    return {
      provider: "AT eFactura (mock sandbox)",
      check_id: checkId,
      status: "mismatch",
      matched_fields: ["invoice_number", "issue_date"],
      mismatch_reasons: ["invalid_nif_format"],
      checked_at: checkedAt,
      next_step: "manual_review",
    };
  }

  // All good → matched
  return {
    provider: "AT eFactura (mock sandbox)",
    check_id: checkId,
    status: "matched",
    matched_fields: ["invoice_number", "issuer_nif", "issue_date", "total_with_vat"],
    mismatch_reasons: [],
    checked_at: checkedAt,
    next_step: "post_to_accounting",
  };
}
