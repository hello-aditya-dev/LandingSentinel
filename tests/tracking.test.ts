import { describe, it, expect } from "vitest";
import { detectTrackers, canonicalPlatform, platformRelevantTrackers } from "@/lib/scanner/tracking";
import { runChecks } from "@/lib/scanner/findings";
import type { PageFetchResult, ScanContext } from "@/lib/scanner/types";

/* Fixture HTML — one distinct, documented embed signature per tracker. */

const GA4_HTML = `<html><head><title>LP</title>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-AB12CD34"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-AB12CD34');</script>
</head><body><h1>LP</h1><p>${"Content ".repeat(60)}</p></body></html>`;

const GTM_HTML = `<html><head><title>LP</title>
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-AB12CD');</script>
</head><body><h1>LP</h1><p>${"Content ".repeat(60)}</p></body></html>`;

const GOOGLE_ADS_HTML = `<html><head><title>LP</title>
<script>googletag = window.googletag || {};gtag('config','AW-123456789');</script>
</head><body><h1>LP</h1><p>${"Content ".repeat(60)}</p></body></html>`;

const META_PIXEL_HTML = `<html><head><title>LP</title>
<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s);}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','1234567890123456');fbq('track','PageView');</script>
</head><body><h1>LP</h1><p>${"Content ".repeat(60)}</p></body></html>`;

const TIKTOK_PIXEL_HTML = `<html><head><title>LP</title>
<script>!function (w, d, t) {w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript";o.async=!0;o.src=r+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('CABCDEFGHIJKLMNOP');ttq.page();}(window, document, 'ttq');</script>
</head><body><h1>LP</h1><p>${"Content ".repeat(60)}</p></body></html>`;

const LINKEDIN_HTML = `<html><head><title>LP</title>
<script>_linkedin_partner_id = "1234567";</script>
<script async src="https://snap.licdn.com/li.lms-analytics/insight.min.js"></script>
</head><body><h1>LP</h1><p>${"Content ".repeat(60)}</p></body></html>`;

const NO_TRACKER_HTML = `<html><head><title>LP</title></head><body><h1>LP</h1><p>${"Content ".repeat(60)}</p><a href="/cart">Shop now</a></body></html>`;

function fetchOk(html: string, url = "https://shop.example.com/lp"): PageFetchResult {
  return {
    kind: "ok",
    requestedUrl: url,
    finalUrl: url,
    httpStatus: 200,
    responseTimeMs: 120,
    contentType: "text/html; charset=utf-8",
    headers: {},
    html,
    bytesInspected: html.length,
    truncatedAtCap: false,
    redirects: [],
  };
}

function ctx(overrides: Partial<ScanContext> = {}): ScanContext {
  return {
    originalUrl: "https://shop.example.com/lp",
    normalizedKey: "shop.example.com/lp",
    platforms: ["other"],
    associatedSpendMinor: 100_000,
    currency: "GBP",
    ...overrides,
  };
}

describe("tracking detection: signatures", () => {
  it("detects GA4 (gtag.js with G- measurement ID)", () => {
    const d = detectTrackers(GA4_HTML).find((t) => t.key === "ga4");
    expect(d?.detected).toBe(true);
    expect(d?.signatureId).toMatch(/ga4/);
    expect(d?.excerpt).toBeTruthy();
  });

  it("detects Google Tag Manager", () => {
    const d = detectTrackers(GTM_HTML).find((t) => t.key === "gtm");
    expect(d?.detected).toBe(true);
    expect(d?.signatureId).toMatch(/gtm/);
  });

  it("detects the Google Ads conversion tag", () => {
    const d = detectTrackers(GOOGLE_ADS_HTML).find((t) => t.key === "google_ads");
    expect(d?.detected).toBe(true);
  });

  it("detects the Meta Pixel", () => {
    const d = detectTrackers(META_PIXEL_HTML).find((t) => t.key === "meta_pixel");
    expect(d?.detected).toBe(true);
    expect(d?.signatureId).toMatch(/meta/);
  });

  it("detects the TikTok Pixel", () => {
    const d = detectTrackers(TIKTOK_PIXEL_HTML).find((t) => t.key === "tiktok_pixel");
    expect(d?.detected).toBe(true);
  });

  it("detects the LinkedIn Insight Tag", () => {
    const d = detectTrackers(LINKEDIN_HTML).find((t) => t.key === "linkedin_insight");
    expect(d?.detected).toBe(true);
  });

  it("reports no tracker for a clean page", () => {
    for (const t of detectTrackers(NO_TRACKER_HTML)) {
      expect(t.detected).toBe(false);
    }
  });

  it("returns an entry for every tracker key", () => {
    expect(detectTrackers(NO_TRACKER_HTML).map((t) => t.key)).toEqual([
      "ga4",
      "gtm",
      "google_ads",
      "meta_pixel",
      "tiktok_pixel",
      "linkedin_insight",
    ]);
  });
});

describe("tracking detection: platform canonicalisation", () => {
  it("maps vendor names to canonical platforms", () => {
    expect(canonicalPlatform("Meta")).toBe("meta");
    expect(canonicalPlatform("Facebook")).toBe("meta");
    expect(canonicalPlatform("Instagram")).toBe("meta");
    expect(canonicalPlatform("Google Ads")).toBe("google");
    expect(canonicalPlatform("AdWords")).toBe("google");
    expect(canonicalPlatform("YouTube")).toBe("google");
    expect(canonicalPlatform("TikTok")).toBe("tiktok");
    expect(canonicalPlatform("LinkedIn")).toBe("linkedin");
    expect(canonicalPlatform("Microsoft Ads")).toBe("other");
    expect(canonicalPlatform(null)).toBe("other");
  });

  it("maps platforms to their relevant trackers", () => {
    expect(platformRelevantTrackers("meta")).toEqual(["meta_pixel"]);
    expect(platformRelevantTrackers("google")).toEqual(["ga4", "google_ads"]);
    expect(platformRelevantTrackers("tiktok")).toEqual(["tiktok_pixel"]);
    expect(platformRelevantTrackers("linkedin")).toEqual(["linkedin_insight"]);
    expect(platformRelevantTrackers("other")).toEqual([]);
  });
});

describe("tracking detection: platform-aware severity", () => {
  it("Meta spend + no Meta signature + NO tag manager → CRITICAL", () => {
    const { findings } = runChecks(fetchOk(NO_TRACKER_HTML), ctx({ platforms: ["meta"] }));
    const f = findings.find((x) => x.key === "tracking_absent_meta");
    expect(f).toBeDefined();
    expect(f?.severity).toBe("critical");
    expect(f?.confidence).toBe("high");
    expect(f?.title).toContain("was not detected");
  });

  it("GTM present + Meta signature absent → WARNING (needs verification, a tag can load at runtime)", () => {
    const { findings } = runChecks(fetchOk(GTM_HTML), ctx({ platforms: ["meta"] }));
    const f = findings.find((x) => x.key === "tracking_absent_meta");
    expect(f).toBeDefined();
    expect(f?.severity).toBe("warning");
    expect(f?.confidence).toBe("needs_verification");
    expect(f?.summary).toContain("tag can load at runtime");
  });

  it("Google Ads spend + neither GA4 nor Google Ads tag → CRITICAL", () => {
    const { findings } = runChecks(fetchOk(NO_TRACKER_HTML), ctx({ platforms: ["google"] }));
    const f = findings.find((x) => x.key === "tracking_absent_google");
    expect(f?.severity).toBe("critical");
  });

  it("Google spend + GA4 detected (other relevant tag) → no absence finding, INFO detection instead", () => {
    const { findings } = runChecks(fetchOk(GA4_HTML), ctx({ platforms: ["google"] }));
    expect(findings.find((x) => x.key === "tracking_absent_google")).toBeUndefined();
    expect(findings.find((x) => x.key === "tracking_detected")?.severity).toBe("info");
  });

  it("Meta spend + Meta Pixel detected → no absence finding", () => {
    const { findings } = runChecks(fetchOk(META_PIXEL_HTML), ctx({ platforms: ["meta"] }));
    expect(findings.find((x) => x.key === "tracking_absent_meta")).toBeUndefined();
  });

  it("irrelevant platforms (e.g. Microsoft Ads) never raise tracking-absence findings", () => {
    const { findings } = runChecks(fetchOk(NO_TRACKER_HTML), ctx({ platforms: ["other"] }));
    expect(findings.find((x) => x.key.startsWith("tracking_absent_"))).toBeUndefined();
  });

  it("no tracking finding is raised for an error page (page checks skipped)", () => {
    const error: PageFetchResult = {
      kind: "error",
      requestedUrl: "https://shop.example.com/lp",
      finalUrl: "https://shop.example.com/lp",
      errorCode: "DNS_ERROR",
      message: "dns",
      responseTimeMs: 100,
      redirects: [],
      httpStatus: null,
    };
    const { findings } = runChecks(error, ctx({ platforms: ["meta"] }));
    expect(findings.find((x) => x.key.startsWith("tracking_"))).toBeUndefined();
    expect(findings[0].severity).toBe("critical");
  });

  it("claim discipline: absence findings say 'not detected', never 'missing'", () => {
    const { findings } = runChecks(fetchOk(NO_TRACKER_HTML), ctx({ platforms: ["meta"] }));
    const f = findings.find((x) => x.key === "tracking_absent_meta");
    expect(f?.title).toContain("not detected");
    expect(f?.title.toLowerCase()).not.toContain("missing");
  });
});
