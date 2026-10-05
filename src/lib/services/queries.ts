/**
 * Read-side queries and serializers shared by API routes.
 * All spend values are minor units until formatted for display.
 */

import { db } from "@/lib/db";
import { resolveBranding, type WorkspaceContext } from "./context";

export type MoneyMapRow = {
  scanTargetId: string;
  destinationId: string;
  priority: number;
  normalizedKey: string;
  representativeUrl: string;
  hostname: string;
  pathname: string;
  associatedSpendMinor: number;
  currency: string;
  campaignCount: number;
  platforms: string[];
  status: "critical" | "warning" | "healthy";
  primaryFinding: { id: string; severity: string; title: string } | null;
  findingCounts: { critical: number; warning: number; info: number };
  lastScanAt: string | null;
  httpStatus: number | null;
  finalUrl: string | null;
};

export type ScanSummary = {
  id: string;
  label: string | null;
  state: string;
  engine: string;
  variant: string;
  demo: boolean;
  currency: string;
  totalSpendMinor: number;
  readinessScore: number | null;
  preflightStatus: string | null;
  startedAt: string;
  completedAt: string | null;
  stats: {
    criticalFindings: number;
    warningFindings: number;
    infoFindings: number;
    criticalDestinations: number;
    warningDestinations: number;
    healthyDestinations: number;
    criticalSpendMinor: number;
    warningSpendMinor: number;
    healthySpendMinor: number;
    failedTargets?: number;
    totalTargets?: number;
  } | null;
  targetCount: number;
  reportCount: number;
};

function scanToSummary(
  scan: {
    id: string; label: string | null; state: string; engine: string; variant: string; demo: boolean;
    currency: string; totalSpendMinor: number; readinessScore: number | null; preflightStatus: string | null;
    startedAt: Date; completedAt: Date | null; stats: unknown;
    targets?: unknown[]; reports?: unknown[];
    _count?: { targets: number; reports: number };
  }
): ScanSummary {
  return {
    id: scan.id,
    label: scan.label,
    state: scan.state,
    engine: scan.engine,
    variant: scan.variant,
    demo: scan.demo,
    currency: scan.currency,
    totalSpendMinor: scan.totalSpendMinor,
    readinessScore: scan.readinessScore,
    preflightStatus: scan.preflightStatus,
    startedAt: scan.startedAt.toISOString(),
    completedAt: scan.completedAt?.toISOString() ?? null,
    stats: (scan.stats as ScanSummary["stats"]) ?? null,
    targetCount: scan._count?.targets ?? (scan.targets as unknown[] | undefined)?.length ?? 0,
    reportCount: scan._count?.reports ?? (scan.reports as unknown[] | undefined)?.length ?? 0,
  };
}

export async function listScans(ctx: WorkspaceContext): Promise<ScanSummary[]> {
  const scans = await db.scan.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { _count: { select: { targets: true, reports: true } } },
  });
  return scans.map(scanToSummary);
}

export async function getScanDetail(scanId: string, ctx: WorkspaceContext) {
  const scan = await db.scan.findFirst({
    where: { id: scanId, workspaceId: ctx.workspaceId },
    include: {
      _count: { select: { targets: true, reports: true } },
      reports: { orderBy: { generatedAt: "desc" }, take: 1 },
    },
  });
  if (!scan) return null;

  const targets = await db.scanTarget.findMany({
    where: { scanId },
    orderBy: { orderIndex: "asc" },
    include: {
      destination: {
        include: { campaignLinks: { include: { campaignRow: { select: { platform: true } } } } },
      },
      findings: true,
    },
  });

  // Campaign rows per destination (for the affected-campaigns panel).
  const destinationIds = targets.map((t) => t.destinationId);
  const campaignLinks = await db.destinationCampaign.findMany({
    where: { destinationId: { in: destinationIds } },
    include: {
      campaignRow: {
        select: { platform: true, campaignName: true, adGroupName: true, adName: true, originalUrl: true, spendMinor: true, currency: true, importBatchId: true },
      },
    },
  });
  const campaignsByDestination = new Map<string, typeof campaignLinks>();
  for (const link of campaignLinks) {
    const list = campaignsByDestination.get(link.destinationId) ?? [];
    list.push(link);
    campaignsByDestination.set(link.destinationId, list);
  }

  const severityRank = { critical: 0, warning: 1, info: 2 } as const;

  const moneyMap: MoneyMapRow[] = targets.map((t, index) => {
    const critical = t.findings.filter((f) => f.severity === "critical");
    const warnings = t.findings.filter((f) => f.severity === "warning");
    const infos = t.findings.filter((f) => f.severity === "info");
    const status: MoneyMapRow["status"] =
      critical.length > 0 ? "critical" : warnings.length > 0 ? "warning" : "healthy";

    const ranked = [...critical, ...warnings, ...infos].sort(
      (a, b) => severityRank[a.severity as keyof typeof severityRank] - severityRank[b.severity as keyof typeof severityRank]
    );

    const campaigns = campaignsByDestination.get(t.destinationId) ?? [];
    const platforms = [...new Set(campaigns.map((c) => (c.campaignRow.platform ?? "other").toLowerCase()))];

    return {
      scanTargetId: t.id,
      destinationId: t.destinationId,
      priority: index + 1,
      normalizedKey: t.destination.normalizedKey,
      representativeUrl: t.destination.representativeUrl,
      hostname: t.destination.hostname,
      pathname: t.destination.pathname,
      associatedSpendMinor: t.associatedSpendMinor,
      currency: scan.currency,
      campaignCount: campaigns.length,
      platforms,
      status,
      primaryFinding: ranked[0]
        ? { id: ranked[0].id, severity: ranked[0].severity, title: ranked[0].title }
        : null,
      findingCounts: { critical: critical.length, warning: warnings.length, info: infos.length },
      lastScanAt: t.completedAt?.toISOString() ?? null,
      httpStatus: t.httpStatus,
      finalUrl: t.finalUrl,
    };
  });

  // Default Money Map ordering: severity, then associated spend descending.
  moneyMap.sort((a, b) => {
    const statusRank = { critical: 0, warning: 1, healthy: 2 } as const;
    const byStatus = statusRank[a.status] - statusRank[b.status];
    if (byStatus !== 0) return byStatus;
    return b.associatedSpendMinor - a.associatedSpendMinor;
  });
  moneyMap.forEach((row, i) => (row.priority = i + 1));

  return {
    scan: scanToSummary(scan),
    moneyMap,
    targets: targets.map((t) => ({
      id: t.id,
      state: t.state,
      stage: t.stage,
      orderIndex: t.orderIndex,
      normalizedKey: t.destination.normalizedKey,
      originalUrl: t.originalUrl,
      finalUrl: t.finalUrl,
      httpStatus: t.httpStatus,
      responseTimeMs: t.responseTimeMs,
      error: t.error,
      trackerSummary: t.trackerSummary,
    })),
    campaignsByDestination: Object.fromEntries(
      [...campaignsByDestination.entries()].map(([destId, links]) => [
        destId,
        links.map((l) => ({
          id: l.id,
          platform: l.campaignRow.platform,
          campaignName: l.campaignRow.campaignName,
          adGroupName: l.campaignRow.adGroupName,
          adName: l.campaignRow.adName,
          originalUrl: l.campaignRow.originalUrl,
          spendMinor: l.campaignRow.spendMinor,
          currency: l.campaignRow.currency,
        })),
      ])
    ),
    latestReportId: scan.reports[0]?.id ?? null,
  };
}

export async function getFindingDetail(findingId: string, ctx: WorkspaceContext) {
  const finding = await db.finding.findFirst({
    where: { id: findingId, scan: { workspaceId: ctx.workspaceId } },
    include: {
      scan: true,
      scanTarget: {
        include: {
          destination: true,
          redirects: { orderBy: { sequence: "asc" } },
          findings: { orderBy: [{ severity: "asc" }, { lastSeenAt: "asc" }] },
        },
      },
    },
  });
  if (!finding) return null;

  const campaignLinks = await db.destinationCampaign.findMany({
    where: { destinationId: finding.scanTarget.destinationId },
    include: {
      campaignRow: {
        select: { platform: true, campaignName: true, adGroupName: true, adName: true, originalUrl: true, spendMinor: true, currency: true },
      },
    },
    orderBy: { spendMinor: "desc" },
  });

  // Incident history for this finding key.
  const history = await db.finding.findMany({
    where: {
      findingKey: finding.findingKey,
      scan: { workspaceId: ctx.workspaceId },
    },
    orderBy: { lastSeenAt: "asc" },
    select: { id: true, firstSeenAt: true, lastSeenAt: true, resolvedAt: true, scanId: true },
  });

  return {
    finding: {
      id: finding.id,
      scanId: finding.scanId,
      scanTargetId: finding.scanTargetId,
      checkId: finding.checkId,
      severity: finding.severity,
      confidence: finding.confidence,
      title: finding.title,
      summary: finding.summary,
      explanation: finding.explanation,
      recommendation: finding.recommendation,
      associatedSpendMinor: finding.associatedSpendMinor,
      currency: finding.currency,
      evidence: finding.evidence,
      metadata: finding.metadata,
      firstSeenAt: finding.firstSeenAt?.toISOString() ?? null,
      lastSeenAt: finding.lastSeenAt?.toISOString() ?? null,
      resolvedAt: finding.resolvedAt?.toISOString() ?? null,
    },
    destination: {
      id: finding.scanTarget.destinationId,
      normalizedKey: finding.scanTarget.destination.normalizedKey,
      representativeUrl: finding.scanTarget.destination.representativeUrl,
    },
    target: {
      id: finding.scanTarget.id,
      originalUrl: finding.scanTarget.originalUrl,
      finalUrl: finding.scanTarget.finalUrl,
      httpStatus: finding.scanTarget.httpStatus,
      responseTimeMs: finding.scanTarget.responseTimeMs,
      contentType: finding.scanTarget.contentType,
      bytesInspected: finding.scanTarget.bytesInspected,
      redirectCount: finding.scanTarget.redirectCount,
      trackerSummary: finding.scanTarget.trackerSummary,
      error: finding.scanTarget.error,
    },
    redirects: finding.scanTarget.redirects.map((h) => ({
      sequence: h.sequence,
      fromUrl: h.fromUrl,
      toUrl: h.toUrl,
      statusCode: h.statusCode,
      durationMs: h.durationMs,
    })),
    campaignsAffected: campaignLinks.map((l) => ({
      platform: l.campaignRow.platform,
      campaignName: l.campaignRow.campaignName,
      adGroupName: l.campaignRow.adGroupName,
      adName: l.campaignRow.adName,
      originalUrl: l.campaignRow.originalUrl,
      spendMinor: l.campaignRow.spendMinor,
      currency: l.campaignRow.currency,
    })),
    otherFindings: finding.scanTarget.findings
      .filter((f) => f.id !== finding.id)
      .map((f) => ({ id: f.id, severity: f.severity, title: f.title })),
    scan: {
      id: finding.scan.id,
      label: finding.scan.label,
      state: finding.scan.state,
      startedAt: finding.scan.startedAt.toISOString(),
      completedAt: finding.scan.completedAt?.toISOString() ?? null,
      engine: finding.scan.engine,
      variant: finding.scan.variant,
      demo: finding.scan.demo,
    },
    history: history.map((h) => ({
      scanId: h.scanId,
      firstSeenAt: h.firstSeenAt?.toISOString() ?? null,
      lastSeenAt: h.lastSeenAt?.toISOString() ?? null,
      resolvedAt: h.resolvedAt?.toISOString() ?? null,
    })),
  };
}

/* ---------------- Dashboard ---------------- */

export async function getDashboard(ctx: WorkspaceContext) {
  const [latestScan, importBatches, destinationCount, client] = await Promise.all([
    db.scan.findFirst({
      where: { workspaceId: ctx.workspaceId, state: { in: ["complete", "partial"] }, variant: "live" },
      orderBy: { startedAt: "desc" },
    }),
    db.importBatch.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { _count: { select: { campaignRows: true, scans: true } } },
    }),
    db.destination.count({ where: { workspaceId: ctx.workspaceId } }),
    db.client.findFirst({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: "asc" } }),
  ]);

  const scanSummary = latestScan ? scanToSummary(latestScan) : null;
  const latestScanId = latestScan?.id ?? null;
  const latestReport = latestScanId
    ? await db.report.findFirst({ where: { scanId: latestScanId }, orderBy: { generatedAt: "desc" } })
    : null;

  const totalImportedSpend = importBatches.length
    ? (await db.campaignRow.aggregate({
        where: { importBatch: { workspaceId: ctx.workspaceId } },
        _sum: { spendMinor: true },
      }))._sum.spendMinor ?? 0
    : 0;

  return {
    client: client ? { id: client.id, name: client.name } : null,
    latestScan: scanSummary,
    latestReportId: latestReport?.id ?? null,
    importBatches: importBatches.map((b) => ({
      id: b.id,
      filename: b.filename,
      platform: b.platform,
      currency: b.currency,
      originalRowCount: b.originalRowCount,
      validRowCount: b.validRowCount,
      rejectedRowCount: b.rejectedRowCount,
      demo: b.demo,
      createdAt: b.createdAt.toISOString(),
      campaignRowCount: b._count.campaignRows,
    })),
    destinationCount,
    totalImportedSpendMinor: totalImportedSpend,
  };
}

/* ---------------- Reports ---------------- */

export async function generateReport(scanId: string, ctx: WorkspaceContext, title?: string) {
  const scan = await db.scan.findFirst({
    where: { id: scanId, workspaceId: ctx.workspaceId, state: { in: ["complete", "partial"] } },
  });
  if (!scan) return null;

  const existing = await db.report.findFirst({ where: { scanId } });
  if (existing) return existing;

  const branding = await resolveBranding(ctx.workspaceId);
  return db.report.create({
    data: {
      scanId,
      title:
        title ??
        `Campaign Preflight Report — ${new Date(scan.startedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
      branding: { ...branding, snapshotAt: new Date().toISOString() },
    },
  });
}

export async function getReportData(reportId: string, ctx: WorkspaceContext) {
  const report = await db.report.findFirst({
    where: { id: reportId, scan: { workspaceId: ctx.workspaceId } },
    include: { scan: true },
  });
  if (!report) return null;

  const detail = await getScanDetail(report.scanId, ctx);
  if (!detail) return null;

  const branding = (report.branding ?? {}) as Record<string, string | null>;
  const resolved = await resolveBranding(ctx.workspaceId);

  // Real reports are immutable snapshots of branding at generation time.
  // The synthetic DEMO report intentionally uses LIVE branding so the
  // white-label playground can preview report branding immediately.
  const effectiveBranding =
    ctx.scope === "demo" ? resolved : ({ ...resolved, ...branding } as typeof resolved);

  return {
    report: {
      id: report.id,
      title: report.title,
      generatedAt: report.generatedAt.toISOString(),
      branding: effectiveBranding,
    },
    scan: detail.scan,
    moneyMap: detail.moneyMap,
    campaignsByDestination: detail.campaignsByDestination,
    // Full findings for the evidence appendix.
    findings: await db.finding.findMany({
      where: { scanId: report.scanId },
      orderBy: [{ severity: "asc" }, { associatedSpendMinor: "desc" }],
      include: {
        scanTarget: {
          include: {
            destination: { select: { normalizedKey: true, representativeUrl: true } },
            redirects: { orderBy: { sequence: "asc" } },
          },
        },
      },
    }),
    client: detail.scan,
  };
}
