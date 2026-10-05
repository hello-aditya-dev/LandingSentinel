import { describe, it, expect } from "vitest";
import { inspectContent } from "@/lib/scanner/content";
import { runChecks } from "@/lib/scanner/findings";
import type { PageFetchResult, PageFetchSuccess, ScanContext, FetchErrorCode } from "@/lib/scanner/types";

/* ------------------------------------------------------------------ */
/* Fixture builders                                                    */
/* ------------------------------------------------------------------ */

function html(body: string, head = "<title>Fictional product — demo</title>") {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">${head}</head><body>${body}</body></html>`;
}

function longText() {
  return "<p>" + "Fictional product copy describing the product in adequate detail for the heuristic. ".repeat(8) + "</p>";
}

const HEALTHY_HTML = html(`<main><h1>Summer collection</h1>${longText()}<a href="/cart"><span>Shop now</span></a></main>`);
const NO_TITLE_HTML = html(longText(), "");
const SOFT_404_HTML = html(`<main><h1>Page not found</h1><p>Sorry, this page could not be found. ${longText()}</p></main>`);
const SOLD_OUT_HTML = html(`<main><h1>Trail jacket</h1>${longText()}<p>Currently unavailable in your size</p></main>`);
const MAINTENANCE_HTML = html(`<main><h1>Be back soon</h1><p>We are down for maintenance. ${longText()}</p></main>`);
const NOINDEX_HTML = html(`<main><h1>Summer collection</h1>${longText()}</main>`, '<title>Demo</title><meta name="robots" content="noindex, nofollow">');
const THIN_HTML = html(`<main><h1>Hi</h1><p>Buy</p></main>`);
const FORM_HTML = html(`<main><h1>Summer collection</h1>${longText()}<form action="/subscribe" method="post"><input name="email"><button type="submit">Subscribe</button></form></main>`);
const CTA_HTML = HEALTHY_HTML;
const NO_CTA_HTML = html(`<main><h1>Summer collection</h1>${longText()}</main>`);
const TRACKER_META_HTML = html(`<main><h1>LP</h1>${longText()}<a href="/cart">Shop now</a></main><script src="https://connect.facebook.net/en_US/fbevents.js"></script><script>fbq('init','1234567890123456');</script>`);

function fetchOk(html: string, url = "https://shop.example.com/lp", responseTimeMs = 120): PageFetchSuccess {
  return {
    kind: "ok",
    requestedUrl: url,
    finalUrl: url,
    httpStatus: 200,
    responseTimeMs,
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
    associatedSpendMinor: 250_000,
    currency: "GBP",
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Content inspection primitives                                       */
/* ------------------------------------------------------------------ */

describe("content inspection: primitives", () => {
  it("reads the title and meta description", () => {
    const c = inspectContent(html(longText(), "<title>Trail shoes</title><meta name=\"description\" content=\"Fictional\">"));
    expect(c.title).toBe("Trail shoes");
    expect(c.metaDescription).toBe("Fictional");
  });

  it("reports a missing title", () => {
    const c = inspectContent(NO_TITLE_HTML);
    expect(c.title).toBeNull();
  });

  it("detects a noindex meta rule", () => {
    expect(inspectContent(NOINDEX_HTML).noindex).toBe(true);
    expect(inspectContent(HEALTHY_HTML).noindex).toBe(false);
  });

  it("detects forms and CTAs", () => {
    const healthy = inspectContent(HEALTHY_HTML);
    expect(healthy.hasCta).toBe(true);
    expect(healthy.ctaPhrase).toBe("shop now");
    expect(inspectContent(FORM_HTML).hasForm).toBe(true);
    expect(inspectContent(HEALTHY_HTML).hasForm).toBe(false);
  });

  it("detects soft-404 wording", () => {
    expect(inspectContent(SOFT_404_HTML).soft404.match).toBe(true);
    expect(inspectContent(HEALTHY_HTML).soft404.match).toBe(false);
  });

  it("detects sold-out wording", () => {
    const c = inspectContent(SOLD_OUT_HTML);
    expect(c.soldOut.match).toBe(true);
    expect(c.soldOut.phrase).toBe("currently unavailable");
  });

  it("detects maintenance wording", () => {
    const c = inspectContent(MAINTENANCE_HTML);
    expect(c.maintenance.match).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Full check engine over fixture pages                                */
/* ------------------------------------------------------------------ */

describe("HTML/content findings via runChecks", () => {
  it("healthy HTML page with tracker + CTA produces no warning or critical findings", () => {
    const { findings } = runChecks(fetchOk(TRACKER_META_HTML), ctx({ platforms: ["meta"] }));
    const severities = findings.map((f) => f.severity);
    expect(severities).not.toContain("critical");
    expect(severities).not.toContain("warning");
  });

  it("real HTTP 404 → CRITICAL with confirmed confidence", () => {
    const result: PageFetchResult = { ...fetchOk(HEALTHY_HTML), httpStatus: 404 };
    const { findings } = runChecks(result, ctx());
    const f = findings.find((x) => x.key === "status_404");
    expect(f).toBeDefined();
    expect(f?.severity).toBe("critical");
    expect(f?.confidence).toBe("confirmed");
    expect(f?.evidence[0]).toMatchObject({ type: "HTTP_STATUS", value: "404" });
  });

  it("real HTTP 410 (gone) → CRITICAL", () => {
    const result: PageFetchResult = { ...fetchOk(HEALTHY_HTML), httpStatus: 410 };
    const { findings } = runChecks(result, ctx());
    expect(findings.find((x) => x.key === "status_410")?.severity).toBe("critical");
  });

  it("HTTP 403 → WARNING (scanner-blocked, not a visitor failure)", () => {
    const result: PageFetchResult = { ...fetchOk(HEALTHY_HTML), httpStatus: 403 };
    const { findings } = runChecks(result, ctx());
    const f = findings.find((x) => x.key === "status_403");
    expect(f?.severity).toBe("warning");
    expect(f?.explanation).toContain("normal visitors");
  });

  it("soft 404 (HTTP 200 + not-found wording) → WARNING heuristic", () => {
    const { findings } = runChecks(fetchOk(SOFT_404_HTML), ctx());
    const f = findings.find((x) => x.key === "soft_404");
    expect(f).toBeDefined();
    expect(f?.severity).toBe("warning");
    expect(f?.confidence).toBe("heuristic");
  });

  it("sold-out wording → WARNING", () => {
    const { findings } = runChecks(fetchOk(SOLD_OUT_HTML), ctx());
    expect(findings.find((x) => x.key === "sold_out_wording")?.severity).toBe("warning");
  });

  it("maintenance wording → WARNING", () => {
    const { findings } = runChecks(fetchOk(MAINTENANCE_HTML), ctx());
    expect(findings.find((x) => x.key === "maintenance_wording")?.severity).toBe("warning");
  });

  it("noindex → WARNING (sometimes intentional)", () => {
    const { findings } = runChecks(fetchOk(NOINDEX_HTML), ctx());
    const f = findings.find((x) => x.key === "noindex");
    expect(f?.severity).toBe("warning");
    expect(f?.explanation).toContain("sometimes intentional");
  });

  it("thin page (<200 visible characters) → WARNING heuristic", () => {
    const { findings } = runChecks(fetchOk(THIN_HTML), ctx());
    const f = findings.find((x) => x.key === "thin_content");
    expect(f?.severity).toBe("warning");
    expect(f?.confidence).toBe("heuristic");
  });

  it("missing title → WARNING", () => {
    const { findings } = runChecks(fetchOk(NO_TITLE_HTML), ctx());
    expect(findings.find((x) => x.key === "title_missing")?.severity).toBe("warning");
  });

  it("normal CTA present → no cta_absent finding", () => {
    const { findings } = runChecks(fetchOk(CTA_HTML), ctx());
    expect(findings.find((x) => x.key === "cta_absent")).toBeUndefined();
  });

  it("no CTA detected (when not expected) → INFO only, never a failure", () => {
    const { findings } = runChecks(fetchOk(NO_CTA_HTML), ctx());
    const f = findings.find((x) => x.key === "cta_absent");
    expect(f?.severity).toBe("info");
  });

  it("form present → no form findings; expected form absent → WARNING", () => {
    // Form present, no expectation:
    expect(runChecks(fetchOk(FORM_HTML), ctx()).findings.find((x) => x.key === "expected_form_missing")).toBeUndefined();
    // Form absent, but declared expected:
    const { findings } = runChecks(fetchOk(NO_CTA_HTML), ctx({ expectations: { expectedForm: true } }));
    const f = findings.find((x) => x.key === "expected_form_missing");
    expect(f?.severity).toBe("warning");
    expect(f?.confidence).toBe("confirmed");
  });

  it("slow server response → WARNING framed as scanner measurement, not Core Web Vitals", () => {
    const { findings } = runChecks(fetchOk(HEALTHY_HTML, undefined, 4_200), ctx());
    const f = findings.find((x) => x.key === "slow_response");
    expect(f?.severity).toBe("warning");
    expect(f?.explanation).toContain("not a Core Web Vitals measurement");
  });

  it("non-HTML content type → WARNING, page checks skipped", () => {
    const result: PageFetchResult = {
      ...fetchOk("{}", "https://shop.example.com/feed"),
      contentType: "application/json",
      html: "",
    };
    const { findings } = runChecks(result, ctx());
    expect(findings.find((x) => x.key === "non_html_response")?.severity).toBe("warning");
    expect(findings.find((x) => x.key === "title_missing")).toBeUndefined();
  });

  it("expected tracker declared but absent → WARNING needs_verification", () => {
    const { findings } = runChecks(fetchOk(NO_CTA_HTML), ctx({ expectations: { expectedTracker: "meta_pixel" } }));
    const f = findings.find((x) => x.key === "expected_tracker_meta_pixel");
    expect(f?.severity).toBe("warning");
    expect(f?.confidence).toBe("needs_verification");
  });

  it("expected text declared but absent → WARNING", () => {
    const { findings } = runChecks(fetchOk(NO_CTA_HTML), ctx({ expectations: { expectedText: "Summer collection" } }));
    expect(findings.find((x) => x.key === "expected_text_missing")).toBeUndefined();
    const { findings: missing } = runChecks(fetchOk(NO_CTA_HTML), ctx({ expectations: { expectedText: "Winter sale" } }));
    expect(missing.find((x) => x.key === "expected_text_missing")?.severity).toBe("warning");
  });
});

describe("network error findings (deterministic mapping)", () => {
  const cases: { code: FetchErrorCode; key: string }[] = [
    { code: "DNS_ERROR", key: "error_dns" },
    { code: "TLS_ERROR", key: "error_tls" },
    { code: "CONNECTION_FAILURE", key: "error_connection" },
    { code: "TIMEOUT", key: "error_timeout" },
    { code: "REDIRECT_LOOP", key: "error_redirect_loop" },
    { code: "TOO_MANY_REDIRECTS", key: "error_too_many_redirects" },
    { code: "BLOCKED_URL", key: "error_blocked" },
    { code: "SCAN_ERROR", key: "error_scan" },
  ];

  it.each(cases)("errorCode %s → finding %s with deterministic severity", ({ code, key }) => {
    const error: PageFetchResult = {
      kind: "error",
      requestedUrl: "https://shop.example.com/lp",
      finalUrl: "https://shop.example.com/lp",
      errorCode: code,
      message: "fixture error",
      responseTimeMs: 90,
      redirects: [],
      httpStatus: null,
    };
    const { findings } = runChecks(error, ctx());
    const f = findings.find((x) => x.key === key);
    expect(f).toBeDefined();
    // Every network failure is critical EXCEPT safety-blocked destinations,
    // which are deliberately informational (the page was never inspected).
    expect(f?.severity).toBe(code === "BLOCKED_URL" ? "info" : "critical");
    expect(f?.checkId).toBe("network");
  });

  it("spend is described as spend pointing at the destination, never as lost revenue", () => {
    const error: PageFetchResult = {
      kind: "error",
      requestedUrl: "https://shop.example.com/lp",
      finalUrl: null,
      errorCode: "CONNECTION_FAILURE",
      message: "refused",
      responseTimeMs: 30,
      redirects: [],
      httpStatus: null,
    };
    const { findings } = runChecks(error, ctx({ associatedSpendMinor: 250_000 }));
    expect(findings[0].summary).toContain("£2,500.00 of campaign spend points");
    expect(findings[0].summary.toLowerCase()).not.toContain("lost");
  });
});
