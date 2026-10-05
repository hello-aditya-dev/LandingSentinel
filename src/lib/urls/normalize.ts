/**
 * Destination URL normalization.
 *
 * Two concepts, kept strictly separate:
 * - `originalUrl` — exactly what the campaign CSV contained. Never modified.
 * - `normalizedKey` — the grouping key for the Money Map. Marketing
 *   attribution parameters (utm_*, click IDs) are removed so that three
 *   campaigns pointing at the same page with different UTMs aggregate to one
 *   destination. Non-marketing query parameters are KEPT because they can
 *   materially change the page.
 */

/** Marketing attribution parameters removed for grouping (never for evidence). */
export const MARKETING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "msclkid",
  "ttclid",
  "li_fat_id",
  "twclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "yclid",
] as const;

/** Parameters compared for attribution survival across redirects. */
export const ATTRIBUTION_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "msclkid",
  "ttclid",
  "li_fat_id",
] as const;

export type NormalizedDestination = {
  ok: true;
  normalizedKey: string;
  representativeUrl: string;
  hostname: string;
  pathname: string;
  keptParams: [string, string][];
};

export type UrlParseFailure = { ok: false; reason: string };

export function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Normalize a URL for destination grouping.
 * The URL must already be a valid absolute http(s) URL.
 */
export function normalizeDestinationUrl(raw: string): NormalizedDestination | UrlParseFailure {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "Not a valid URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `Unsupported protocol: ${url.protocol.replace(":", "")}` };
  }

  // Hostname: lowercase (URL already normalizes), strip default ports.
  const port =
    (url.protocol === "https:" && url.port === "443") ||
    (url.protocol === "http:" && url.port === "80")
      ? ""
      : url.port;

  // Path: collapse a redundant trailing slash (keep root "/").
  let pathname = url.pathname;
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }

  // Query: drop marketing params, sort the remainder deterministically.
  const kept: [string, string][] = [];
  for (const [key, value] of url.searchParams.entries()) {
    if ((MARKETING_PARAMS as readonly string[]).includes(key.toLowerCase())) continue;
    kept.push([key, value]);
  }
  kept.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));

  const host = url.hostname.toLowerCase();
  const hostWithPort = port ? `${host}:${port}` : host;
  const query = kept.length
    ? `?${kept.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}`
    : "";

  return {
    ok: true as const,
    normalizedKey: `${hostWithPort}${pathname}${query}`,
    representativeUrl: `${url.protocol}//${hostWithPort}${pathname}${query}`,
    hostname: host,
    pathname,
    keptParams: kept,
  };
}

/** Display form: strip protocol for compact table cells. */
export function displayUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname === "/" ? "" : u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

/** Compare attribution parameters between the imported and final URL. */
export type AttributionDiff = {
  param: string;
  status: "preserved" | "removed" | "changed" | "added";
  originalValue?: string;
  finalValue?: string;
};

export function diffAttribution(originalUrl: string, finalUrl: string): AttributionDiff[] {
  const from = new URL(originalUrl).searchParams;
  const to = new URL(finalUrl).searchParams;
  const diffs: AttributionDiff[] = [];

  for (const param of ATTRIBUTION_PARAMS) {
    const hasFrom = from.has(param);
    const hasTo = to.has(param);
    if (!hasFrom && !hasTo) continue;
    if (hasFrom && !hasTo) {
      diffs.push({ param, status: "removed", originalValue: from.get(param) ?? "" });
    } else if (!hasFrom && hasTo) {
      diffs.push({ param, status: "added", finalValue: to.get(param) ?? "" });
    } else if (from.get(param) !== to.get(param)) {
      diffs.push({
        param,
        status: "changed",
        originalValue: from.get(param) ?? "",
        finalValue: to.get(param) ?? "",
      });
    } else {
      diffs.push({ param, status: "preserved", originalValue: from.get(param) ?? "" });
    }
  }
  return diffs;
}

/** Base registered domain (approximate: last two labels). */
export function baseDomain(hostname: string): string {
  const labels = hostname.toLowerCase().split(".");
  if (labels.length <= 2) return hostname;
  // Treat common public suffixes conservatively.
  const secondLevel = labels.slice(-2).join(".");
  return secondLevel;
}

export function sameSite(hostA: string, hostB: string): boolean {
  return baseDomain(hostA) === baseDomain(hostB);
}
