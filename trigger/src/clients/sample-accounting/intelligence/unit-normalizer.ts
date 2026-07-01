// ============================================================
// unit-normalizer — maps raw LLM unit strings to canonical vocab
// Spec: S4 (sample-item-unit-extraction)
// Pure function: same input → same output, no side effects
// ============================================================

export type CanonicalUnit = "UN" | "KG" | "G" | "L" | "ML" | "CAIXA" | "PACK";

const UNIT_MAP: Record<string, CanonicalUnit> = {
  // UN — countable units
  un:       "UN",
  und:      "UN",
  uds:      "UN",
  u:        "UN",
  unid:     "UN",
  unidade:  "UN",
  // KG — kilogram
  kg:       "KG",
  kgs:      "KG",
  kilogramo: "KG",
  kilogramos: "KG",
  kilo:     "KG",
  // G — gram
  gr:       "G",
  grs:      "G",
  g:        "G",
  gramo:    "G",
  gramos:   "G",
  gram:     "G",
  // L — liter
  lt:       "L",
  lts:      "L",
  l:        "L",
  litro:    "L",
  litros:   "L",
  litre:    "L",
  // ML — milliliter
  ml:       "ML",
  mililitro: "ML",
  // CAIXA — box/case
  cx:       "CAIXA",
  caixa:    "CAIXA",
  caja:     "CAIXA",
  box:      "CAIXA",
  // PACK
  pack:     "PACK",
  pck:      "PACK",
  paquete:  "PACK",
};

/**
 * Normalizes a raw unit string from the LLM to a canonical vocabulary value.
 *
 * @param raw - raw unit string from LLM extraction, or null/undefined
 * @returns CanonicalUnit if recognized, null otherwise
 *
 * Rules:
 * - Trims whitespace and lowercases before lookup
 * - null / undefined / empty / whitespace-only → null
 * - Unknown strings not in the vocabulary → null
 */
export function normalizeUnit(raw: string | null | undefined): CanonicalUnit | null {
  if (raw == null) return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "") return null;
  return UNIT_MAP[normalized] ?? null;
}
