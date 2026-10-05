/**
 * Scan execution: creates scan + targets, runs them with a bounded
 * concurrency pool, persists results incrementally (so polling shows real
 * progress), and computes deterministic aggregates.
 *
 * A failed target fails safely — the scan completes as "partial", never
 * taking the whole run down. One conservative retry is made for transient
 * network conditions only (never for blocked URLs, 404s, or invalid URLs).
 */

import { db } from "@/lib/db";
import { PRODUCT } from "@/config/product";
import { serverLog } from "@/lib/api/envelope";
import { fetchPage } from "./fetch-page";
import { runChecks, destinationScore, preflightStatus } from "./findings";
import { fixtureFetch, DEMO_DESTINATIONS, type DemoDestination } from "./demo-fixtures";
import { canonicalPlatform } from "./tracking";
import type { FindingDraft, PageFetchResult, ScanContext } from "./types";
import type { WorkspaceContext } from "@/lib/services/context";

/** In-process runner registry (dev server / long-running Node). */
const activeRuns = new Map<string, Promise<void>>();

export function isScanRunning(scanId: string): boolean {
  return activeRuns.has(scanId);
}

export type StartScanInput = {
  ctx: WorkspaceContext;
  clientId?: string | null;
  importBatchId?: string | null;
  label?: string | null;
  variant?: "live" | "fixed";
  /** Test hook: run fixtures synchronously without staged delays. */
  fixtureDelays?: boolean;
};

/**
 * Create a scan with queued targets covering the workspace destinations
 * (spend-ranked, capped at SCAN_MAX_TARGETS) and start the runner.
 * Returns the scan id immediately; progress is observable via polling.
 */
export async function startScan(input: StartScanInput): Promise<string> {
  const { ctx } = input;

  // Aggregate destinations with their campaign rows (spend + platforms).
  const destinations = await db.destination.findMany({
    where: { workspaceId: ctx.workspaceId },
    include: {
      campaignLinks: { include: { campaignRow: true } },
    },
  });

  if (destinations.length === 0) {
    throw Object.assign(new Error("No destinations to scan. Import campaign data first."), {
      code: "INVALID_IMPORT",
    });
  }

  // Spend-ranked selection, capped.
  const ranked = destinations
    .map((d) => {
      const spend = d.campaignLinks.reduce((sum, link) => sum + link.spendMinor, 0);
      return { destination: d, spendMinor: spend };
    })
    .sort((a, b) => b.spendMinor - a.spendMinor || a.destination.normalizedKey.localeCompare(b.destination.normalizedKey));

  const selected = ranked.slice(0, PRODUCT.scanner.maxTargets);
  const totalSpendMinor = ranked.reduce((sum, r) => sum + r.spendMinor, 0);
  const scanCurrency = selected[0]?.destination.campaignLinks[0]?.campaignRow.currency ?? "GBP";

  const scan = await db.scan.create({
    data: {
      workspaceId: ctx.workspaceId,
      clientId: input.clientId ?? null,
      importBatchId: input.importBatchId ?? null,
      label: input.label ?? null,
      state: "pending",
      engine: ctx.scanEngine,
      currency: scanCurrency,
      totalSpendMinor: selected.reduce((s, r) => s + r.spendMinor, 0),
      variant: input.variant ?? "live",
      demo: ctx.scanEngine === "demo-fixture",
    },
  });

  await db.scanTarget.createMany({
    data: selected.map((r, index) => ({
      scanId: scan.id,
      destinationId: r.destination.id,
      originalUrl: r.destination.campaignLinks[0]?.campaignRow.originalUrl ?? r.destination.representativeUrl,
      associatedSpendMinor: r.spendMinor,
      state: "queued",
      orderIndex: index,
    })),
  });

  await db.scan.update({ where: { id: scan.id }, data: { state: "running", startedAt: new Date() } });

  const run = runScanTargets(scan.id, ctx, input.variant ?? "live", input.fixtureDelays ?? true)
    .catch(async (err) => {
      serverLog("error", "scan_runner_failed", {
        scanId: scan.id,
        error: err instanceof Error ? err.message : String(err),
      });
      await db.scan
        .update({
          where: { id: scan.id },
          data: { state: "failed", completedAt: new Date() },
        })
        .catch(() => undefined);
    })
    .finally(() => {
      activeRuns.delete(scan.id);
    });

  activeRuns.set(scan.id, run);
  return scan.id;
}

/* ------------------------------------------------------------------ */

/** Exported for the deterministic demo seed (scripts/seed.ts). */
export async function runScanTargets(
  scanId: string,
  ctx: WorkspaceContext,
  variant: "live" | "fixed",
  fixtureDelays: boolean,
  scanIndex?: number
): Promise<void> {
  const targets = await db.scanTarget.findMany({
    where: { scanId },
    orderBy: { orderIndex: "asc" },
    include: {
      destination: { include: { campaignLinks: { include: { campaignRow: true } } } },
    },
  });

  const concurrency = ctx.scanEngine === "demo-fixture" ? 3 : PRODUCT.scanner.concurrency;
  let cursor = 0;
  let failures = 0;

  const worker = async () => {
    for (;;) {
      const index = cursor++;
      if (index >= targets.length) return;
      const target = targets[index];
      try {
        await scanOneTarget(scanId, target, ctx, variant, fixtureDelays, scanIndex);
      } catch (err) {
        failures += 1;
        serverLog("error", "target_scan_failed", {
          scanId,
          targetId: target.id,
          error: err instanceof Error ? err.message : String(err),
        });
        await db.scanTarget
          .update({
            where: { id: target.id },
            data: {
              state: "failed",
              stage: null,
              completedAt: new Date(),
              error: { code: "PERSISTENCE_FAILURE", message: "The scanner could not persist this result." },
            },
          })
          .catch(() => undefined);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()));

  await finalizeScan(scanId, failures, targets.length);
}

async function setStage(targetId: string, stage: string) {
  await db.scanTarget.update({ where: { id: targetId }, data: { state: "running", stage } }).catch(() => undefined);
}

async function scanOneTarget(
  scanId: string,
  target: {
    id: string;
    originalUrl: string;
    associatedSpendMinor: number;
    destination: {
      normalizedKey: string;
      campaignLinks: { spendMinor: number; campaignRow: { platform: string | null; currency: string } }[];
    };
  },
  ctx: WorkspaceContext,
  variant: "live" | "fixed",
  fixtureDelays: boolean,
  scanIndex?: number
): Promise<void> {
  await db.scanTarget.update({
    where: { id: target.id },
    data: { state: "running", startedAt: new Date(), stage: "dns" },
  });

  const platforms = [
    ...new Set(target.destination.campaignLinks.map((l) => canonicalPlatform(l.campaignRow.platform))),
  ];
  const currency = target.destination.campaignLinks[0]?.campaignRow.currency ?? "GBP";

  // Fixture engine: deterministic synthetic results (no network).
  let result: PageFetchResult;
  if (ctx.scanEngine === "demo-fixture") {
    const demoDestination = DEMO_DESTINATIONS.find(
      (d) => d.normalizedKey === target.destination.normalizedKey
    );
    if (demoDestination) {
      if (fixtureDelays) {
        // Staged progress so the demo scan is observable, like a real scan.
        await setStage(target.id, "dns");
        await sleep(220 + (demoDestination.pathname.length * 37) % 180);
        await setStage(target.id, "request");
        await sleep(240 + (demoDestination.hostname.length * 53) % 260);
        if ((demoDestination.live.redirects ?? demoDestination.fixed.redirects ?? []).length > 0 && variant === "live") {
          await setStage(target.id, "redirects");
          await sleep(200);
        }
        await setStage(target.id, "inspect");
        await sleep(180 + (demoDestination.normalizedKey.length * 31) % 200);
      }
      result = fixtureFetch(demoDestination, variant, scanIndex);
    } else {
      // Unknown destination in demo mode: synthesize a healthy result so the
      // pipeline still behaves correctly for re-imported sample data.
      result = fixtureFetch(
        {
          normalizedKey: target.destination.normalizedKey,
          representativeUrl: target.originalUrl,
          hostname: "example.test",
          pathname: "/",
          rows: [{ platform: "other", campaignName: "Imported row", originalUrl: target.originalUrl, spendMinor: target.associatedSpendMinor, batch: "meta-ads-sample.csv" }],
          live: { status: 200, responseTimeMs: 700, html: "<html><head><title>Imported page</title></head><body><h1>Imported page</h1><p>Content</p><a href='/cart'>Shop now</a></body></html>" },
          fixed: { status: 200, responseTimeMs: 700, html: "<html><head><title>Imported page</title></head><body><h1>Imported page</h1><p>Content</p><a href='/cart'>Shop now</a></body></html>" },
        } satisfies DemoDestination,
        variant
      );
    }
  } else {
    // Real engine: live fetch with SSRF-validated manual redirects.
    await setStage(target.id, "request");
    result = await fetchPage(target.originalUrl);
    // One conservative retry for transient network failures only.
    if (
      result.kind === "error" &&
      (result.errorCode === "CONNECTION_FAILURE" || result.errorCode === "TIMEOUT")
    ) {
      await setStage(target.id, "request");
      result = await fetchPage(target.originalUrl);
    }
  }

  await setStage(target.id, "inspect");

  const scanCtx: ScanContext = {
    originalUrl: target.originalUrl,
    normalizedKey: target.destination.normalizedKey,
    platforms,
    associatedSpendMinor: target.associatedSpendMinor,
    currency,
  };

  const { findings, trackers } = runChecks(result, scanCtx);

  await setStage(target.id, "persist");

  // Persist redirect hops.
  if (result.redirects.length > 0) {
    await db.redirectHop.createMany({
      data: result.redirects.map((h) => ({
        scanTargetId: target.id,
        sequence: h.sequence,
        fromUrl: h.fromUrl.slice(0, 2000),
        toUrl: h.toUrl.slice(0, 2000),
        statusCode: h.statusCode,
        durationMs: h.durationMs,
      })),
    });
  }

  // Incident-history: firstSeenAt from previous scans of the same finding key.
  const findingRows = await Promise.all(
    findings.map(async (f) => {
      const key = `${target.destination.normalizedKey}::${f.key}`;
      const previous = await db.finding.findFirst({
        where: { findingKey: key, scan: { workspaceId: ctx.workspaceId } },
        orderBy: { lastSeenAt: "desc" },
        select: { firstSeenAt: true, resolvedAt: true },
      });
      const now = new Date();
      const firstSeenAt = previous && !previous.resolvedAt ? previous.firstSeenAt ?? now : now;
      return {
        scanId,
        scanTargetId: target.id,
        findingKey: key,
        checkId: f.checkId,
        severity: f.severity,
        confidence: f.confidence,
        title: f.title,
        summary: f.summary,
        explanation: f.explanation,
        recommendation: f.recommendation ?? null,
        associatedSpendMinor: target.associatedSpendMinor,
        currency,
        evidence: f.evidence,
        metadata: {
          ...(f.metadata ?? {}),
          engine: ctx.scanEngine,
          synthetic: ctx.scanEngine === "demo-fixture",
        },
        firstSeenAt,
        lastSeenAt: now,
      };
    })
  );

  if (findingRows.length > 0) {
    await db.finding.createMany({ data: findingRows });
  }

  await db.scanTarget.update({
    where: { id: target.id },
    data: {
      state: "complete",
      stage: null,
      completedAt: new Date(),
      finalUrl: result.kind === "ok" ? result.finalUrl.slice(0, 2000) : null,
      httpStatus: result.kind === "ok" ? result.httpStatus : null,
      responseTimeMs: result.responseTimeMs,
      contentType: result.kind === "ok" ? result.contentType ?? null : null,
      bytesInspected: result.kind === "ok" ? result.bytesInspected : null,
      redirectCount: result.redirects.length,
      trackerSummary: trackers.map((t) => ({
        key: t.key,
        detected: t.detected,
        signature: t.signatureId ?? null,
      })),
      ...(result.kind === "error"
        ? { error: { code: result.errorCode, message: result.message } }
        : {}),
    },
  });
}

/* ------------------------------------------------------------------ */

async function finalizeScan(scanId: string, failedTargets: number, totalTargets: number): Promise<void> {
  const targets = await db.scanTarget.findMany({
    where: { scanId },
    include: { findings: true },
  });
  const scan = await db.scan.findUniqueOrThrow({ where: { id: scanId } });

  // Mark disappeared findings resolved — but a synthetic "after fixes" scan
  // must never mark live findings resolved (that would pretend a repair).
  if (scan.variant !== "fixed") {
    const currentKeys = new Set(targets.flatMap((t) => t.findings.map((f) => f.findingKey)));
    const earlier = await db.finding.findMany({
      where: {
        scan: { workspaceId: scan.workspaceId, startedAt: { lt: scan.startedAt }, variant: { not: "fixed" } },
        resolvedAt: null,
      },
      orderBy: { lastSeenAt: "desc" },
      include: { scan: { select: { startedAt: true } } },
    });
    const resolvedLatest = new Map<string, { id: string }>();
    for (const f of earlier) {
      if (!currentKeys.has(f.findingKey) && !resolvedLatest.has(f.findingKey)) {
        resolvedLatest.set(f.findingKey, { id: f.id });
      }
    }
    if (resolvedLatest.size > 0) {
      await db.finding.updateMany({
        where: { id: { in: [...resolvedLatest.values()].map((r) => r.id) } },
        data: { resolvedAt: scan.completedAt ?? new Date() },
      });
    }
  }

  // Aggregates — spend exposure computed at unique destination level with
  // critical > warning > healthy precedence (no double counting).
  let criticalFindings = 0,
    warningFindings = 0,
    infoFindings = 0,
    criticalDestinations = 0,
    warningDestinations = 0,
    healthyDestinations = 0,
    criticalSpendMinor = 0,
    warningSpendMinor = 0,
    healthySpendMinor = 0;

  const destinationScores: { score: number; spend: number }[] = [];

  for (const target of targets) {
    const critical = target.findings.filter((f) => f.severity === "critical");
    const warnings = target.findings.filter((f) => f.severity === "warning");
    const infos = target.findings.filter((f) => f.severity === "info");

    criticalFindings += critical.length;
    warningFindings += warnings.length;
    infoFindings += infos.length;

    destinationScores.push({
      score: destinationScore(target.findings.map((f) => ({ severity: f.severity as "critical" | "warning" | "info" }))),
      spend: target.associatedSpendMinor,
    });

    if (critical.length > 0) {
      criticalDestinations += 1;
      criticalSpendMinor += target.associatedSpendMinor;
    } else if (warnings.length > 0) {
      warningDestinations += 1;
      warningSpendMinor += target.associatedSpendMinor;
    } else {
      healthyDestinations += 1;
      healthySpendMinor += target.associatedSpendMinor;
    }
  }

  // Spend-weighted readiness score (equal weights when there is no spend).
  let readinessScore: number;
  const totalWeighted = destinationScores.reduce((s, d) => s + d.spend, 0);
  if (totalWeighted > 0) {
    readinessScore = Math.round(
      destinationScores.reduce((s, d) => s + d.score * d.spend, 0) / totalWeighted
    );
  } else {
    readinessScore = Math.round(
      destinationScores.reduce((s, d) => s + d.score, 0) / Math.max(1, destinationScores.length)
    );
  }

  const allSeverities = targets.flatMap((t) => t.findings.map((f) => f.severity as "critical" | "warning" | "info"));
  const status = preflightStatus(allSeverities.map((severity) => ({ severity })));

  const state = failedTargets > 0 ? "partial" : "complete";

  await db.scan.update({
    where: { id: scanId },
    data: {
      state,
      completedAt: new Date(),
      readinessScore,
      preflightStatus: status,
      stats: {
        criticalFindings,
        warningFindings,
        infoFindings,
        criticalDestinations,
        warningDestinations,
        healthyDestinations,
        criticalSpendMinor,
        warningSpendMinor,
        healthySpendMinor,
        failedTargets,
        totalTargets,
      },
    },
  });

  serverLog("info", "scan_complete", {
    scanId,
    state,
    status,
    readinessScore,
    criticalFindings,
    warningFindings,
    destinations: totalTargets,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
