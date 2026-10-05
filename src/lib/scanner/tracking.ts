/**
 * Static HTML tracking-signature detection.
 *
 * Detection is signature-based over the retrieved HTML. It can prove a tag
 * IS present; it can never prove a tag fires at runtime. All language
 * discipline around this limitation lives in findings.ts.
 */

import type { TrackerDetection, TrackerKey } from "./types";

type Signature = {
  id: string;
  tracker: TrackerKey;
  pattern: RegExp;
  description: string;
};

/**
 * Signature catalogue. Each entry is a distinctive literal signature from
 * the vendor's documented embed code. Patterns are case-insensitive.
 */
export const SIGNATURES: Signature[] = [
  // Google Analytics 4 (gtag.js with a G- measurement ID)
  {
    id: "ga4-gtag-js",
    tracker: "ga4",
    pattern: /googletagmanager\.com\/gtag\/js\?id=G-[A-Z0-9]{4,}/i,
    description: "gtag.js loader with a GA4 measurement ID",
  },
  {
    id: "ga4-gtag-config",
    tracker: "ga4",
    pattern: /gtag\(\s*['"]config['"]\s*,\s*['"]G-[A-Z0-9]{4,}['"]/,
    description: "gtag('config', 'G-…') call",
  },
  // Universal Analytics (legacy)
  {
    id: "ua-create",
    tracker: "ga4",
    pattern: /ga\(\s*['"]create['"]\s*,\s*['"]UA-\d{4,}-\d{1,}['"]/,
    description: "legacy analytics.js create call",
  },
  // Google Tag Manager
  {
    id: "gtm-js",
    tracker: "gtm",
    pattern: /googletagmanager\.com\/gtm\.js\?id=GTM-[A-Z0-9]{4,}/i,
    description: "GTM container loader",
  },
  {
    id: "gtm-ns",
    tracker: "gtm",
    pattern: /googletagmanager\.com\/ns\.html\?id=GTM-[A-Z0-9]{4,}/i,
    description: "GTM noscript iframe",
  },
  {
    id: "gtm-datalayer-init",
    tracker: "gtm",
    pattern: /\(function\s*\(\s*w\s*,\s*d\s*,\s*s\s*,\s*l\s*,\s*i\s*\)\s*\{[\s\S]{0,600}GTM-/i,
    description: "GTM inline bootstrap",
  },
  // Google Ads conversion tag
  {
    id: "gads-aw-config",
    tracker: "google_ads",
    pattern: /gtag\(\s*['"]config['"]\s*,\s*['"]AW-\d{6,}['"]/,
    description: "gtag('config', 'AW-…') conversion call",
  },
  {
    id: "gads-aw-loader",
    tracker: "google_ads",
    pattern: /googletagmanager\.com\/gtag\/js\?id=AW-\d{6,}/i,
    description: "gtag.js loader with an AW conversion ID",
  },
  {
    id: "gads-conversion-js",
    tracker: "google_ads",
    pattern: /googleadservices\.com\/pagead\/conversion/i,
    description: "conversion.js / conversion_async.js include",
  },
  // Meta Pixel
  {
    id: "meta-fbevents",
    tracker: "meta_pixel",
    pattern: /connect\.facebook\.net\/[a-z_-]{2,10}\/fbevents\.js/i,
    description: "fbevents.js include",
  },
  {
    id: "meta-fbq-init",
    tracker: "meta_pixel",
    pattern: /fbq\(\s*['"]init['"]\s*,\s*['"]\d{8,}['"]/,
    description: "fbq('init', …) call",
  },
  {
    id: "meta-tr-img",
    tracker: "meta_pixel",
    pattern: /facebook\.com\/tr\?(?:[^"'\s]*&)?id=\d{8,}/i,
    description: "facebook.com/tr image request",
  },
  // TikTok Pixel
  {
    id: "tiktok-events-js",
    tracker: "tiktok_pixel",
    pattern: /analytics\.tiktok\.com\/i18n\/pixel\/events\.js/i,
    description: "TikTok pixel events.js include",
  },
  {
    id: "tiktok-ttq-load",
    tracker: "tiktok_pixel",
    pattern: /ttq\.load\(\s*['"][A-Z0-9]{10,}['"]/,
    description: "ttq.load(…) call",
  },
  // LinkedIn Insight Tag
  {
    id: "li-insight-js",
    tracker: "linkedin_insight",
    pattern: /snap\.licdn\.com\/li\.lms-analytics\/insight\.min\.js/i,
    description: "LinkedIn insight.min.js include",
  },
  {
    id: "li-partner-id",
    tracker: "linkedin_insight",
    pattern: /_linkedin_partner_id\s*=\s*['"]?\d{6,}/,
    description: "_linkedin_partner_id assignment",
  },
];

/** Extract a safe plain-text excerpt around a match (never executed). */
function excerptAround(html: string, index: number, radius = 60): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(html.length, index + radius);
  return html
    .slice(start, end)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Detect tracker signatures in HTML. Returns one entry per tracker with
 * the first matching signature as evidence.
 */
export function detectTrackers(html: string): TrackerDetection[] {
  const trackerKeys: TrackerKey[] = ["ga4", "gtm", "google_ads", "meta_pixel", "tiktok_pixel", "linkedin_insight"];
  const results: TrackerDetection[] = [];

  for (const key of trackerKeys) {
    let detection: TrackerDetection = { key, detected: false };
    for (const sig of SIGNATURES) {
      if (sig.tracker !== key) continue;
      const match = sig.pattern.exec(html);
      if (match) {
        detection = {
          key,
          detected: true,
          signatureId: sig.id,
          excerpt: excerptAround(html, match.index),
        };
        break;
      }
    }
    results.push(detection);
  }
  return results;
}

/** Map an imported platform string to a canonical platform key. */
export function canonicalPlatform(raw: string | null | undefined): "meta" | "google" | "tiktok" | "linkedin" | "other" {
  if (!raw) return "other";
  const value = raw.toLowerCase();
  if (value.includes("meta") || value.includes("facebook") || value.includes("instagram") || value.includes("fb")) return "meta";
  if (value.includes("google") || value.includes("adwords") || value.includes("youtube") || value.includes("search")) return "google";
  if (value.includes("tiktok")) return "tiktok";
  if (value.includes("linkedin")) return "linkedin";
  return "other";
}

/** Which tracker signatures are relevant for a platform's campaigns. */
export function platformRelevantTrackers(platform: string): TrackerKey[] {
  switch (platform) {
    case "meta":
      return ["meta_pixel"];
    case "google":
      return ["ga4", "google_ads"];
    case "tiktok":
      return ["tiktok_pixel"];
    case "linkedin":
      return ["linkedin_insight"];
    default:
      return [];
  }
}

export function trackerLabel(key: TrackerKey): string {
  const labels: Record<TrackerKey, string> = {
    ga4: "Google Analytics (GA4)",
    gtm: "Google Tag Manager",
    google_ads: "Google Ads tag",
    meta_pixel: "Meta Pixel",
    tiktok_pixel: "TikTok Pixel",
    linkedin_insight: "LinkedIn Insight Tag",
  };
  return labels[key];
}
