import { z } from "zod";
import { ok, fail, route, serverLog } from "@/lib/api/envelope";
import { fetchPage } from "@/lib/scanner/fetch-page";
import { runChecks } from "@/lib/scanner/findings";
import { detectTrackers, platformRelevantTrackers, trackerLabel, canonicalPlatform } from "@/lib/scanner/tracking";
import type { TrackerKey } from "@/lib/scanner/types";
import { inspectContent } from "@/lib/scanner/content";
import { diffAttribution } from "@/lib/urls/normalize";
import { PRODUCT } from "@/config/product";

export const runtime = "nodejs";
export const maxDuration = 30;

/* ------------------------------------------------------------------ */
/* Public single-page evaluation — a sales demonstration of the real   */
/* scanning engine.                                                    */
/*                                                                     */
/* Deliberately constrained (see SECURITY.md):                         */
/*  · exactly ONE public http(s) URL per evaluation;                   */
/*  · every existing SSRF control applies (DNS resolution, private/    */
/*    loopback/metadata range rejection, per-hop redirect re-          */
/*    validation, credentials rejection, protocol allowlist);          */
/*  · the scanner's own timeout, redirect and body-size limits;        */
/*  · no caller-controlled headers, cookies or credentials forwarded;  */
/*  · strong rate limiting per IP plus a global abuse ceiling;         */
/*  · EPHEMERAL: nothing is written to the database, no workspace is   */
/*    involved, and the evaluated URL is never logged.                 */
/* ------------------------------------------------------------------ */

const MAX_SPEND_MINOR = 2_000_000_000;

const TRACKER_KEYS: TrackerKey[] = [
  "ga4",
  "gtm",
  "google_ads",
  "meta_pixel",
  "tiktok_pixel",
  "linkedin_insight",
];

const bodySchema = z.object({
  url: z.string().trim().min(1).max(2000),
  platform: z.enum(["google", "meta", "tiktok", "linkedin", "other"]).optional(),
  spendMinor: z.number().int().min(0).max(MAX_SPEND_MINOR).optional(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  expectedTracker: z.enum(TRACKER_KEYS as unknown as [TrackerKey, ...TrackerKey[]]).optional(),
});

/* --------------------------- Rate limiting -------------------------- */
/* In-memory, per instance (the same limitation and pattern as the      */
/* login limiter; documented in SECURITY.md). 3 evaluations per IP per  */
/* hour, plus a global abuse ceiling so a rotating-IP script cannot    */
/* hammer a single instance.                                           */

const PER_IP_LIMIT = 3;
const PER_IP_WINDOW_MS = 60 * 60 * 1000;
const GLOBAL_LIMIT = 200;
const GLOBAL_WINDOW_MS = 60 * 60 * 1000;

const perIp = new Map<string, number[]>();
const globalHits: number[] = [];

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function rateLimitState(ip: string): { limited: boolean; remaining: number; retryInSeconds: number } {
  const now = Date.now();
  const hits = (perIp.get(ip) ?? []).filter((t) => t > now - PER_IP_WINDOW_MS);
  if (hits.length >= PER_IP_LIMIT) {
    const retryIn = Math.ceil((hits[0] + PER_IP_WINDOW_MS - now) / 1000);
    return { limited: true, remaining: 0, retryInSeconds: retryIn };
  }
  while (globalHits.length && globalHits[0] <= now - GLOBAL_WINDOW_MS) globalHits.shift();
  if (globalHits.length >= GLOBAL_LIMIT) {
    return { limited: true, remaining: 0, retryInSeconds: Math.ceil((globalHits[0] + GLOBAL_WINDOW_MS - now) / 1000) };
  }
  return { limited: false, remaining: PER_IP_LIMIT - hits.length, retryInSeconds: 0 };
}

function recordEvaluation(ip: string): void {
  const now = Date.now();
  const hits = (perIp.get(ip) ?? []).filter((t) => t > now - PER_IP_WINDOW_MS);
  hits.push(now);
  perIp.set(ip, hits);
  globalHits.push(now);
  if (perIp.size > 5000) {
    for (const [k, v] of perIp) {
      if (v.every((t) => t <= now - PER_IP_WINDOW_MS)) perIp.delete(k);
    }
  }
}

/* ------------------------------ Route ------------------------------- */

export const POST = route(async (req) => {
  if (!PRODUCT.pageCheckEnabled) {
    return fail("SCANNER_BLOCKED", "The one-page public check is disabled on this deployment.", 403);
  }

  const ip = clientIp(req);
  const limit = rateLimitState(ip);
  if (limit.limited) {
    const minutes = Math.max(1, Math.ceil(limit.retryInSeconds / 60));
    return fail(
      "RATE_LIMITED",
      `The free one-page check is limited to ${PER_IP_LIMIT} per hour. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      429,
      { retryInSeconds: limit.retryInSeconds }
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return fail("INVALID_INPUT", "Enter a full landing-page URL, e.g. https://example.com/landing", 400);
  }
  const input = parsed.data;

  // Validate URL shape up front (protocol + parseability). The full SSRF
  // verdict — DNS resolution and IP-range classification — happens inside
  // fetchPage, and is re-validated at every redirect hop.
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(input.url);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return fail("INVALID_INPUT", "Only http and https URLs can be checked.", 400);
    }
    if (parsedUrl.username || parsedUrl.password) {
      return fail("INVALID_INPUT", "URLs with embedded credentials are rejected.", 400);
    }
  } catch {
    return fail("INVALID_INPUT", "Enter a full landing-page URL, e.g. https://example.com/landing", 400);
  }

  recordEvaluation(ip);

  // The REAL engine fetch — the same hardened path the paid product uses.
  const result = await fetchPage(input.url);

  // Safety rejection (SSRF): the destination resolved somewhere the public
  // check must never touch. fetchPage returns the verdict WITHOUT having
  // requested the page.
  const blocked = result.kind === "error" && result.errorCode === "BLOCKED_URL";

  const platform = input.platform ?? "other";
  const currency = input.currency ?? "GBP";

  if (blocked) {
    serverLog("info", "public_scan", { outcome: "blocked", code: result.errorCode });
    return ok({
      outcome: "blocked",
      requestedUrl: input.url,
      message:
        "This address is not a public destination the checker can safely request (private, internal or otherwise blocked). Public one-page checks only reach public web addresses.",
      rateLimit: { remaining: limit.remaining - 1 },
    });
  }

  // Tracker status across the full catalogue (the result view shows the
  // relevant ones prominently and the rest for completeness).
  const detections = result.kind === "ok" ? detectTrackers(result.html) : [];
  const detectedMap = new Map(detections.map((d) => [d.key, d.detected]));
  const relevant = new Set([...platformRelevantTrackers(platform), ...TRACKER_KEYS]);
  const trackers = [...relevant].map((key) => ({
    key,
    label: trackerLabel(key),
    detected: detectedMap.get(key) ?? false,
    relevant: platformRelevantTrackers(platform).includes(key) || key === input.expectedTracker,
  }));

  const content = result.kind === "ok" ? inspectContent(result.html) : null;

  const attribution =
    result.kind === "ok" && result.finalUrl && result.finalUrl !== input.url
      ? safeDiffAttribution(input.url, result.finalUrl)
      : [];

  // Findings via the SAME deterministic check engine as the paid product,
  // with the visitor's platform/expectation/spend context.
  const { findings } = runChecks(result, {
    originalUrl: input.url,
    normalizedKey: `${parsedUrl.hostname}${parsedUrl.pathname}`,
    platforms: [canonicalPlatform(platform)],
    associatedSpendMinor: input.spendMinor ?? 0,
    currency,
    expectations: input.expectedTracker ? { expectedTracker: input.expectedTracker } : null,
  });

  serverLog("info", "public_scan", {
    outcome: result.kind === "ok" ? "checked" : "error",
    code: result.kind === "ok" ? undefined : result.errorCode,
    findings: findings.length,
  });

  const redirectSummary = result.redirects.map((h) => ({
    fromUrl: h.fromUrl,
    toUrl: h.toUrl,
    statusCode: h.statusCode,
  }));

  return ok({
    outcome: result.kind === "ok" ? "checked" : "unreachable",
    requestedUrl: input.url,
    fetch:
      result.kind === "ok"
        ? {
            finalUrl: result.finalUrl,
            httpStatus: result.httpStatus,
            responseTimeMs: result.responseTimeMs,
            contentType: result.contentType,
            bytesInspected: result.bytesInspected,
            redirects: redirectSummary,
          }
        : {
            finalUrl: result.finalUrl,
            httpStatus: result.httpStatus,
            responseTimeMs: result.responseTimeMs,
            redirects: redirectSummary,
            errorCode: result.errorCode,
            message: result.message,
          },
    trackers,
    content: content
      ? {
          title: content.title,
          noindex: content.noindex,
          soft404: content.soft404.match,
          maintenance: content.maintenance.match,
          soldOut: content.soldOut.match,
          ctaDetected: content.hasCta,
          formDetected: content.hasForm,
          wordCount: content.bodyTextLength,
        }
      : null,
    attribution,
    findings: findings.map((f) => ({
      key: f.key,
      title: f.title,
      severity: f.severity,
      summary: f.summary,
      explanation: f.explanation,
      recommendation: f.recommendation ?? null,
    })),
    spend: input.spendMinor !== undefined ? { minor: input.spendMinor, currency } : null,
    platform,
    expectedTracker: input.expectedTracker ?? null,
    rateLimit: { remaining: limit.remaining - 1 },
  });
});

function safeDiffAttribution(originalUrl: string, finalUrl: string) {
  try {
    return diffAttribution(originalUrl, finalUrl);
  } catch {
    return [];
  }
}
