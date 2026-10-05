/**
 * Scanner integration test — the complete pipeline against the REAL engine:
 *
 *   campaign CSV rows → commitImport → destinations → executeScan
 *   → real HTTP requests (local fixture server) → manual redirect handling
 *   → page inspection → findings → severity → associated spend → scan status
 *
 * Runs against a dedicated `<database>_test` PostgreSQL database (created and
 * migrated automatically; the configured data database is never touched).
 * The fixture server runs on 127.0.0.1, reachable only because this suite
 * enables the test-only SCANNER_ALLOW_LOOPBACK_TARGETS flag — every other
 * SSRF rule stays enforced, which is exactly what the /redirect-unsafe case
 * proves.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { createFixtureServer } from "./helpers/fixture-server";
import { loadEnvFiles } from "@/lib/env-load";

/* ------------------------------------------------------------------ */
/* Test database provisioning                                          */
/* ------------------------------------------------------------------ */

function deriveTestUrl(baseUrl: string): { testUrl: string; dbName: string } {
  const parsed = new URL(baseUrl);
  const rawName = decodeURIComponent(parsed.pathname.replace(/^\//, "").split("/")[0] ?? "");
  const dbName = `${(rawName || "landingsentinel").replace(/[^a-zA-Z0-9_]/g, "_")}_test`;
  parsed.pathname = `/${dbName}`;
  return { testUrl: parsed.toString(), dbName };
}

async function ensureDatabaseExists(adminUrl: string, dbName: string): Promise<void> {
  const admin = new URL(adminUrl);
  admin.pathname = "/postgres";
  const client = new PrismaClient({ datasourceUrl: admin.toString() });
  try {
    const exists = await client.$queryRawUnsafe(
      `SELECT 1 FROM pg_database WHERE datname = '${dbName}'`
    );
    if ((exists as unknown[]).length === 0) {
      await client.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await client.$disconnect();
  }
}

/* ------------------------------------------------------------------ */
/* Suite state                                                         */
/* ------------------------------------------------------------------ */

let fixtureBase = "";
let server: ReturnType<typeof createFixtureServer>;
let db: typeof import("@/lib/db")["db"];
let executeScan: typeof import("@/lib/scanner/runner")["executeScan"];
let resolveContext: typeof import("@/lib/services/context")["resolveContext"];
let commitImport: typeof import("@/lib/services/import")["commitImport"];
let originalDatabaseUrl: string | undefined;

/** Expected classification per fixture path (spend in minor units). */
const ROWS: { path: string; query: string; platform: string; spendMinor: number }[] = [
  { path: "/healthy", query: "utm_source=google&utm_medium=cpc&gclid=ABC123", platform: "google", spendMinor: 251_040 },
  { path: "/redirect-healthy", query: "utm_source=google&utm_campaign=sale&gclid=ABC456", platform: "google", spendMinor: 940 },
  { path: "/redirect-relative", query: "utm_source=meta&utm_medium=paid_social", platform: "meta", spendMinor: 610 },
  { path: "/redirect-utm-preserve", query: "utm_campaign=sale&gclid=XYZ789", platform: "google", spendMinor: 880 },
  { path: "/redirect-utm-drop", query: "utm_source=meta&utm_campaign=launch&fbclid=FB0001", platform: "meta", spendMinor: 1_500 },
  { path: "/not-found", query: "utm_source=google&utm_medium=cpc", platform: "google", spendMinor: 312 },
  { path: "/server-error", query: "utm_source=meta&utm_medium=paid_social", platform: "meta", spendMinor: 275 },
  { path: "/slow", query: "utm_source=google&utm_medium=cpc", platform: "google", spendMinor: 430 },
  { path: "/redirect-loop", query: "utm_source=meta&utm_medium=paid_social", platform: "meta", spendMinor: 198 },
  { path: "/trackers", query: "utm_source=meta&utm_medium=paid_social", platform: "meta", spendMinor: 120_560 },
  { path: "/no-trackers", query: "utm_source=meta&utm_medium=paid_social", platform: "meta", spendMinor: 760 },
  { path: "/soft-404", query: "utm_source=google&utm_medium=cpc", platform: "google", spendMinor: 540 },
  { path: "/noindex", query: "utm_source=google&utm_medium=cpc", platform: "google", spendMinor: 415 },
  { path: "/redirect-unsafe", query: "utm_source=meta&utm_medium=paid_social", platform: "meta", spendMinor: 222 },
];

// Expected destination buckets (see fixture behaviour):
//   critical: redirect-utm-drop, not-found, server-error, slow, redirect-loop,
//             no-trackers (Meta pixel absent, no GTM), soft-404 (Google
//             tracking absent + soft-404 wording)
//   warning:  noindex (tracker present, noindex rule)
//   healthy:  healthy, redirect-healthy, redirect-relative,
//             redirect-utm-preserve, trackers, redirect-unsafe (blocked hop
//             is informational — the page itself was never inspected)
const EXPECTED = {
  criticalPaths: ["/redirect-utm-drop", "/not-found", "/server-error", "/slow", "/redirect-loop", "/no-trackers", "/soft-404"],
  warningPaths: ["/noindex"],
  criticalSpendMinor: ["/redirect-utm-drop", "/not-found", "/server-error", "/slow", "/redirect-loop", "/no-trackers", "/soft-404"]
    .map((p) => ROWS.find((r) => r.path === p)!.spendMinor)
    .reduce((s, v) => s + v, 0),
  warningSpendMinor: ROWS.find((r) => r.path === "/noindex")!.spendMinor,
  totalSpendMinor: ROWS.reduce((s, r) => s + r.spendMinor, 0),
};

function buildCsv(): string {
  const lines = ["Destination URL,Campaign,Ad Group,Spend,Platform,Currency"];
  for (const r of ROWS) {
    const spend = (r.spendMinor / 100).toFixed(2);
    lines.push(`${fixtureBase}${r.path}?${r.query},Fixture campaign,All,${spend},${r.platform},GBP`);
  }
  return lines.join("\n");
}

beforeAll(async () => {
  loadEnvFiles();
  const base = process.env.DATABASE_URL;
  if (!base || !/^postgres(ql)?:\/\//.test(base)) {
    throw new Error(
      "Scanner integration tests require a PostgreSQL DATABASE_URL. Configure .env.local (see README.md) — the suite provisions a *_test database automatically and never touches your data database."
    );
  }

  const { testUrl, dbName } = deriveTestUrl(base);
  originalDatabaseUrl = base;
  process.env.DATABASE_URL = testUrl;
  // Test-only loopback escape hatch (unit SSRF tests keep the strict default
  // and prove the flag relaxes nothing except loopback).
  process.env.SCANNER_ALLOW_LOOPBACK_TARGETS = "true";

  await ensureDatabaseExists(base, dbName);
  execSync("npx prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: testUrl },
  });

  // Start the deterministic fixture HTTP server on an ephemeral port.
  server = createFixtureServer({ slowMs: 6_000 });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  fixtureBase = `http://127.0.0.1:${address.port}`;

  // Import DB-bound modules AFTER the test database URL is in place.
  ({ db } = await import("@/lib/db"));
  ({ executeScan } = await import("@/lib/scanner/runner"));
  ({ resolveContext } = await import("@/lib/services/context"));
  ({ commitImport } = await import("@/lib/services/import"));

  // Clean slate for the primary workspace (cascade removes all data).
  await db.workspace.deleteMany({ where: { slug: "primary" } });
}, 240_000);

afterAll(async () => {
  if (originalDatabaseUrl !== undefined) {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
  delete process.env.SCANNER_ALLOW_LOOPBACK_TARGETS;
  try {
    await db?.$disconnect();
  } catch {
    /* already disconnected */
  }
  await new Promise<void>((resolve) => {
    server?.closeAllConnections?.();
    server?.close(() => resolve());
  });
});

/* ------------------------------------------------------------------ */
/* The complete pipeline                                               */
/* ------------------------------------------------------------------ */

describe("scanner integration: CSV → import → real scan → findings → exposure → status", () => {
  let scanId: string;
  let scan: Awaited<ReturnType<typeof db.scan.findUniqueOrThrow>>;

  it("imports the fixture campaign CSV and aggregates destinations", async () => {
    const ctx = await resolveContext("app");
    expect(ctx.workspaceSlug).toBe("primary");
    expect(ctx.scanEngine).toBe("real");

    const result = await commitImport(ctx, {
      filename: "fixture-targets.csv",
      csvText: buildCsv(),
      mapping: {
        url: "Destination URL",
        spend: "Spend",
        platform: "Platform",
        currency: "Currency",
        campaign: "Campaign",
        adGroup: "Ad Group",
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary.validRowCount).toBe(ROWS.length);
      expect(result.summary.rejectedRowCount).toBe(0);
      expect(result.summary.destinationCount).toBe(ROWS.length);
      expect(result.summary.currency).toBe("GBP");
    }
  });

  it("executes the scan to completion inside the request (real engine, real HTTP)", async () => {
    const ctx = await resolveContext("app");
    const run = await executeScan({ ctx, label: "Integration scan" });
    scanId = run.scanId;
    expect(run.state).toBe("complete");

    scan = await db.scan.findUniqueOrThrow({ where: { id: scanId } });
    expect(scan.state).toBe("complete");
    expect(scan.engine).toBe("real");
    expect(scan.variant).toBe("live");
    expect(scan.currency).toBe("GBP");
    expect(scan.totalSpendMinor).toBe(EXPECTED.totalSpendMinor);
  });

  it("scanned every destination via real HTTP requests", async () => {
    const targets = await db.scanTarget.findMany({
      where: { scanId },
      orderBy: { orderIndex: "asc" },
      include: { destination: true },
    });
    expect(targets).toHaveLength(ROWS.length);
    for (const target of targets) {
      expect(target.state).toBe("complete");
      expect(target.associatedSpendMinor).toBeGreaterThan(0);
    }
    const notFound = targets.find((t) => t.originalUrl.includes("/not-found"));
    expect(notFound?.httpStatus).toBe(404);
    const serverError = targets.find((t) => t.originalUrl.includes("/server-error"));
    expect(serverError?.httpStatus).toBe(500);
    const redirectHealthy = targets.find((t) => t.originalUrl.includes("/redirect-healthy"));
    expect(redirectHealthy?.httpStatus).toBe(200);
    expect(redirectHealthy?.redirectCount).toBe(1);
    expect(redirectHealthy?.finalUrl).toContain("/healthy?");
  });

  it("persisted redirect hops for followed redirects", async () => {
    const target = await db.scanTarget.findFirstOrThrow({
      where: { scanId, originalUrl: { contains: "/redirect-healthy" } },
    });
    const hops = await db.redirectHop.findMany({
      where: { scanTargetId: target.id },
      orderBy: { sequence: "asc" },
    });
    expect(hops).toHaveLength(1);
    expect(hops[0].statusCode).toBe(302);
    expect(hops[0].fromUrl).toContain("/redirect-healthy");
    expect(hops[0].toUrl).toContain("/healthy");
  });

  it("produces the expected findings per destination (severity deterministic)", async () => {
    const targets = await db.scanTarget.findMany({
      where: { scanId },
      include: { findings: true },
    });

    const byPath = (path: string) => {
      const t = targets.find((x) => x.originalUrl.includes(path));
      if (!t) throw new Error(`missing target for ${path}`);
      return t;
    };

    // Confirmed hard failures → critical.
    expect(byPath("/not-found").findings.map((f) => f.severity)).toContain("critical");
    expect(
      byPath("/not-found").findings.find((f) => f.findingKey.endsWith("::status_404"))?.confidence
    ).toBe("confirmed");
    expect(byPath("/server-error").findings.map((f) => f.severity)).toContain("critical");
    expect(byPath("/slow").findings.map((f) => f.severity)).toContain("critical");
    expect(byPath("/redirect-loop").findings.map((f) => f.severity)).toContain("critical");

    // Parameter stripping → critical (primary UTM removed).
    const dropped = byPath("/redirect-utm-drop").findings;
    expect(dropped.find((f) => f.findingKey.endsWith("::param_removed_primary"))?.severity).toBe("critical");
    expect(dropped.find((f) => f.findingKey.endsWith("::param_removed_click_id"))?.severity).toBe("warning");

    // Preserved attribution → informational.
    for (const path of ["/redirect-healthy", "/redirect-relative", "/redirect-utm-preserve"]) {
      expect(byPath(path).findings.map((f) => f.severity)).not.toContain("critical");
      expect(byPath(path).findings.map((f) => f.severity)).not.toContain("warning");
      expect(byPath(path).findings.find((f) => f.findingKey.endsWith("::attribution_preserved"))?.severity).toBe("info");
    }

    // Platform-aware tracking: Meta spend + no signature + no GTM → critical;
    // soft-404 → warning; noindex → warning.
    expect(byPath("/no-trackers").findings.find((f) => f.findingKey.endsWith("::tracking_absent_meta"))?.severity).toBe("critical");
    expect(byPath("/soft-404").findings.find((f) => f.findingKey.endsWith("::tracking_absent_google"))?.severity).toBe("critical");
    expect(byPath("/soft-404").findings.find((f) => f.findingKey.endsWith("::soft_404"))?.severity).toBe("warning");
    expect(byPath("/noindex").findings.find((f) => f.findingKey.endsWith("::noindex"))?.severity).toBe("warning");

    // Tracker-rich page with matching platform → no absence finding.
    expect(byPath("/trackers").findings.find((f) => f.findingKey.endsWith("::tracking_absent_meta"))).toBeUndefined();
    expect(byPath("/trackers").findings.find((f) => f.findingKey.endsWith("::tracking_detected"))?.severity).toBe("info");
  });

  it("associated spend flows through to every finding of its destination", async () => {
    const findings = await db.finding.findMany({ where: { scanId } });
    expect(findings.length).toBeGreaterThan(10);
    for (const f of findings) {
      const target = await db.scanTarget.findUniqueOrThrow({
        where: { id: f.scanTargetId },
      });
      expect(f.associatedSpendMinor).toBe(target.associatedSpendMinor);
      expect(f.currency).toBe("GBP");
    }
  });

  it("blocks the unsafe redirect to the cloud metadata endpoint (never fetched)", async () => {
    const target = await db.scanTarget.findFirstOrThrow({
      where: { scanId, originalUrl: { contains: "/redirect-unsafe" } },
    });
    expect(target.state).toBe("complete");
    const error = target.error as { code: string; message: string } | null;
    expect(error?.code).toBe("BLOCKED_URL");
    // The hop TOWARD the metadata endpoint is recorded as evidence…
    const hops = await db.redirectHop.findMany({ where: { scanTargetId: target.id } });
    expect(hops).toHaveLength(1);
    expect(hops[0].toUrl).toContain("169.254.169.254");
    // …and the scanner produced the informational blocked-destination finding.
    const finding = await db.finding.findFirst({
      where: { scanTargetId: target.id, findingKey: { endsWith: "::error_blocked" } },
    });
    expect(finding?.severity).toBe("info");
  });

  it("computes exposure aggregates with precedence and no double counting", async () => {
    const stats = scan.stats as {
      criticalFindings: number;
      warningFindings: number;
      criticalDestinations: number;
      warningDestinations: number;
      healthyDestinations: number;
      criticalSpendMinor: number;
      warningSpendMinor: number;
      healthySpendMinor: number;
      failedTargets: number;
      totalTargets: number;
    };

    expect(stats.failedTargets).toBe(0);
    expect(stats.totalTargets).toBe(ROWS.length);

    expect(stats.criticalDestinations).toBe(EXPECTED.criticalPaths.length);
    expect(stats.warningDestinations).toBe(EXPECTED.warningPaths.length);
    expect(stats.healthyDestinations).toBe(
      ROWS.length - EXPECTED.criticalPaths.length - EXPECTED.warningPaths.length
    );

    // THE money rule: each destination's spend counts once, in its highest bucket.
    expect(stats.criticalSpendMinor).toBe(EXPECTED.criticalSpendMinor);
    expect(stats.warningSpendMinor).toBe(EXPECTED.warningSpendMinor);
    expect(stats.criticalSpendMinor + stats.warningSpendMinor + stats.healthySpendMinor).toBe(
      EXPECTED.totalSpendMinor
    );
    expect(stats.criticalFindings).toBeGreaterThanOrEqual(EXPECTED.criticalPaths.length);
    expect(stats.warningFindings).toBeGreaterThanOrEqual(EXPECTED.warningPaths.length);
  });

  it("stamps DO NOT LAUNCH — a high readiness score never overrides a critical status", async () => {
    // Most destinations (by spend) are healthy, so the weighted score stays
    // high — but confirmed criticals force the stamp.
    expect(scan.readinessScore ?? 0).toBeGreaterThanOrEqual(90);
    expect(scan.preflightStatus).toBe("DO_NOT_LAUNCH");
  });

  it("keeps incident history across scans (firstSeenAt survives a re-scan)", async () => {
    const first = await db.finding.findFirstOrThrow({
      where: { scanId, findingKey: { endsWith: "::status_404" } },
    });

    const ctx = await resolveContext("app");
    const second = await executeScan({ ctx, label: "Integration re-scan" });
    expect(second.state).toBe("complete");

    const secondFinding = await db.finding.findFirstOrThrow({
      where: { scanId: second.scanId, findingKey: first.findingKey },
    });
    expect(secondFinding.firstSeenAt?.toISOString()).toBe(first.firstSeenAt?.toISOString());
    expect(secondFinding.resolvedAt).toBeNull();
  });
});
