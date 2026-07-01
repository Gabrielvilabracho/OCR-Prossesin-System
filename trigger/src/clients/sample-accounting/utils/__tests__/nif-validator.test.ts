import { describe, it, expect } from "vitest";
import { validateNif, normalizeNif } from "../nif-validator";

// ============================================================
// validateNif — PT mod-11 checksum, valid first digits
// S1-S7 + edge cases (≥15 cases total)
// ============================================================

describe("validateNif", () => {
  // S1 — valid PT NIFs (first digits: 1,2,5,6,7,8,9)
  describe("valid PT NIFs", () => {
    it("S1-a: accepts 502030712 (valid, first digit 5)", () => {
      // sum = 5*9+0*8+2*7+0*6+3*5+0*4+7*3+1*2 = 45+0+14+0+15+0+21+2 = 97
      // remainder = 97 % 11 = 9, check = 11-9 = 2, last digit = 2 → valid
      expect(validateNif("502030712")).toBe(true);
    });

    it("S1-b: accepts 516315242 (valid, first digit 5)", () => {
      expect(validateNif("516315242")).toBe(true);
    });

    it("S1-c: accepts a valid NIF starting with 1", () => {
      // 123456789: sum=1*9+2*8+3*7+4*6+5*5+6*4+7*3+8*2 = 9+16+21+24+25+24+21+16 = 156
      // remainder = 156 % 11 = 2, check = 11-2 = 9, last digit = 9 → valid
      expect(validateNif("123456789")).toBe(true);
    });

    it("S7-all-valid-first-digits: NIF starting with 2 is accepted when checksum correct", () => {
      // 200000004: sum=2*9=18, 18%11=7, check=11-7=4 → last digit 4 → valid
      expect(validateNif("200000004")).toBe(true);
    });

    it("S7-first-digit-6: NIF starting with 6 is accepted when checksum correct", () => {
      // 600000001: sum=6*9=54, 54%11=10, check=11-10=1 → last digit 1 → valid
      expect(validateNif("600000001")).toBe(true);
    });

    it("S7-first-digit-9: NIF starting with 9 is accepted when checksum correct", () => {
      // 900000007: sum=9*9=81, 81%11=4, check=11-4=7 → last digit 7 → valid
      expect(validateNif("900000007")).toBe(true);
    });
  });

  // S2 — bad first digit
  describe("invalid first digit", () => {
    it("S2: rejects NIF starting with 0", () => {
      expect(validateNif("012345678")).toBe(false);
    });

    it("S2-b: rejects NIF starting with 3", () => {
      expect(validateNif("312345678")).toBe(false);
    });

    it("S2-c: rejects NIF starting with 4", () => {
      expect(validateNif("412345678")).toBe(false);
    });
  });

  // S3 — bad checksum (correct length + valid first digit, wrong check digit)
  describe("invalid checksum", () => {
    it("S3: rejects 502030713 (checksum off by 1 from valid 502030712)", () => {
      expect(validateNif("502030713")).toBe(false);
    });

    it("S3-b: rejects 516315243 (wrong check digit)", () => {
      expect(validateNif("516315243")).toBe(false);
    });
  });

  // S4 — wrong length
  describe("wrong length", () => {
    it("S4-a: rejects NIF with 8 digits", () => {
      expect(validateNif("50203071")).toBe(false);
    });

    it("S4-b: rejects NIF with 10 digits", () => {
      expect(validateNif("5020307120")).toBe(false);
    });

    it("S4-c: rejects empty string", () => {
      expect(validateNif("")).toBe(false);
    });
  });

  // S5 — non-numeric or contains prefix
  describe("non-numeric input", () => {
    it("S5-a: rejects NIF with letters", () => {
      expect(validateNif("PT516315242")).toBe(false);
    });

    it("S5-b: rejects NIF with spaces", () => {
      expect(validateNif("516 315 242")).toBe(false);
    });
  });

  // S6 — remainder <= 1 → check digit must be 0
  describe("checksum remainder ≤ 1 edge case", () => {
    it("S6: NIF where remainder=0 → check=0 (last digit must be 0)", () => {
      // 509000008: sum=5*9+0*8+9*7+0*6+0*5+0*4+0*3+0*2=45+63=108, 108%11=9 → nope
      // Build NIF where remainder=0: 5+0+9+0+0+0+0+0 → need actual case
      // 501234560: sum=5*9+0*8+1*7+2*6+3*5+4*4+5*3+6*2=45+0+7+12+15+16+15+12=122
      // 122%11=1 → remainder=1, check=0, last digit must be 0
      expect(validateNif("501234560")).toBe(true);
    });
  });
});

// ============================================================
// normalizeNif — PT prefix strip, foreign VAT retention, nulls
// S8-S13
// ============================================================

describe("normalizeNif", () => {
  // S8 — strip PT prefix
  it("S8: strips PT prefix from 'PT516315242' → '516315242'", () => {
    expect(normalizeNif("PT516315242")).toBe("516315242");
  });

  // S9 — plain 9-digit PT NIF (no prefix)
  it("S9: returns 9-digit NIF as-is", () => {
    expect(normalizeNif("516315242")).toBe("516315242");
  });

  // S10 — foreign VAT: DE prefix retained
  it("S10: retains DE VAT number as-is", () => {
    expect(normalizeNif("DE351574837")).toBe("DE351574837");
  });

  // S11 — foreign VAT: GB prefix retained
  it("S11: retains GB VAT number as-is", () => {
    expect(normalizeNif("GB123456789")).toBe("GB123456789");
  });

  // S12 — null/empty/whitespace → null
  it("S12-a: returns null for null input", () => {
    expect(normalizeNif(null as unknown as string)).toBeNull();
  });

  it("S12-b: returns null for empty string", () => {
    expect(normalizeNif("")).toBeNull();
  });

  it("S12-c: returns null for whitespace-only string", () => {
    expect(normalizeNif("   ")).toBeNull();
  });

  // S13 — strips internal spaces/dots/hyphens before evaluating
  it("S13-a: strips spaces from '516 315 242' → '516315242'", () => {
    expect(normalizeNif("516 315 242")).toBe("516315242");
  });

  it("S13-b: strips dots from '516.315.242' → '516315242'", () => {
    expect(normalizeNif("516.315.242")).toBe("516315242");
  });

  it("S13-c: strips hyphens from '516-315-242' → '516315242'", () => {
    expect(normalizeNif("516-315-242")).toBe("516315242");
  });

  // Additional: PT prefix with spaces around it
  it("strips PT prefix from '  PT516315242  ' → '516315242'", () => {
    expect(normalizeNif("  PT516315242  ")).toBe("516315242");
  });

  // Foreign VAT with lowercase letters — ES prefix
  it("retains ES VAT number as-is", () => {
    expect(normalizeNif("ES12345678A")).toBe("ES12345678A");
  });
});
