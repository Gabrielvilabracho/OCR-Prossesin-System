/**
 * PT NIF validation and normalization utilities.
 *
 * validateNif  — mod-11 checksum for 9-digit Portuguese NIFs
 * normalizeNif — strips PT prefix, retains foreign VAT, nulls empties
 *
 * Algorithm (PT mod-11):
 *   weights = [9,8,7,6,5,4,3,2] applied to digits [0..7]
 *   sum = Σ(digit[i] * weight[i])
 *   remainder = sum % 11
 *   check = remainder <= 1 ? 0 : 11 - remainder
 *   valid if check === parseInt(nif[8])
 *
 * Valid first digits: 1, 2, 5, 6, 7, 8, 9
 */

const VALID_FIRST_DIGITS = new Set(["1", "2", "5", "6", "7", "8", "9"]);
const CHECKSUM_WEIGHTS = [9, 8, 7, 6, 5, 4, 3, 2] as const;

/**
 * Validates a 9-digit Portuguese NIF using the mod-11 checksum.
 * Returns false for any non-9-digit or non-numeric input.
 */
export function validateNif(nif: string): boolean {
  if (!/^\d{9}$/.test(nif)) return false;
  if (!VALID_FIRST_DIGITS.has(nif[0]!)) return false;

  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += parseInt(nif[i]!, 10) * CHECKSUM_WEIGHTS[i]!;
  }

  const remainder = sum % 11;
  const check = remainder <= 1 ? 0 : 11 - remainder;

  return check === parseInt(nif[8]!, 10);
}

/**
 * Normalizes a raw NIF/VAT string:
 * - null/empty/whitespace-only → null
 * - Strips spaces, dots, hyphens from the raw value first
 * - "PT" + 9 digits → strips prefix, returns 9 digits
 * - Exactly 9 digits → returns as-is
 * - 2 uppercase letters + alphanumeric (foreign VAT, e.g. DE, ES, GB) → returns as-is
 * - Anything else → returns as-is (let caller decide validity)
 */
export function normalizeNif(raw: string): string | null {
  if (raw == null) return null;

  const trimmed = raw.trim();
  if (trimmed === "") return null;

  // Strip spaces, dots, hyphens
  const stripped = trimmed.replace(/[\s.\-]/g, "");

  // Strip PT prefix: "PT" followed by exactly 9 digits
  if (/^PT\d{9}$/i.test(stripped)) {
    return stripped.slice(2);
  }

  // Plain 9 digits → Portuguese NIF
  if (/^\d{9}$/.test(stripped)) {
    return stripped;
  }

  // Foreign VAT: starts with 2 uppercase letters followed by alphanumeric
  // e.g. DE351574837, ES12345678A, GB123456789
  if (/^[A-Z]{2}[A-Z0-9]+$/i.test(stripped)) {
    return stripped;
  }

  // Fallback: return stripped value
  return stripped;
}
