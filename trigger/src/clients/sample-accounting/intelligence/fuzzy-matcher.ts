// ============================================================
// fuzzy-matcher.ts — Pure Jaro-Winkler implementation
// No external dependencies. Pure functions only.
// ============================================================

// -----------------------------------------------------------------------
// normalize — prepare strings for comparison
// Lowercases, trims, removes punctuation, collapses whitespace
// -----------------------------------------------------------------------
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ") // replace punctuation with space
    .replace(/\s+/g, " ")     // collapse multiple spaces
    .trim();
}

// -----------------------------------------------------------------------
// jaro — base Jaro similarity score in [0, 1]
// -----------------------------------------------------------------------
function jaro(s1: string, s2: string): number {
  if (s1.length === 0 && s2.length === 0) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;
  if (s1 === s2) return 1.0;

  const matchWindow = Math.max(
    Math.floor(Math.max(s1.length, s2.length) / 2) - 1,
    0
  );

  const s1Matched = new Array<boolean>(s1.length).fill(false);
  const s2Matched = new Array<boolean>(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Count matches
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);

    for (let j = start; j < end; j++) {
      if (s2Matched[j] || s1[i] !== s2[j]) continue;
      s1Matched[i] = true;
      s2Matched[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  // Count transpositions
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matched[i]) continue;
    while (!s2Matched[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const m = matches;
  return (m / s1.length + m / s2.length + (m - transpositions / 2) / m) / 3;
}

// -----------------------------------------------------------------------
// jaroWinkler — Jaro-Winkler similarity (adds prefix bonus, p=0.1)
// Returns a score in [0, 1]. 1.0 = identical, 0.0 = completely different.
// -----------------------------------------------------------------------
const WINKLER_P = 0.1; // prefix scaling factor (standard)
const MAX_PREFIX = 4;  // consider up to 4 prefix chars

export function jaroWinkler(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1.0;
  if (a.length === 0 || b.length === 0) return 0.0;

  const jaroScore = jaro(a, b);

  // Count common prefix length (max MAX_PREFIX)
  let prefixLen = 0;
  const limit = Math.min(MAX_PREFIX, Math.min(a.length, b.length));
  for (let i = 0; i < limit; i++) {
    if (a[i] === b[i]) prefixLen++;
    else break;
  }

  return jaroScore + prefixLen * WINKLER_P * (1 - jaroScore);
}
