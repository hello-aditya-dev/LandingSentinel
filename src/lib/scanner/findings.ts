/**
 * Check engine: converts a page fetch result + inspection into structured,
 * evidence-backed findings.
 *
 * Severity model (deterministic — see docs/ARCHITECTURE.md):
 *   CRITICAL — confirmed 404/410/5xx, DNS/connect/TLS failure, timeout,
 *              redirect loop / limit, strong campaign-parameter loss,
 *              platform-relevant tracking absence with NO tag manager.
 *   WARNING  — 403/429 scanner access, unusual 4xx, hostname change to a
 *              different domain, tracking needs verification, sold-out /
 *              soft-404 / maintenance heuristics, slow response, noindex,
 *              missing title, thin content, unmet expectations.
 *   INFO     — detected tags, preserved attribution across redirects,
 *              CTA/form absence when not expected.
 *
 * Claim discipline: we write "not detected", never "missing", unless a
 * runtime check confirmed it. Associated spend is described as spend
 * associated with affected destinations — never as proven revenue loss.
 *
 * Every finding carries a stable `key` so its identity is comparable across
 * scans (incident history: first seen / last seen / resolved).
 */

import { PRODUCT } from "@/config/product";
import { inspectContent } from "./content";
import { detectTrackers, platformRelevantTrackers, trackerLabel } from "./tracking";
import { diffAttribution, sameSite } from "@/lib/urls/normalize";
import type {
  Confidence,
  EvidenceItem,
  FindingDraft,
  PageFetchResult,
  ScanContext,
  Severity,
  TrackerDetection,
  TrackerKey,
} from "./types";
import { CHECK_IDS } from "./types";

function fmtSpend(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(minor / 100);
}

/**
 * Run all checks for one destination and return findings.
 * `fetchResult` is injected: a live fetch, a fixture, or a test stub.
 */
export function runChecks(fetchResult: PageFetchResult, ctx: ScanContext): {
  findings: FindingDraft[];
  trackers: TrackerDetection[];
} {
  const findings: FindingDraft[] = [];

  if (fetchResult.kind === "error") {
    findings.push(...networkErrorFindings(fetchResult, ctx));
    return { findings, trackers: [] };
  }

  // Page-level checks (tracking, content, expectations) only apply to an
  // inspectable HTML page: a 2xx HTML response with body content. Error
  // pages must not produce "tracking not detected" findings.
  const contentType = fetchResult.contentType ?? "";
  const inspectable =
    fetchResult.httpStatus >= 200 &&
    fetchResult.httpStatus < 300 &&
    fetchResult.html.length > 0 &&
    (/text\/html|application\/xhtml/i.test(contentType) || contentType === "");

  const trackers = inspectable ? detectTrackers(fetchResult.html) : [];
  const content = inspectable ? inspectContent(fetchResult.html) : null;

  findings.push(...networkStatusFindings(fetchResult, ctx));
  findings.push(...redirectFindings(fetchResult, ctx));
  findings.push(...attributionFindings(fetchResult, ctx));
  if (inspectable && content) {
    findings.push(...trackingFindings(ctx, trackers));
    findings.push(...contentFindings(fetchResult, ctx, content));
    findings.push(...expectationFindings(fetchResult, ctx, content, trackers));
  }
  findings.push(...performanceFindings(fetchResult, ctx));

  return { findings, trackers };
}

/* -------------------------------------------------------------- */
/* Network errors — DNS, TLS, connection, timeout, blocked, loops */
/* -------------------------------------------------------------- */

function networkErrorFindings(fetch: Extract<PageFetchResult, { kind: "error" }>, ctx: ScanContext): FindingDraft[] {
  const spendText = fmtSpend(ctx.associatedSpendMinor, ctx.currency);
  const evidence: EvidenceItem[] = [
    { type: "FINAL_URL", label: "Requested URL", value: fetch.requestedUrl },
  ];

  const critical = (key: string, title: string, message: string, explanation: string, recommendation: string, extra: EvidenceItem[] = []): FindingDraft => ({
    key,
    checkId: CHECK_IDS.network,
    severity: "critical",
    confidence: "confirmed",
    title,
    summary: message,
    explanation,
    recommendation,
    evidence: [...evidence, ...extra],
    metadata: { errorCode: fetch.errorCode },
  });

  switch (fetch.errorCode) {
    case "DNS_ERROR":
      return [
        critical(
          "error_dns",
          "Destination hostname could not be resolved",
          `The scanner could not resolve this hostname (DNS). ${spendText} of campaign spend points here.`,
          "The hostname in the imported URL did not resolve to any address. The destination may have been retired, or the campaign rows contain a typo in the domain.",
          "Check the hostname in the imported campaign rows. If the domain was retired, replace the campaign destination before launch.",
          [{ type: "DNS_ERROR", label: "DNS result", value: "No address found", meta: { detail: fetch.detail ?? undefined } }]
        ),
      ];
    case "TLS_ERROR":
      return [
        critical(
          "error_tls",
          "TLS connection failed",
          `The scanner could not establish a TLS connection to this destination. ${spendText} of campaign spend points here.`,
          "The request failed during the TLS handshake. Common causes are an expired, self-signed, or domain-mismatched certificate.",
          "Inspect the certificate on this destination (for example with your browser's security panel) and renew or correct it before launch.",
          [{ type: "TLS_ERROR", label: "TLS failure", value: fetch.detail ?? fetch.message }]
        ),
      ];
    case "CONNECTION_FAILURE":
      return [
        critical(
          "error_connection",
          "The scanner could not connect to this URL",
          `The connection could not be established. ${spendText} of campaign spend points here.`,
          "The server refused the connection or the network reported the host as unreachable. The destination is not serving traffic to the scanner.",
          "Verify the destination in a normal browser. If it fails there too, restore the service or replace the campaign destination before launch.",
          [{ type: "CONNECTION_ERROR", label: "Connection failure", value: fetch.message }]
        ),
      ];
    case "TIMEOUT":
      return [
        critical(
          "error_timeout",
          "The scanner stopped this request after the timeout",
          `The request did not complete within ${Math.round(PRODUCT.scanner.timeoutMs / 1000)} seconds. ${spendText} of campaign spend points here.`,
          "The server accepted the connection but did not return a response in time. This is measured from the scanner; a normal browser may behave differently if the slowness is intermittent.",
          "Verify response time from a normal browser and your monitoring. A destination that regularly exceeds this time will lose paid clicks.",
          [
            {
              type: "TIMEOUT",
              label: "Timeout",
              value: `${PRODUCT.scanner.timeoutMs} ms`,
              meta: { elapsedMs: fetch.responseTimeMs },
            },
          ]
        ),
      ];
    case "BLOCKED_URL":
      return [
        {
          key: "error_blocked",
          checkId: CHECK_IDS.network,
          severity: "info",
          confidence: "confirmed",
          title: "Destination blocked by scanner safety rules",
          summary: "The scanner refused to request this destination for safety. It was not inspected.",
          explanation:
            "The destination resolves to an address the scanner treats as internal or unsafe (for example loopback, private, or link-local ranges). LandingSentinel never requests such destinations.",
          recommendation:
            "If you expected this destination to be a public page, check the imported URL for typos. Internal addresses cannot be inspected by the scanner.",
          evidence: [
            { type: "URL_BLOCKED", label: "Blocked destination", value: fetch.requestedUrl, meta: { reason: fetch.detail ?? fetch.message } },
          ],
          metadata: { errorCode: fetch.errorCode },
        },
      ];
    case "REDIRECT_LOOP":
      return [
        critical(
          "error_redirect_loop",
          "This destination redirects in a loop",
          `The scanner stopped because the redirect chain returned to an earlier URL. ${spendText} of campaign spend points here.`,
          "Each redirect in the chain was followed manually until a URL repeated. Browsers will behave the same way and show an error page.",
          "Fix the redirect rules so the chain terminates on a real page before launch.",
          [
            { type: "REDIRECT_LOOP", label: "Loop detected after", value: `${fetch.redirects.length} redirects` },
            ...fetch.redirects.map((h) => hopEvidence(h)),
          ]
        ),
      ];
    case "TOO_MANY_REDIRECTS":
      return [
        critical(
          "error_too_many_redirects",
          "Redirect limit exceeded",
          `The scanner stopped after ${PRODUCT.scanner.maxRedirects} redirects. ${spendText} of campaign spend points here.`,
          "The destination kept redirecting beyond the scanner's redirect budget. Long chains add delay and can strip parameters before the visitor reaches a page.",
          "Shorten the redirect chain so visitors land directly on the final page.",
          fetch.redirects.map((h) => hopEvidence(h)),
        ),
      ];
    default:
      return [
        critical(
          "error_scan",
          "The scanner could not complete this request",
          `Reason: ${fetch.message}`,
          "The request failed before a response could be inspected. The destination was not verified as working.",
          "Retry the scan. If this repeats, verify the destination in a normal browser.",
          [{ type: "CONNECTION_ERROR", label: "Request failure", value: fetch.message, meta: { detail: fetch.detail ?? undefined } }]
        ),
      ];
  }
}

function hopEvidence(h: { sequence: number; fromUrl: string; toUrl: string; statusCode: number; durationMs: number | null }): EvidenceItem {
  return {
    type: "REDIRECT_HOP",
    label: `Redirect ${h.sequence + 1}`,
    value: `${h.fromUrl} → ${h.toUrl}`,
    meta: { statusCode: h.statusCode, durationMs: h.durationMs },
  };
}

/* -------------------------------------------------------------- */
/* HTTP status findings                                           */
/* -------------------------------------------------------------- */

function networkStatusFindings(fetch: Extract<PageFetchResult, { kind: "ok" }>, ctx: ScanContext): FindingDraft[] {
  const spendText = fmtSpend(ctx.associatedSpendMinor, ctx.currency);
  const status = fetch.httpStatus;
  const baseEvidence: EvidenceItem[] = [
    { type: "HTTP_STATUS", label: "HTTP status", value: String(status) },
    { type: "FINAL_URL", label: "Final URL", value: fetch.finalUrl },
    { type: "RESPONSE_TIME", label: "Response time", value: `${fetch.responseTimeMs} ms` },
  ];

  if (status === 404 || status === 410) {
    return [
      {
        key: `status_${status}`,
        checkId: CHECK_IDS.network,
        severity: "critical",
        confidence: "confirmed",
        title: `Destination returned HTTP ${status}`,
        summary: `${spendText} of campaign spend points at a destination the server reports as ${status === 404 ? "not found" : "gone"}.`,
        explanation:
          status === 404
            ? "The server responded that this page does not exist. Visitors from these campaigns receive an error page."
            : "The server responded that this page has been permanently removed. Visitors from these campaigns receive an error page.",
        recommendation: "Replace the campaign destination or restore the landing page before launch.",
        evidence: baseEvidence,
      },
    ];
  }

  if (status >= 500) {
    return [
      {
        key: `status_${status}`,
        checkId: CHECK_IDS.network,
        severity: "critical",
        confidence: "confirmed",
        title: `Destination returned HTTP ${status}`,
        summary: `The server returned a ${status} server error. ${spendText} of campaign spend points here.`,
        explanation: "The origin server failed to produce the page. Visitors from these campaigns receive an error page while the error persists.",
        recommendation: "Check the origin server or hosting for this destination before launch, then re-scan to confirm it returns a valid page.",
        evidence: baseEvidence,
      },
    ];
  }

  if (status === 403 || status === 429) {
    return [
      {
        key: `status_${status}`,
        checkId: CHECK_IDS.network,
        severity: "warning",
        confidence: "confirmed",
        title: `The scanner received HTTP ${status}`,
        summary: `${spendText} of campaign spend points here. The page was not fully inspected.`,
        explanation:
          "The site can block automated requests. This result does not show that normal visitors cannot access the page. Verify the URL in a normal browser before treating it as a failure.",
        recommendation:
          "Open the destination in a normal browser. If it loads, the finding reflects scanner access only — you can allow the scanner user agent on your site.",
        evidence: baseEvidence,
      },
    ];
  }

  if (status >= 400) {
    return [
      {
        key: `status_${status}`,
        checkId: CHECK_IDS.network,
        severity: "warning",
        confidence: "confirmed",
        title: `The scanner received HTTP ${status}`,
        summary: `${spendText} of campaign spend points here. An unexpected client error was returned.`,
        explanation: "The server returned an error status that is unusual for a campaign destination. The page content could not be inspected.",
        recommendation: "Verify the destination in a normal browser before launch.",
        evidence: baseEvidence,
      },
    ];
  }

  const contentType = fetch.contentType ?? "";
  const isHtml = contentType === "" || /text\/html|application\/xhtml/i.test(contentType);
  if (!isHtml) {
    return [
      {
        key: "non_html_response",
        checkId: CHECK_IDS.network,
        severity: "warning",
        confidence: "confirmed",
        title: "Destination did not return HTML",
        summary: `The response content type was "${contentType || "unknown"}". ${spendText} of campaign spend points here.`,
        explanation:
          "The scanner inspects HTML landing pages. This destination returned another content type (for example a PDF or JSON feed), so page-level checks were skipped.",
        recommendation: "Confirm whether this destination is intended. Campaign landing pages are normally HTML documents.",
        evidence: [
          ...baseEvidence,
          { type: "CONTENT_TYPE", label: "Content type", value: contentType || "unknown" },
        ],
      },
    ];
  }
  return [];
}

/* -------------------------------------------------------------- */
/* Redirect findings                                              */
/* -------------------------------------------------------------- */

function redirectFindings(fetch: Extract<PageFetchResult, { kind: "ok" }>, ctx: ScanContext): FindingDraft[] {
  const findings: FindingDraft[] = [];
  if (fetch.redirects.length === 0) return findings;

  const hops = fetch.redirects.map(hopEvidence);
  const spendText = fmtSpend(ctx.associatedSpendMinor, ctx.currency);

  try {
    const from = new URL(fetch.requestedUrl);
    const to = new URL(fetch.finalUrl);
    const hostChanged = from.hostname !== to.hostname;
    if (hostChanged) {
      const differentDomain = !sameSite(from.hostname, to.hostname);
      findings.push({
        key: differentDomain ? "hostname_change_cross_domain" : "hostname_change_same_site",
        checkId: CHECK_IDS.redirects,
        severity: differentDomain ? "warning" : "info",
        confidence: "confirmed",
        title: differentDomain ? "Final destination is on a different domain" : "Hostname changed after redirect",
        summary: `The imported destination redirects to ${to.hostname}. ${spendText} of campaign spend points at the imported URL.`,
        explanation: differentDomain
          ? "Visitors still reach a page, but on a domain other than the one in the campaign rows. This can affect measurement set up for the original domain, and any server-side rules tied to it."
          : "The page is served from a different hostname of the same site (for example www and non-www forms). This is usually intentional.",
        recommendation: differentDomain
          ? "Confirm the cross-domain redirect is intentional and that measurement follows the visitor across domains."
          : undefined,
        evidence: [...hops, { type: "FINAL_URL", label: "Final URL", value: fetch.finalUrl }],
      });
    }
  } catch {
    /* malformed URLs are handled elsewhere */
  }

  return findings;
}

/* -------------------------------------------------------------- */
/* Attribution / parameter survival                               */
/* -------------------------------------------------------------- */

const PRIMARY_UTM = ["utm_campaign", "utm_source", "utm_medium"];
const CLICK_IDS = ["gclid", "gbraid", "wbraid", "fbclid", "msclkid", "ttclid", "li_fat_id"];

function attributionFindings(fetch: Extract<PageFetchResult, { kind: "ok" }>, ctx: ScanContext): FindingDraft[] {
  const findings: FindingDraft[] = [];
  if (fetch.redirects.length === 0) return findings;

  let diffs;
  try {
    diffs = diffAttribution(fetch.requestedUrl, fetch.finalUrl);
  } catch {
    return findings;
  }

  const removedPrimary = diffs.filter((d) => d.status === "removed" && PRIMARY_UTM.includes(d.param));
  const removedSecondary = diffs.filter((d) => d.status === "removed" && (d.param === "utm_content" || d.param === "utm_term"));
  const removedClickIds = diffs.filter((d) => d.status === "removed" && CLICK_IDS.includes(d.param));
  const changed = diffs.filter((d) => d.status === "changed");
  const preserved = diffs.filter((d) => d.status === "preserved");

  const spendText = fmtSpend(ctx.associatedSpendMinor, ctx.currency);
  const hopList = fetch.redirects.map(hopEvidence);

  if (removedPrimary.length > 0) {
    const param = removedPrimary[0];
    findings.push({
      key: "param_removed_primary",
      checkId: CHECK_IDS.attribution,
      severity: "critical",
      confidence: "confirmed",
      title: "Campaign parameter removed after redirect",
      summary: `The imported destination contained ${param.param}=${param.originalValue}. The final URL does not contain this parameter. ${spendText} of campaign spend points here.`,
      explanation:
        "The redirect chain drops a primary campaign parameter. Analytics that read UTM parameters from the landing URL will not attribute these visits to the imported campaign values.",
      recommendation:
        "Verify whether attribution is preserved through another mechanism (for example server-side tagging). If it is not, update the redirect or the campaign destination before launch.",
      evidence: [
        {
          type: "PARAMETER_REMOVED",
          label: `Removed parameter: ${param.param}`,
          value: `${param.param}=${param.originalValue ?? ""}`,
          meta: { finalUrl: fetch.finalUrl, redirects: fetch.redirects.length },
        },
        ...hopList,
        { type: "FINAL_URL", label: "Final URL", value: fetch.finalUrl },
      ],
      metadata: { removedParams: removedPrimary.map((d) => d.param) },
    });
  }

  if (removedSecondary.length > 0) {
    findings.push({
      key: "param_removed_secondary",
      checkId: CHECK_IDS.attribution,
      severity: "warning",
      confidence: "confirmed",
      title: "Secondary campaign parameter removed after redirect",
      summary: `${removedSecondary.map((d) => d.param).join(", ")} ${removedSecondary.length === 1 ? "was" : "were"} present in the imported URL and absent from the final URL.`,
      explanation:
        "These parameters support content- and term-level reporting. Their removal limits ad-level or keyword-level analysis in analytics that reads them from the URL.",
      recommendation: "Verify whether your analytics setup preserves these values by another method.",
      evidence: removedSecondary.map((d) => ({
        type: "PARAMETER_REMOVED" as const,
        label: `Removed parameter: ${d.param}`,
        value: `${d.param}=${d.originalValue ?? ""}`,
        meta: { finalUrl: fetch.finalUrl },
      })),
    });
  }

  if (removedClickIds.length > 0) {
    findings.push({
      key: "param_removed_click_id",
      checkId: CHECK_IDS.attribution,
      severity: "warning",
      confidence: "needs_verification",
      title: "Click ID removed after redirect",
      summary: `${removedClickIds.map((d) => d.param).join(", ")} ${removedClickIds.length === 1 ? "was" : "were"} in the imported URL and absent from the final URL.`,
      explanation:
        "Click IDs normally travel in the landing URL and are captured for platform-side conversion measurement. A redirect that strips them can still be correct if the platform redirects them onward itself or measurement is server-side.",
      recommendation:
        "Verify with your tag debugger or the platform's conversion diagnostics whether click IDs are captured for this destination.",
      evidence: removedClickIds.map((d) => ({
        type: "PARAMETER_REMOVED" as const,
        label: `Removed parameter: ${d.param}`,
        value: `${d.param}=${d.originalValue ?? ""}`,
        meta: { finalUrl: fetch.finalUrl },
      })),
    });
  }

  for (const change of changed) {
    findings.push({
      key: `param_changed_${change.param}`,
      checkId: CHECK_IDS.attribution,
      severity: "warning",
      confidence: "confirmed",
      title: "Campaign parameter changed after redirect",
      summary: `${change.param} was "${change.originalValue}" in the imported URL and "${change.finalValue}" in the final URL.`,
      explanation: "A redirect rewrote the parameter value. Analytics will attribute these visits to the new value, not the value in your campaign rows.",
      recommendation: "Check the redirect rules for this destination if the original value is the intended one.",
      evidence: [
        {
          type: "PARAMETER_CHANGED",
          label: `Changed parameter: ${change.param}`,
          value: `${change.originalValue} → ${change.finalValue}`,
        },
        ...hopList,
      ],
    });
  }

  if (findings.length === 0 && preserved.length > 0) {
    findings.push({
      key: "attribution_preserved",
      checkId: CHECK_IDS.attribution,
      severity: "info",
      confidence: "confirmed",
      title: "Redirect occurred, attribution parameters preserved",
      summary: `The destination redirected ${fetch.redirects.length} ${fetch.redirects.length === 1 ? "time" : "times"} and all ${preserved.length} campaign parameters survived to the final URL.`,
      explanation:
        "The final URL still contains the imported campaign parameters, so URL-based analytics attribution is not interrupted by the redirect.",
      evidence: [
        ...preserved.map((p) => ({
          type: "PARAMETER_PRESERVED" as const,
          label: `Preserved: ${p.param}`,
          value: `${p.param}=${p.originalValue ?? ""}`,
        })),
        ...hopList,
      ],
    });
  }

  return findings;
}

/* -------------------------------------------------------------- */
/* Tracking findings (platform-aware)                             */
/* -------------------------------------------------------------- */

function trackingEvidenceLine(trackers: TrackerDetection[], key: TrackerKey): EvidenceItem {
  const t = trackers.find((tr) => tr.key === key);
  return {
    type: t?.detected ? "TRACKER_SIGNATURE" : "TRACKER_ABSENT",
    label: trackerLabel(key),
    value: t?.detected ? `Detected — signature "${t.signatureId}"` : "Not detected in retrieved HTML",
    snippet: t?.excerpt ?? undefined,
  };
}

function trackingFindings(ctx: ScanContext, trackers: TrackerDetection[]): FindingDraft[] {
  const findings: FindingDraft[] = [];
  const gtmPresent = trackers.find((t) => t.key === "gtm")?.detected ?? false;
  const spendText = fmtSpend(ctx.associatedSpendMinor, ctx.currency);

  const platforms = [...new Set(ctx.platforms)];
  for (const platform of platforms) {
    const relevant = platformRelevantTrackers(platform);
    if (relevant.length === 0) continue;

    const anyDetected = relevant.some((key) => trackers.find((t) => t.key === key)?.detected);
    if (anyDetected) continue;

    const platformName: Record<string, string> = {
      meta: "Meta",
      google: "Google Ads",
      tiktok: "TikTok",
      linkedin: "LinkedIn",
    };
    const platformLabel = platformName[platform] ?? platform;
    const relevantLabels = relevant.map((k) => trackerLabel(k)).join(" / ");

    const baseEvidence: EvidenceItem[] = [
      { type: "TRACKER_ABSENT", label: `Imported platform: ${platformLabel}`, value: `${platformLabel} campaign spend is associated with this destination` },
      ...relevant.map((k) => trackingEvidenceLine(trackers, k)),
      trackingEvidenceLine(trackers, "gtm"),
    ];

    if (!gtmPresent) {
      findings.push({
        key: `tracking_absent_${platform}`,
        checkId: CHECK_IDS.tracking,
        severity: "critical",
        confidence: "high",
        title: `${platformLabel} tracking was not detected`,
        summary: `${spendText} of ${platformLabel} campaign spend points at this destination, and no ${platformLabel} tracking signature or tag manager was detected in the retrieved HTML.`,
        explanation: `Imported platform: ${platformLabel}. ${relevantLabels}: not detected. Google Tag Manager: not detected. Static HTML scanning cannot prove what happens after JavaScript runs, but with no direct signature and no tag manager present, nothing in the retrieved page would load a ${platformLabel} tag.`,
        recommendation: `Open the rendered page with a tag debugger (for example ${platformLabel === "Meta" ? "Meta Pixel Helper" : "the platform's tag diagnostics"}) and confirm whether tracking loads at runtime. If it does not, install tracking before spending against this destination.`,
        evidence: baseEvidence,
        metadata: { platform, relevantTrackers: relevant },
      });
    } else {
      findings.push({
        key: `tracking_absent_${platform}`,
        checkId: CHECK_IDS.tracking,
        severity: "warning",
        confidence: "needs_verification",
        title: `${relevantLabels} was not detected directly`,
        summary: `${spendText} of ${platformLabel} campaign spend points here. Google Tag Manager is present; a tag can load at runtime.`,
        explanation: `Google Tag Manager is detected in the retrieved HTML. A ${relevantLabels} can load through GTM after the page runs. This static scan cannot confirm that behavior.`,
        recommendation: `Open the rendered page with a tag debugger and verify the ${relevantLabels} fires before you treat this as a confirmed tracking failure.`,
        evidence: baseEvidence,
        metadata: { platform, relevantTrackers: relevant, gtmPresent: true },
      });
    }
  }

  const detected = trackers.filter((t) => t.detected);
  if (detected.length > 0) {
    findings.push({
      key: "tracking_detected",
      checkId: CHECK_IDS.tracking,
      severity: "info",
      confidence: "confirmed",
      title: "Tracking signatures detected",
      summary: `${detected.length} tracking ${detected.length === 1 ? "signature was" : "signatures were"} detected in the retrieved HTML.`,
      explanation:
        "Static detection proves the signature exists in the served HTML. It does not confirm that tags fire at runtime or that they are configured correctly.",
      evidence: detected.map((t) => ({
        type: "TRACKER_SIGNATURE",
        label: trackerLabel(t.key),
        value: `Detected — signature "${t.signatureId}"`,
        snippet: t.excerpt ?? undefined,
      })),
    });
  }

  return findings;
}

/* -------------------------------------------------------------- */
/* Content findings                                               */
/* -------------------------------------------------------------- */

function contentFindings(
  fetch: Extract<PageFetchResult, { kind: "ok" }>,
  ctx: ScanContext,
  content: ReturnType<typeof inspectContent>
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  const spendText = fmtSpend(ctx.associatedSpendMinor, ctx.currency);

  if (!content.title) {
    findings.push({
      key: "title_missing",
      checkId: CHECK_IDS.content,
      severity: "warning",
      confidence: "confirmed",
      title: "HTML title is missing or empty",
      summary: `The retrieved page has no <title> content. ${spendText} of campaign spend points here.`,
      explanation:
        "The title element is empty or absent. Titles are used by browsers, search results, and some link previews. An empty title is a content defect on a paid landing page.",
      recommendation: "Add a descriptive <title> to this page before launch.",
      evidence: [
        { type: "TITLE_TEXT", label: "Page title", value: "(empty)" },
        { type: "HTML_SNIPPET", label: "HTML inspected", value: `${fetch.html.length} characters` },
      ],
    });
  }

  if (content.noindex) {
    findings.push({
      key: "noindex",
      checkId: CHECK_IDS.content,
      severity: "warning",
      confidence: "confirmed",
      title: "Page is marked noindex",
      summary: `The page tells search engines not to index it. ${spendText} of campaign spend points here.`,
      explanation:
        "A robots meta rule contains noindex. This does not block paid traffic, but it keeps the page out of search results and some link previews. On a campaign landing page this is sometimes intentional.",
      recommendation: "Confirm the noindex rule is intentional for this campaign page.",
      evidence: [{ type: "META_ROBOTS", label: "Meta robots", value: "noindex" }],
    });
  }

  if (content.maintenance.match) {
    findings.push({
      key: "maintenance_wording",
      checkId: CHECK_IDS.content,
      severity: "warning",
      confidence: "high",
      title: "Page shows maintenance or unavailable wording",
      summary: `Matched text: "${content.maintenance.evidence ?? content.maintenance.phrase}". ${spendText} of campaign spend points here.`,
      explanation:
        "The page returned HTTP 200 but its text matches an unavailable/maintenance pattern. Paid visitors would see this wording instead of the intended page.",
      recommendation: "Restore the intended page content before launch, then re-scan.",
      evidence: [
        { type: "MATCHED_TEXT", label: "Matched text", snippet: content.maintenance.evidence ?? undefined, value: content.maintenance.phrase ?? undefined },
        { type: "HTTP_STATUS", label: "HTTP status", value: String(fetch.httpStatus) },
      ],
    });
  }

  if (content.soft404.match) {
    findings.push({
      key: "soft_404",
      checkId: CHECK_IDS.content,
      severity: "warning",
      confidence: "heuristic",
      title: "Possible soft 404",
      summary: `The server returned HTTP 200, but the page text matches not-found wording. ${spendText} of campaign spend points here.`,
      explanation:
        "This is a heuristic finding. The page returned HTTP 200 while its title or prominent text contains not-found language. Verify in a browser before treating it as a confirmed failure.",
      recommendation: "Open the destination in a normal browser and confirm what visitors see.",
      evidence: [
        { type: "HTTP_STATUS", label: "HTTP status", value: String(fetch.httpStatus) },
        { type: "MATCHED_TEXT", label: "Signals", value: content.soft404.signals.join("; ").slice(0, 300), snippet: content.soft404.evidence ?? undefined },
      ],
    });
  }

  if (content.soldOut.match) {
    findings.push({
      key: "sold_out_wording",
      checkId: CHECK_IDS.content,
      severity: "warning",
      confidence: "high",
      title: "Sold-out or unavailable product wording detected",
      summary: `Matched text: "${content.soldOut.evidence ?? content.soldOut.phrase}". ${spendText} of campaign spend points here.`,
      explanation:
        "The page text indicates the product is unavailable. The scanner reports page wording only — it does not know your inventory state.",
      recommendation: "Confirm stock levels and pause or redirect campaigns if the product is unavailable.",
      evidence: [
        { type: "MATCHED_TEXT", label: "Matched text", snippet: content.soldOut.evidence ?? undefined, value: content.soldOut.phrase ?? undefined },
        { type: "HTTP_STATUS", label: "HTTP status", value: String(fetch.httpStatus) },
      ],
    });
  }

  if (content.bodyTextLength < 200 && !content.soft404.match) {
    findings.push({
      key: "thin_content",
      checkId: CHECK_IDS.content,
      severity: "warning",
      confidence: "heuristic",
      title: "Extremely thin page content",
      summary: `The visible body text is ${content.bodyTextLength} characters. ${spendText} of campaign spend points here.`,
      explanation:
        "The retrieved HTML contains very little visible text. The page may be broken, may require JavaScript to render its content, or may genuinely be minimal. This is a heuristic finding.",
      recommendation: "Verify the rendered page in a browser. If content renders via JavaScript, treat this finding as informational.",
      evidence: [
        { type: "HTML_SNIPPET", label: "Body text length", value: `${content.bodyTextLength} characters` },
        { type: "HTML_SNIPPET", label: "HTML size inspected", value: `${fetch.bytesInspected} bytes` },
      ],
    });
  }

  if (!content.hasCta) {
    findings.push({
      key: "cta_absent",
      checkId: CHECK_IDS.content,
      severity: "info",
      confidence: "heuristic",
      title: "No conventional call-to-action detected",
      summary: "No button or prominent link matched common CTA wording in the retrieved HTML.",
      explanation:
        "Some valid landing pages use unconventional wording or image-based CTAs, or require JavaScript to render. Absence of a detected CTA is not a failure by itself.",
      evidence: [{ type: "CTA_CHECK", label: "CTA scan", value: "No match in buttons or prominent links" }],
    });
  }

  if (!content.metaDescription) {
    findings.push({
      key: "meta_description_missing",
      checkId: CHECK_IDS.content,
      severity: "info",
      confidence: "confirmed",
      title: "Meta description is missing",
      summary: "The page has no meta description.",
      explanation: "Minor SEO metadata issue. Not a landing-page failure.",
      evidence: [{ type: "HTML_SNIPPET", label: "Meta description", value: "(absent)" }],
    });
  }

  return findings;
}

/* -------------------------------------------------------------- */
/* Performance findings                                           */
/* -------------------------------------------------------------- */

function performanceFindings(fetch: Extract<PageFetchResult, { kind: "ok" }>, ctx: ScanContext): FindingDraft[] {
  const threshold = PRODUCT.scanner.slowResponseMs;
  if (fetch.responseTimeMs < threshold) return [];
  const spendText = fmtSpend(ctx.associatedSpendMinor, ctx.currency);
  return [
    {
      key: "slow_response",
      checkId: CHECK_IDS.performance,
      severity: "warning",
      confidence: "confirmed",
      title: "Slow server response duration",
      summary: `Server response duration: ${(fetch.responseTimeMs / 1000).toFixed(1)} s. ${spendText} of campaign spend points here.`,
      explanation: `Measured from the scanner region. This is not a Core Web Vitals measurement and not a Lighthouse result. The threshold for this finding is ${(threshold / 1000).toFixed(0)} s.`,
      recommendation: "Check origin performance (hosting, caching, backend) before launch.",
      evidence: [
        { type: "RESPONSE_TIME", label: "Server response duration", value: `${fetch.responseTimeMs} ms`, meta: { thresholdMs: threshold } },
        { type: "HTTP_STATUS", label: "HTTP status", value: String(fetch.httpStatus) },
      ],
    },
  ];
}

/* -------------------------------------------------------------- */
/* Expectation findings (user-declared expected state)            */
/* -------------------------------------------------------------- */

function expectationFindings(
  fetch: Extract<PageFetchResult, { kind: "ok" }>,
  ctx: ScanContext,
  content: ReturnType<typeof inspectContent>,
  trackers: TrackerDetection[]
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  const exp = ctx.expectations;
  if (!exp) return findings;
  const spendText = fmtSpend(ctx.associatedSpendMinor, ctx.currency);

  if (exp.expectedForm === true && !content.hasForm) {
    findings.push({
      key: "expected_form_missing",
      checkId: CHECK_IDS.content,
      severity: "warning",
      confidence: "confirmed",
      title: "Expected form not detected",
      summary: `You declared that this destination should contain a form. No <form> element or known form embed was detected. ${spendText} of campaign spend points here.`,
      explanation:
        "The expected-state check compares your declaration with the retrieved HTML. JavaScript-rendered forms are not visible to this static scan.",
      recommendation: "Verify the rendered page in a browser before treating this as a confirmed failure.",
      evidence: [{ type: "FORM_CHECK", label: "Form scan", value: "No <form> or known form embed detected" }],
    });
  }

  if (exp.expectedTracker) {
    const t = trackers.find((tr) => tr.key === exp.expectedTracker);
    if (t && !t.detected) {
      findings.push({
        key: `expected_tracker_${exp.expectedTracker}`,
        checkId: CHECK_IDS.tracking,
        severity: "warning",
        confidence: "needs_verification",
        title: `Expected tracker not detected: ${trackerLabel(exp.expectedTracker)}`,
        summary: `You declared that ${trackerLabel(exp.expectedTracker)} should be present. It was not detected in the retrieved HTML.`,
        explanation:
          "The expected-state check compares your declaration with static signatures. A tag can load at runtime through a tag manager.",
        recommendation: "Verify with a tag debugger on the rendered page.",
        evidence: [
          { type: "TRACKER_ABSENT", label: `Expected: ${trackerLabel(exp.expectedTracker)}`, value: "Not detected in retrieved HTML" },
          trackingEvidenceLine(trackers, "gtm"),
        ],
      });
    }
  }

  if (exp.expectedText && fetch.html.length > 0) {
    const present = fetch.html.toLowerCase().includes(exp.expectedText.toLowerCase());
    if (!present) {
      findings.push({
        key: "expected_text_missing",
        checkId: CHECK_IDS.content,
        severity: "warning",
        confidence: "confirmed",
        title: "Expected text not found",
        summary: `You declared this destination should contain the text "${exp.expectedText}". It was not found in the retrieved HTML.`,
        explanation: "The expected-state check searches the retrieved HTML for your declared text.",
        recommendation: "Confirm the page still contains the intended copy.",
        evidence: [{ type: "MATCHED_TEXT", label: "Expected text", value: exp.expectedText }],
      });
    }
  }

  if (exp.expectedHostname) {
    try {
      const final = new URL(fetch.finalUrl);
      if (final.hostname.toLowerCase() !== exp.expectedHostname.toLowerCase()) {
        findings.push({
          key: "expected_hostname_mismatch",
          checkId: CHECK_IDS.redirects,
          severity: "warning",
          confidence: "confirmed",
          title: "Final hostname differs from the expected hostname",
          summary: `You declared the final destination should be "${exp.expectedHostname}". The scan finished on "${final.hostname}".`,
          explanation: "The expected-state check compares your declared hostname with the final URL after redirects.",
          recommendation: "Check the redirect rules if the declared hostname is the intended one.",
          evidence: [{ type: "FINAL_URL", label: "Final URL", value: fetch.finalUrl }],
        });
      }
    } catch {
      /* skip malformed */
    }
  }

  return findings;
}

/* -------------------------------------------------------------- */
/* Score + preflight (deterministic)                              */
/* -------------------------------------------------------------- */

export function destinationScore(findings: { severity: Severity }[]): number {
  let score = 100;
  for (const f of findings) {
    if (f.severity === "critical") score -= 40;
    else if (f.severity === "warning") score -= 12;
    // Info findings do not reduce the score (documented rule).
  }
  return Math.max(0, score);
}

export function preflightStatus(findings: { severity: Severity }[]): "DO_NOT_LAUNCH" | "REVIEW_BEFORE_LAUNCH" | "LAUNCH_READY" {
  if (findings.some((f) => f.severity === "critical")) return "DO_NOT_LAUNCH";
  if (findings.some((f) => f.severity === "warning")) return "REVIEW_BEFORE_LAUNCH";
  return "LAUNCH_READY";
}

export type { Confidence, FindingDraft };
