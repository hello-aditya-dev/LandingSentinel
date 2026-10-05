/**
 * Money model.
 *
 * Rules (see docs/ARCHITECTURE.md):
 * - Financial values are ALWAYS integer minor units (pence/cents) in storage
 *   and arithmetic. No floating point sums.
 * - Currency is a separate ISO 4217 alpha-3 code.
 * - Different currencies are never silently summed.
 */

export class MoneyError extends Error {
  code: "INVALID_MONEY" | "NEGATIVE_SPEND" | "MIXED_CURRENCY";
  constructor(code: MoneyError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

/** Common ISO 4217 codes accepted on import. */
export const SUPPORTED_CURRENCIES = [
  "GBP", "USD", "EUR", "INR", "AUD", "CAD", "CHF", "DKK", "NOK", "SEK",
  "NZD", "SGD", "HKD", "JPY", "ZAR", "BRL", "MXN", "PLN", "AED", "GBP",
] as const;

export function normalizeCurrencyCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return null;
  return code;
}

/**
 * Parse a human/CSV monetary string into integer minor units.
 *
 * Accepted forms: "1234", "1234.56", "1,234.56", "£1,234.56", "1.234,56",
 * "1 234.56", "1,700", "$2 200".
 *
 * Deterministic rules:
 * - Currency symbols and spaces are removed.
 * - When both ',' and '.' appear, the rightmost separator is the decimal
 *   separator and the other is a thousands separator.
 * - A single ',' followed by exactly 1–2 trailing digits is a decimal
 *   separator; otherwise it is a thousands separator.
 * - A single '.' followed by 1–2 trailing digits is a decimal separator;
 *   a '.' followed by exactly 3 digits is treated as a decimal with three
 *   fraction digits and rejected (>2 decimals is malformed for money).
 */
export function parseMoneyToMinor(
  raw: string | number | null | undefined
): { ok: true; minor: number } | { ok: false; reason: string } {
  if (raw === null || raw === undefined) {
    return { ok: false, reason: "No value" };
  }

  let text: string;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { ok: false, reason: "Not a finite number" };
    text = raw.toFixed(2);
  } else {
    text = raw;
  }

  // Strip currency symbols, non-breaking spaces and thin spaces.
  text = text.replace(/[£$€₹¥\s\u00a0\u2009]/g, "").trim();

  if (text === "" || text === "-" || text === "+") {
    return { ok: false, reason: "Empty value" };
  }

  const negative = /^-/.test(text);
  if (/^[+-]/.test(text)) text = text.slice(1);

  if (!/^[\d.,]+$/.test(text)) {
    return { ok: false, reason: "Contains non-numeric characters" };
  }

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");

  let wholePart: string;
  let fracPart: string;

  if (lastComma !== -1 && lastDot !== -1) {
    // Both separators: rightmost is the decimal point.
    const decIdx = Math.max(lastComma, lastDot);
    const decChar = text[decIdx];
    wholePart = text.slice(0, decIdx);
    fracPart = text.slice(decIdx + 1);
    const other = decChar === "," ? "." : ",";
    if (fracPart.includes(decChar) || wholePart.includes(decChar) === false && wholePart.includes(other) && other === decChar) {
      return { ok: false, reason: "Repeated decimal separator" };
    }
    if (fracPart.includes(other) || wholePart.includes(decChar)) {
      return { ok: false, reason: "Mixed separator grouping" };
    }
    // Remove thousands separators from the whole part.
    wholePart = wholePart.split(other).join("");
    if (!/^\d*$/.test(wholePart) || !/^\d*$/.test(fracPart)) {
      return { ok: false, reason: "Malformed number" };
    }
  } else if (lastComma !== -1) {
    const count = text.split(",").length - 1;
    const tail = text.slice(lastComma + 1);
    if (count === 1 && tail.length >= 1 && tail.length <= 2 && /^\d+$/.test(tail)) {
      wholePart = text.slice(0, lastComma);
      fracPart = tail;
    } else {
      // Thousands separators: every group must be 3 digits.
      const groups = text.split(",");
      wholePart = groups.join("");
      fracPart = "";
      if (groups.some((g) => g.length !== 3) || !/^\d+$/.test(wholePart)) {
        return { ok: false, reason: "Malformed thousands grouping" };
      }
    }
  } else if (lastDot !== -1) {
    wholePart = text.slice(0, lastDot);
    fracPart = text.slice(lastDot + 1);
    if (wholePart.includes(".") || !/^\d*$/.test(wholePart) || !/^\d*$/.test(fracPart)) {
      return { ok: false, reason: "Malformed number" };
    }
    // "1.234" — a single dot with a 3-digit tail is ambiguous. We treat the
    // dot as a decimal point (standard in ad-platform CSV exports) and reject
    // it as >2 decimals, which surfaces for review rather than guessing.
  } else {
    wholePart = text;
    fracPart = "";
  }

  if (wholePart === "" && fracPart === "") {
    return { ok: false, reason: "Empty value" };
  }

  if (fracPart.length > 2) {
    return {
      ok: false,
      reason: `More than 2 decimal places ("${raw}")`,
    };
  }

  const whole = wholePart === "" ? 0 : Number.parseInt(wholePart, 10);
  const frac = fracPart === "" ? 0 : Number.parseInt(fracPart.padEnd(2, "0"), 10);

  if (!Number.isSafeInteger(whole * 100 + frac)) {
    return { ok: false, reason: "Value too large" };
  }

  const minor = whole * 100 + frac;
  if (negative && minor !== 0) {
    return { ok: false, reason: "Negative spend is not valid" };
  }

  return { ok: true, minor };
}

/** Format minor units for display, e.g. 4800 -> "£48.00". */
export function formatMoney(minor: number, currency: string, opts?: { compact?: boolean }): string {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: opts?.compact ? 0 : 2,
      notation: opts?.compact ? "compact" : "standard",
    }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

/** Format for tabular/ledger display with exact pence. */
export function formatMoneyExact(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

/**
 * Sum minor-unit spends that share one currency.
 * Throws MIXED_CURRENCY rather than silently combining values.
 */
export function sumMinor(values: { minor: number; currency: string }[]): {
  minor: number;
  currency: string;
} {
  if (values.length === 0) {
    return { minor: 0, currency: "GBP" };
  }
  const currency = values[0].currency;
  if (values.some((v) => v.currency !== currency)) {
    throw new MoneyError(
      "MIXED_CURRENCY",
      "This file contains more than one currency. Choose one currency or split the analysis."
    );
  }
  let total = 0;
  for (const v of values) total += v.minor;
  return { minor: total, currency };
}
