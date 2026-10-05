/**
 * Scanner type contracts.
 *
 * The scanner is a pure, testable subsystem: `scanDestination()` accepts an
 * injectable page-fetcher so tests never require live internet requests.
 * All network inspection happens server-side only.
 */

export type Severity = "critical" | "warning" | "info";
export type Confidence = "confirmed" | "high" | "heuristic" | "needs_verification";

/** Structured, machine-readable evidence (spec § Evidence types). */
export type EvidenceType =
  | "HTTP_STATUS"
  | "REDIRECT_HOP"
  | "PARAMETER_REMOVED"
  | "PARAMETER_CHANGED"
  | "PARAMETER_PRESERVED"
  | "TRACKER_SIGNATURE"
  | "TRACKER_ABSENT"
  | "HTML_SNIPPET"
  | "RESPONSE_TIME"
  | "FINAL_URL"
  | "DNS_ERROR"
  | "TLS_ERROR"
  | "TIMEOUT"
  | "CONNECTION_ERROR"
  | "CONTENT_TYPE"
  | "URL_BLOCKED"
  | "REDIRECT_LOOP"
  | "TITLE_TEXT"
  | "META_ROBOTS"
  | "MATCHED_TEXT"
  | "FORM_CHECK"
  | "CTA_CHECK";

export type EvidenceItem = {
  type: EvidenceType;
  /** Short human label for the evidence row. */
  label: string;
  /** Primary value: status code, duration, URL, parameter name… */
  value?: string;
  /** Additional typed fields. */
  meta?: Record<string, string | number | boolean | null | undefined>;
  /** Safe plain-text snippet. Rendered as text, never as HTML. */
  snippet?: string;
};

export type TrackerKey =
  | "ga4"
  | "gtm"
  | "google_ads"
  | "meta_pixel"
  | "tiktok_pixel"
  | "linkedin_insight";

export const TRACKER_LABELS: Record<TrackerKey, string> = {
  ga4: "Google Analytics (GA4)",
  gtm: "Google Tag Manager",
  google_ads: "Google Ads tag",
  meta_pixel: "Meta Pixel",
  tiktok_pixel: "TikTok Pixel",
  linkedin_insight: "LinkedIn Insight Tag",
};

export type TrackerDetection = {
  key: TrackerKey;
  detected: boolean;
  signatureId?: string;
  excerpt?: string;
};

export type RedirectHopDraft = {
  sequence: number;
  fromUrl: string;
  toUrl: string;
  statusCode: number;
  durationMs: number | null;
};

export type FetchErrorCode =
  | "DNS_ERROR"
  | "TLS_ERROR"
  | "CONNECTION_FAILURE"
  | "TIMEOUT"
  | "BLOCKED_URL"
  | "REDIRECT_LOOP"
  | "TOO_MANY_REDIRECTS"
  | "SCAN_ERROR";

export type PageFetchSuccess = {
  kind: "ok";
  requestedUrl: string;
  finalUrl: string;
  httpStatus: number;
  responseTimeMs: number;
  contentType: string | null;
  headers: Record<string, string>;
  html: string;
  bytesInspected: number;
  truncatedAtCap: boolean;
  redirects: RedirectHopDraft[];
};

export type PageFetchFailure = {
  kind: "error";
  requestedUrl: string;
  finalUrl: string | null;
  errorCode: FetchErrorCode;
  message: string;
  /** Technical detail safe for display (no stack traces). */
  detail?: string;
  responseTimeMs: number;
  redirects: RedirectHopDraft[];
  httpStatus: number | null;
};

export type PageFetchResult = PageFetchSuccess | PageFetchFailure;

/** Injectable fetcher so the check engine can run without live network. */
export type PageFetcher = (url: string) => Promise<PageFetchResult>;

export type ScanExpectations = {
  expectedTracker?: TrackerKey | null;
  expectedText?: string | null;
  expectedForm?: boolean | null;
  expectedHostname?: string | null;
};

export type ScanContext = {
  /** Original imported URL (before redirects). */
  originalUrl: string;
  /** Normalized destination key (grouping identity). */
  normalizedKey: string;
  /** Platforms of campaigns pointing here (normalized: meta/google/tiktok/linkedin/other). */
  platforms: string[];
  /** Campaign spend associated with this destination (minor units). */
  associatedSpendMinor: number;
  currency: string;
  expectations?: ScanExpectations | null;
};

export type FindingDraft = {
  /** Stable identity across scans — used for incident history. */
  key: string;
  checkId: string;
  severity: Severity;
  confidence: Confidence;
  title: string;
  summary: string;
  explanation: string;
  recommendation?: string;
  evidence: EvidenceItem[];
  metadata?: Record<string, unknown>;
};

export type ScanTargetOutcome = {
  fetch: PageFetchResult;
  findings: FindingDraft[];
  trackers: TrackerDetection[];
};

export type PreflightStatus = "DO_NOT_LAUNCH" | "REVIEW_BEFORE_LAUNCH" | "LAUNCH_READY";

export const CHECK_IDS = {
  network: "network",
  redirects: "redirects",
  attribution: "attribution",
  tracking: "tracking",
  content: "content",
  performance: "performance",
} as const;

export type CheckId = (typeof CHECK_IDS)[keyof typeof CHECK_IDS];

/** Number of distinct checks in the suite — used for healthy-outcome counts. */
export const CHECK_SUITE_SIZE = 6;
