import { describe, it, expect } from "vitest";
import {
  parseMoneyToMinor,
  formatMoney,
  formatMoneyExact,
  sumMinor,
  MoneyError,
  normalizeCurrencyCode,
} from "@/lib/money/money";

describe("money: parsing to integer minor units", () => {
  it("parses a plain integer", () => {
    expect(parseMoneyToMinor("1234")).toEqual({ ok: true, minor: 123_400 });
  });

  it("parses a two-decimal value", () => {
    expect(parseMoneyToMinor("1234.56")).toEqual({ ok: true, minor: 123_456 });
  });

  it("parses a comma thousands separator", () => {
    expect(parseMoneyToMinor("1,234.56")).toEqual({ ok: true, minor: 123_456 });
  });

  it("parses a European decimal comma with 1-2 trailing digits as decimal", () => {
    expect(parseMoneyToMinor("12,50")).toEqual({ ok: true, minor: 1_250 });
    expect(parseMoneyToMinor("12,5")).toEqual({ ok: true, minor: 1_250 });
  });

  it("treats a single comma followed by 3 digits as thousands grouping", () => {
    expect(parseMoneyToMinor("1,700")).toEqual({ ok: true, minor: 170_000 });
    expect(parseMoneyToMinor("12,345")).toEqual({ ok: true, minor: 1_234_500 });
    expect(parseMoneyToMinor("123,456")).toEqual({ ok: true, minor: 12_345_600 });
    // Multiple groups: every group after the first must be exactly 3 digits.
    expect(parseMoneyToMinor("1,234,567")).toEqual({ ok: true, minor: 123_456_700 });
    expect(parseMoneyToMinor("1,23,456").ok).toBe(false);
  });

  it("parses currency symbols and spaces", () => {
    expect(parseMoneyToMinor("£1,234.56")).toEqual({ ok: true, minor: 123_456 });
    expect(parseMoneyToMinor("$2 200")).toEqual({ ok: true, minor: 220_000 });
    expect(parseMoneyToMinor("1 234.56")).toEqual({ ok: true, minor: 123_456 });
  });

  it("parses zero", () => {
    expect(parseMoneyToMinor("0")).toEqual({ ok: true, minor: 0 });
    expect(parseMoneyToMinor("0.00")).toEqual({ ok: true, minor: 0 });
  });

  it("accepts -0 but rejects negative spend", () => {
    expect(parseMoneyToMinor("-0")).toEqual({ ok: true, minor: 0 });
    const negative = parseMoneyToMinor("-45.10");
    expect(negative.ok).toBe(false);
    if (!negative.ok) expect(negative.reason).toMatch(/negative/i);
  });

  it("rejects excess decimal precision (> 2 places)", () => {
    const result = parseMoneyToMinor("12.345");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/decimal/i);
  });

  it("rejects a three-digit single-dot tail as ambiguous precision", () => {
    // "1.234" — treated as a decimal with three fraction digits, rejected
    // for review rather than guessed as a thousands grouping.
    expect(parseMoneyToMinor("1.234").ok).toBe(false);
  });

  it("rejects non-numeric characters", () => {
    expect(parseMoneyToMinor("abc").ok).toBe(false);
    expect(parseMoneyToMinor("12x.30").ok).toBe(false);
  });

  it("rejects empty and missing values", () => {
    expect(parseMoneyToMinor("").ok).toBe(false);
    expect(parseMoneyToMinor(null).ok).toBe(false);
    expect(parseMoneyToMinor(undefined).ok).toBe(false);
  });

  it("converts minor units correctly (value × 100)", () => {
    expect(parseMoneyToMinor("0.01")).toEqual({ ok: true, minor: 1 });
    expect(parseMoneyToMinor("0.99")).toEqual({ ok: true, minor: 99 });
    expect(parseMoneyToMinor("1.00")).toEqual({ ok: true, minor: 100 });
  });

  it("handles large values within the safe integer range", () => {
    expect(parseMoneyToMinor("90000000")).toEqual({ ok: true, minor: 9_000_000_000 });
  });

  it("accepts numeric inputs (CSV parsers sometimes deliver numbers)", () => {
    expect(parseMoneyToMinor(45.5)).toEqual({ ok: true, minor: 4_550 });
    expect(parseMoneyToMinor(0)).toEqual({ ok: true, minor: 0 });
  });
});

describe("money: currency handling", () => {
  it("normalizes currency codes case-insensitively", () => {
    expect(normalizeCurrencyCode("gbp")).toBe("GBP");
    expect(normalizeCurrencyCode(" GBP ")).toBe("GBP");
    expect(normalizeCurrencyCode("pounds")).toBeNull();
    expect(normalizeCurrencyCode("GB")).toBeNull();
  });

  it("sums same-currency minor values exactly (integer arithmetic)", () => {
    const sum = sumMinor([
      { minor: 1_234, currency: "GBP" },
      { minor: 5, currency: "GBP" },
      { minor: 999_999, currency: "GBP" },
    ]);
    expect(sum).toEqual({ minor: 1_001_238, currency: "GBP" });
  });

  it("throws MIXED_CURRENCY instead of silently combining currencies", () => {
    expect(() =>
      sumMinor([
        { minor: 100, currency: "GBP" },
        { minor: 200, currency: "USD" },
      ])
    ).toThrowError(MoneyError);
    try {
      sumMinor([
        { minor: 100, currency: "GBP" },
        { minor: 200, currency: "USD" },
      ]);
    } catch (err) {
      expect((err as MoneyError).code).toBe("MIXED_CURRENCY");
    }
  });

  it("returns an empty sum without erroring", () => {
    expect(sumMinor([])).toEqual({ minor: 0, currency: "GBP" });
  });
});

describe("money: display formatting", () => {
  it("formats minor units with the ISO currency (en-GB display locale)", () => {
    expect(formatMoneyExact(123_456, "GBP")).toBe("£1,234.56");
    // en-GB qualifies non-local currencies with their code.
    expect(formatMoneyExact(123_456, "USD")).toBe("US$1,234.56");
    expect(formatMoneyExact(123_456, "EUR")).toBe("€1,234.56");
  });

  it("formats zero exactly", () => {
    expect(formatMoneyExact(0, "GBP")).toBe("£0.00");
  });

  it("keeps pence exact — never rounds financial values on display", () => {
    expect(formatMoneyExact(1, "GBP")).toBe("£0.01");
    expect(formatMoneyExact(99, "GBP")).toBe("£0.99");
  });

  it("falls back gracefully for unknown currency codes", () => {
    // ICU formats any 3-letter code (with a narrow no-break space separator
    // in en-GB); the catch branch stays as a safety net for invalid codes.
    expect(formatMoneyExact(123_456, "XYZ")).toMatch(/^XYZ[\s\u00a0\u202f]1,234\.56$/);
  });
});
