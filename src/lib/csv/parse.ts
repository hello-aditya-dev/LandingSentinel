/**
 * CSV import pipeline: parsing, header detection, field mapping and
 * row-level validation. Runs identically on the server (authoritative) and
 * may be used client-side for preview only — the server ALWAYS re-validates
 * before persistence (never trust client validation alone).
 */

import Papa from "papaparse";
import { parseMoneyToMinor, normalizeCurrencyCode } from "@/lib/money/money";
import { normalizeDestinationUrl, isHttpUrl } from "@/lib/urls/normalize";

export type FieldRole = "platform" | "campaign" | "adGroup" | "ad" | "url" | "spend" | "currency";

export const FIELD_ROLES: { role: FieldRole; label: string; required: boolean; recommended: boolean }[] = [
  { role: "url", label: "Destination URL", required: true, recommended: true },
  { role: "spend", label: "Spend", required: true, recommended: true },
  { role: "campaign", label: "Campaign name", required: false, recommended: true },
  { role: "platform", label: "Platform", required: false, recommended: true },
  { role: "adGroup", label: "Ad group / ad set", required: false, recommended: false },
  { role: "ad", label: "Ad name", required: false, recommended: false },
  { role: "currency", label: "Currency", required: false, recommended: false },
];

/** Alias table from the product specification (§ Field mapping). */
const FIELD_ALIASES: Record<FieldRole, string[]> = {
  platform: ["platform", "channel", "network", "source", "ad platform", "publisher"],
  campaign: ["campaign", "campaign name", "campaign_name", "campaignname"],
  adGroup: ["ad group", "ad group name", "adgroup", "adset", "ad set", "adset_name", "ad set name"],
  ad: ["ad", "ad name", "creative", "creative name", "ad name (final url)"],
  url: [
    "final url",
    "final_url",
    "finalurl",
    "destination",
    "destination url",
    "landing page",
    "landing_page",
    "landing page url",
    "url",
    "website url",
    "link",
  ],
  spend: ["cost", "spend", "amount spent", "amount_spent", "spend (currency)", "total spend", "cost usd", "cost gbp"],
  currency: ["currency", "currency code", "currency_code", "spend currency"],
};

export type MappingSuggestion = {
  role: FieldRole;
  header: string;
  confidence: "exact" | "fuzzy" | "unmapped";
  score: number;
};

function cleanHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Suggest a field mapping from detected headers. Uncertain guesses are NOT made. */
export function detectMapping(headers: string[]): MappingSuggestion[] {
  const cleaned = headers.map((h) => ({ raw: h, clean: cleanHeader(h) }));
  const suggestions: MappingSuggestion[] = [];
  const usedHeaders = new Set<string>();

  for (const role of FIELD_ROLES.map((r) => r.role)) {
    let best: { raw: string; score: number } | null = null;
    for (const h of cleaned) {
      if (usedHeaders.has(h.raw)) continue;
      const alias = FIELD_ALIASES[role].find((a) => a === h.clean);
      if (alias) {
        best = { raw: h.raw, score: 1 };
        break;
      }
    }
    if (best) {
      usedHeaders.add(best.raw);
      suggestions.push({ role, header: best.raw, confidence: "exact", score: 1 });
      continue;
    }
    // Fuzzy: alias contained in header or vice versa — low confidence, offered
    // but never auto-applied silently.
    let fuzzy: { raw: string; score: number } | null = null;
    for (const h of cleaned) {
      if (usedHeaders.has(h.raw)) continue;
      for (const alias of FIELD_ALIASES[role]) {
        if (h.clean.includes(alias) || alias.includes(h.clean)) {
          const score = alias.length / Math.max(h.clean.length, alias.length);
          if (!fuzzy || score > fuzzy.score) fuzzy = { raw: h.raw, score };
        }
      }
    }
    if (fuzzy && fuzzy.score >= 0.6) {
      usedHeaders.add(fuzzy.raw);
      suggestions.push({ role, header: fuzzy.raw, confidence: "fuzzy", score: fuzzy.score });
    } else {
      suggestions.push({ role, header: "", confidence: "unmapped", score: 0 });
    }
  }
  return suggestions;
}

export type ParsedCsv = {
  ok: true;
  headers: string[];
  rows: Record<string, string>[];
  emptyLines: number;
} | { ok: false; reason: string };

export function parseCsvText(text: string): ParsedCsv {
  if (!text || !text.trim()) {
    return { ok: false, reason: "The file is empty." };
  }
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
    transformHeader: (h) => h.trim(),
  });

  if (result.errors.length > 0) {
    // Field-count mismatches on some rows are tolerable; structure errors are not.
    const fatal = result.errors.filter(
      (e) => e.type === "Delimiter" || e.code === "UndetectableDelimiter" || (e.row === undefined && e.type !== "FieldMismatch" && e.code !== "TooFewFields" && e.code !== "TooManyFields")
    );
    if (fatal.length > 0 || result.data === undefined) {
      return { ok: false, reason: "The file is not valid CSV." };
    }
    if (result.errors.filter((e) => e.code === "TooFewFields" || e.code === "TooManyFields").length > result.data.length / 2) {
      return { ok: false, reason: "Most rows have a different number of fields than the header. The file may use a different delimiter." };
    }
  }

  const headers = (result.meta.fields ?? []).filter((h) => h && h.length > 0);
  if (headers.length === 0) {
    return { ok: false, reason: "No header row detected." };
  }
  const rows = (result.data ?? []).filter((r) =>
    Object.values(r).some((v) => v !== null && String(v).trim() !== "")
  );
  if (rows.length === 0) {
    return { ok: false, reason: "The file has a header row but no campaign rows." };
  }
  return { ok: true, headers, rows, emptyLines: 0 };
}

export type Mapping = Partial<Record<FieldRole, string>> & { defaultCurrency?: string };

export type ValidRow = {
  index: number;
  platform: string | null;
  campaignName: string | null;
  adGroupName: string | null;
  adName: string | null;
  originalUrl: string;
  spendMinor: number;
  currency: string;
  raw: Record<string, string>;
};

export type RejectedRow = {
  index: number;
  reason: string;
  code: "INVALID_URL" | "UNSUPPORTED_PROTOCOL" | "INVALID_SPEND" | "NEGATIVE_SPEND" | "SPEND_TOO_LARGE" | "INVALID_CURRENCY" | "DUPLICATE_ROW" | "EMPTY_ROW";
  raw: Record<string, string>;
};

/**
 * Per-row spend ceiling: 32-bit signed integer minor units (PostgreSQL
 * integer). £21,474,836.47 in a single campaign row is far beyond real
 * paid-media exports; the boundary is documented in CONFIGURATION.md and
 * rejected gracefully (surfaced for review) rather than failing the import.
 */
export const MAX_SPEND_MINOR_PER_ROW = 2_147_483_647;

export type ValidationSummary = {
  valid: ValidRow[];
  rejected: RejectedRow[];
  currencies: string[];
  platforms: Record<string, number>;
  totalSpendMinor: number;
  currency: string;
  duplicateCount: number;
};

/** Validate parsed rows against a mapping. Safe partial processing: bad rows
 *  are rejected individually, never destroying the whole import. */
export function validateRows(rows: Record<string, string>[], mapping: Mapping): ValidationSummary {
  const valid: ValidRow[] = [];
  const rejected: RejectedRow[] = [];
  const currencies = new Set<string>();
  const platforms: Record<string, number> = {};
  const seen = new Map<string, number>();
  let totalSpendMinor = 0;
  let duplicateCount = 0;

  const getUrl = (row: Record<string, string>) => (mapping.url ? (row[mapping.url] ?? "").trim() : "");

  rows.forEach((row, index) => {
    const url = getUrl(row);

    if (!url) {
      rejected.push({ index, code: "INVALID_URL", reason: "No destination URL", raw: row });
      return;
    }
    if (!isHttpUrl(url)) {
      const proto = /^([a-z][a-z0-9+.-]*):\/\//i.exec(url)?.[1] ?? "unknown";
      rejected.push({
        index,
        code: "UNSUPPORTED_PROTOCOL",
        reason: `Unsupported protocol "${proto}" — only http and https destinations can be scanned`,
        raw: row,
      });
      return;
    }

    const spendRaw = mapping.spend ? (row[mapping.spend] ?? "").trim() : "";
    const spend = parseMoneyToMinor(spendRaw);
    if (!spend.ok) {
      rejected.push({ index, code: "INVALID_SPEND", reason: `Spend is not a valid amount: ${spend.reason}`, raw: row });
      return;
    }
    if (spend.minor < 0) {
      rejected.push({ index, code: "NEGATIVE_SPEND", reason: "Spend is negative", raw: row });
      return;
    }
    if (spend.minor > MAX_SPEND_MINOR_PER_ROW) {
      rejected.push({
        index,
        code: "SPEND_TOO_LARGE",
        reason: "Spend exceeds the per-row maximum of 2,147,483,647 minor units (£21,474,836.47) — the 32-bit storage boundary",
        raw: row,
      });
      return;
    }

    const currencyRaw = mapping.currency ? (row[mapping.currency] ?? "").trim() : "";
    const currency = currencyRaw
      ? normalizeCurrencyCode(currencyRaw)
      : mapping.defaultCurrency
        ? normalizeCurrencyCode(mapping.defaultCurrency)
        : null;
    if (!currency) {
      rejected.push({
        index,
        code: "INVALID_CURRENCY",
        reason: currencyRaw ? `"${currencyRaw}" is not a valid 3-letter currency code` : "No currency specified and no default chosen",
        raw: row,
      });
      return;
    }
    currencies.add(currency);

    const platform = mapping.platform ? (row[mapping.platform] ?? "").trim() || null : null;
    if (platform) {
      platforms[platform] = (platforms[platform] ?? 0) + 1;
    }

    // Duplicate detection: same URL + campaign + platform (spend included —
    // identical full rows are almost always accidental duplicates).
    const identity = [url, platform ?? "", mapping.campaign ? row[mapping.campaign] ?? "" : ""].join("¦");
    if (seen.has(identity)) {
      duplicateCount += 1;
      rejected.push({ index, code: "DUPLICATE_ROW", reason: "Duplicate of an earlier row in this file", raw: row });
      return;
    }
    seen.set(identity, index);

    const normalized = normalizeDestinationUrl(url);
    if (!normalized.ok) {
      rejected.push({ index, code: "INVALID_URL", reason: `URL could not be normalized: ${normalized.reason}`, raw: row });
      return;
    }

    totalSpendMinor += spend.minor;
    valid.push({
      index,
      platform,
      campaignName: mapping.campaign ? (row[mapping.campaign] ?? "").trim() || null : null,
      adGroupName: mapping.adGroup ? (row[mapping.adGroup] ?? "").trim() || null : null,
      adName: mapping.ad ? (row[mapping.ad] ?? "").trim() || null : null,
      originalUrl: url,
      spendMinor: spend.minor,
      currency,
      raw: row,
    });
  });

  const currencyList = [...currencies].sort();
  return {
    valid,
    rejected,
    currencies: currencyList,
    platforms,
    totalSpendMinor,
    currency: currencyList[0] ?? mapping.defaultCurrency ?? "GBP",
    duplicateCount,
  };
}

/** Dominant platform for an import batch label. */
export function dominantPlatform(platforms: Record<string, number>): string | null {
  const entries = Object.entries(platforms).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  return entries[0][0];
}
