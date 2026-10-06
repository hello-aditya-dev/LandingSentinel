/**
 * Central product configuration.
 *
 * Every product-level string or default lives here. White-label identity is
 * resolved per-workspace in src/lib/branding (database values override these
 * environment fallbacks). Do not duplicate these values in components.
 */

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw === "true" || raw === "1";
}

export const PRODUCT = {
  name: process.env.NEXT_PUBLIC_PRODUCT_NAME || "LandingSentinel",
  tagline: "Paid-media landing-page preflight",
  version: "0.1.3",
  releaseName: "Production Routing & Reliability",
  price: "£349",
  priceLine: "One-time payment · Founding agency licence",

  // Public one-page checker (marketing site sales tool). Can be disabled
  // per deployment with NEXT_PUBLIC_PAGE_CHECK_ENABLED=false.
  pageCheckEnabled: boolEnv("NEXT_PUBLIC_PAGE_CHECK_ENABLED", true),

  // Seller / portfolio references (marketing site only)
  portfolioUrl: process.env.NEXT_PUBLIC_PORTFOLIO_URL || "",
  portfolioLabel: "Built by Aditya",
  checkoutUrl: process.env.NEXT_PUBLIC_CHECKOUT_URL || "",
  supportEmail: process.env.SUPPORT_EMAIL || "",

  // Runtime modes
  demoMode: boolEnv("DEMO_MODE", false),
  publicScannerEnabled: boolEnv("PUBLIC_SCANNER_ENABLED", false),

  // Single-admin access control (see SECURITY.md).
  // "auth" (default): real-workspace routes require an admin session.
  // "open": no auth — documented escape hatch for private/trusted networks.
  access: {
    mode: (process.env.APP_ACCESS_MODE || "auth") === "open" ? ("open" as const) : ("auth" as const),
    adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || "",
    sessionTtlMs: intEnv("ADMIN_SESSION_TTL_HOURS", 24 * 7) * 60 * 60 * 1000,
  },

  // Scanner limits (see CONFIGURATION.md)
  scanner: {
    maxTargets: intEnv("SCAN_MAX_TARGETS", 25),
    concurrency: intEnv("SCAN_CONCURRENCY", 5),
    timeoutMs: intEnv("SCAN_TIMEOUT_MS", 10_000),
    maxRedirects: intEnv("SCAN_MAX_REDIRECTS", 5),
    maxBodyBytes: intEnv("SCAN_MAX_BODY_BYTES", 2 * 1024 * 1024),
    maxImportRows: 5_000,
    slowResponseMs: intEnv("SCAN_SLOW_RESPONSE_MS", 3_000),
    /** Whole-scan deadline. Keeps the in-request scan inside serverless
     *  function limits (Vercel default maxDuration 60s). */
    maxScanDurationMs: intEnv("SCAN_MAX_DURATION_MS", 55_000),
    userAgent: "LandingSentinel/0.1 (+landing-page-integrity-check)",
  },
} as const;

export type ProductConfig = typeof PRODUCT;
