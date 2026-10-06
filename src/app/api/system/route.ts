import { ok, route, serverLog } from "@/lib/api/envelope";
import { PRODUCT } from "@/config/product";
import { db } from "@/lib/db";
import { authModeActive, isPasswordHashConfigured } from "@/lib/auth";
import { resolveSiteUrl } from "@/lib/site-url";
import { getPayPalConfig } from "@/lib/services/paypal";
import { getRazorpayConfig } from "@/lib/services/razorpay";

export const runtime = "nodejs";

type Check = { name: string; status: "ok" | "warn" | "fail"; detail: string };

async function runChecks(): Promise<Check[]> {
  const checks: Check[] = [];

  // Node version
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  checks.push({
    name: "Node runtime",
    status: major >= 20 ? "ok" : "fail",
    detail: `Node ${process.versions.node}`,
  });

  // Database connectivity
  try {
    await db.workspace.count();
    checks.push({ name: "Database", status: "ok", detail: "Connected" });
  } catch {
    checks.push({ name: "Database", status: "fail", detail: "Not reachable — check DATABASE_URL" });
  }

  // Database schema (a query on each core table)
  try {
    await db.scan.count();
    await db.finding.count();
    await db.destination.count();
    checks.push({ name: "Database schema", status: "ok", detail: "Core tables present" });
  } catch {
    checks.push({ name: "Database schema", status: "fail", detail: "Schema missing — run the migration" });
  }

  // Scanner configuration
  checks.push({
    name: "Scanner",
    status: "ok",
    detail: `Available · timeout ${PRODUCT.scanner.timeoutMs / 1000}s · max ${PRODUCT.scanner.maxTargets} destinations per scan`,
  });

  // Modes
  checks.push({
    name: "Demo mode",
    status: PRODUCT.demoMode ? "ok" : "warn",
    detail: PRODUCT.demoMode ? "Enabled — synthetic fixtures" : "Disabled — real scanner",
  });
  checks.push({
    name: "Public scanner",
    status: PRODUCT.publicScannerEnabled ? "warn" : "ok",
    detail: PRODUCT.publicScannerEnabled
      ? "Enabled — public real-URL scanning is switched on"
      : "Disabled (recommended)",
  });

  // Access control
  if (authModeActive()) {
    checks.push({
      name: "Access control",
      status: isPasswordHashConfigured() ? "ok" : "fail",
      detail: isPasswordHashConfigured()
        ? "Admin authentication active (APP_ACCESS_MODE=auth)"
        : "APP_ACCESS_MODE=auth but ADMIN_PASSWORD_HASH is not set — the real workspace is locked. Generate a hash with: npm run hash-password",
    });
  } else {
    checks.push({
      name: "Access control",
      status: "warn",
      detail: "Disabled (APP_ACCESS_MODE=open) — real-workspace routes are unauthenticated. Only acceptable on trusted/private networks.",
    });
  }

  // Environment
  checks.push({
    name: "Environment",
    status: "ok",
    detail: process.env.NODE_ENV === "production" ? "Production" : "Development",
  });

  // Site URL configuration (canonical metadata — see CONFIGURATION.md)
  const siteUrl = resolveSiteUrl();
  if (process.env.NEXT_PUBLIC_SITE_URL?.trim()) {
    checks.push({
      name: "Site URL",
      status: "ok",
      detail: `Configured (NEXT_PUBLIC_SITE_URL) — ${siteUrl}`,
    });
  } else if (siteUrl) {
    checks.push({
      name: "Site URL",
      status: "warn",
      detail: `Derived from the deployment URL (${siteUrl}) — set NEXT_PUBLIC_SITE_URL for canonical metadata`,
    });
  } else {
    checks.push({
      name: "Site URL",
      status: "warn",
      detail: "Not configured — absolute OG metadata is omitted. Set NEXT_PUBLIC_SITE_URL.",
    });
  }

  // Checkout providers (never report configured when credentials are absent)
  const payPal = getPayPalConfig();
  const razorpay = getRazorpayConfig();
  const checkoutProviders = [
    payPal ? `PayPal (${payPal.env})` : null,
    razorpay ? "Razorpay" : null,
  ].filter(Boolean);
  if (checkoutProviders.length > 0) {
    checks.push({
      name: "Checkout",
      status: "ok",
      detail: `${checkoutProviders.join(" + ")} configured — /buy can take payments`,
    });
  } else {
    checks.push({
      name: "Checkout",
      status: "warn",
      detail: "Not configured — /buy shows checkout unavailable. Set PAYPAL_* / RAZORPAY_* (see CONFIGURATION.md).",
    });
  }

  return checks;
}

export const GET = route(async () => {
  const checks = await runChecks();
  return ok({
    version: PRODUCT.version,
    releaseName: PRODUCT.releaseName,
    productName: PRODUCT.name,
    demoMode: PRODUCT.demoMode,
    publicScannerEnabled: PRODUCT.publicScannerEnabled,
    accessMode: PRODUCT.access.mode,
    nodeVersion: process.versions.node,
    environment: process.env.NODE_ENV === "production" ? "Production" : "Development",
    scanner: {
      maxTargets: PRODUCT.scanner.maxTargets,
      concurrency: PRODUCT.scanner.concurrency,
      timeoutMs: PRODUCT.scanner.timeoutMs,
      maxRedirects: PRODUCT.scanner.maxRedirects,
      maxBodyBytes: PRODUCT.scanner.maxBodyBytes,
    },
    checks,
  });
});

export const POST = route(async () => {
  const checks = await runChecks();
  serverLog("info", "system_check", {
    result: checks.map((c) => `${c.name}:${c.status}`).join(" "),
  });
  const healthy = checks.every((c) => c.status !== "fail");
  return ok({ checks, healthy });
});
