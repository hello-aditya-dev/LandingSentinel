/**
 * Deterministic demo seed.
 *
 * Creates the synthetic Northstar Outfitters demo: workspaces, imports,
 * destinations, three historical scans (with real incident history), the
 * "after fixes" synthetic scan, and one client report.
 *
 * Run with: bun run db:seed
 *
 * Everything created is marked demo/synthetic. The seed is idempotent —
 * it replaces the demo workspace but never touches the primary workspace.
 */

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { DEMO_DESTINATIONS, DEMO_CLIENT_NAME } from "@/lib/scanner/demo-fixtures";
import { runScanTargets } from "@/lib/scanner/runner";
import type { WorkspaceContext } from "@/lib/services/context";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Deterministic demo seed. Idempotent — replaces the demo workspace but
 * never touches the primary workspace. Everything is marked synthetic.
 */
export async function seedDemoWorkspace(): Promise<void> {
  console.log("LandingSentinel demo seed");
  console.log("========================");

  // 1. Reset the demo workspace (cascade deletes all demo data).
  await db.workspace.deleteMany({ where: { slug: "demo" } });

  const workspace = await db.workspace.create({
    data: { slug: "demo", name: "Demo Workspace (Synthetic)" },
  });
  const clientId = await seedDemoDataset(workspace.id);
  const mixedBatch = await db.importBatch.findFirstOrThrow({
    where: { workspaceId: workspace.id, filename: "paid-media-mixed-sample.csv" },
  });

  const ctx: WorkspaceContext = {
    scope: "demo",
    workspaceId: workspace.id,
    workspaceSlug: "demo",
    scanEngine: "demo-fixture",
  };

  // 4. Three historical live scans + one "after fixes" scan.
  const scanPlan: { label: string; variant: "live" | "fixed"; scanIndex: number; startedAt: Date }[] = [
    { label: "Baseline preflight", variant: "live", scanIndex: 0, startedAt: new Date(Date.now() - 14 * DAY) },
    { label: "Mid-flight check", variant: "live", scanIndex: 1, startedAt: new Date(Date.now() - 7 * DAY) },
    { label: "Pre-launch check", variant: "live", scanIndex: 2, startedAt: new Date(Date.now() - 2 * DAY) },
    { label: "Post-remediation check (synthetic)", variant: "fixed", scanIndex: 3, startedAt: new Date(Date.now() - 1 * DAY) },
  ];

  const realNow = Date.now();
  let latestLiveScanId: string | null = null;

  for (const plan of scanPlan) {
    const destinations = await db.destination.findMany({
      where: { workspaceId: workspace.id },
      include: { campaignLinks: { include: { campaignRow: true } } },
    });
    const ranked = destinations
      .map((d) => ({
        destination: d,
        spendMinor: d.campaignLinks.reduce((sum, link) => sum + link.spendMinor, 0),
      }))
      .sort((a, b) => b.spendMinor - a.spendMinor);

    const scan = await db.scan.create({
      data: {
        workspaceId: workspace.id,
        clientId,
        importBatchId: mixedBatch.id,
        label: plan.label,
        state: "running",
        engine: "demo-fixture",
        currency: "GBP",
        totalSpendMinor: ranked.reduce((s, r) => s + r.spendMinor, 0),
        variant: plan.variant,
        demo: true,
        startedAt: plan.startedAt,
      },
    });

    await db.scanTarget.createMany({
      data: ranked.map((r, index) => ({
        scanId: scan.id,
        destinationId: r.destination.id,
        originalUrl: r.destination.campaignLinks[0]?.campaignRow.originalUrl ?? r.destination.representativeUrl,
        associatedSpendMinor: r.spendMinor,
        state: "queued",
        orderIndex: index,
      })),
    });

    await runScanTargets(scan.id, ctx, plan.variant, false, plan.scanIndex);

    // Shift timestamps onto the historical timeline.
    const endedAt = new Date(plan.startedAt.getTime() + 42_000);
    await db.scan.update({
      where: { id: scan.id },
      data: { startedAt: plan.startedAt, completedAt: endedAt },
    });
    await db.scanTarget.updateMany({
      where: { scanId: scan.id },
      data: { startedAt: plan.startedAt, completedAt: endedAt },
    });
    const findings = await db.finding.findMany({ where: { scanId: scan.id } });
    for (const f of findings) {
      const carried = f.firstSeenAt && f.firstSeenAt.getTime() < realNow - 60_000;
      await db.finding.update({
        where: { id: f.id },
        data: {
          firstSeenAt: carried ? f.firstSeenAt : plan.startedAt,
          lastSeenAt: endedAt,
        },
      });
    }
    // Resolution timestamps set during finalize also need shifting.
    await db.finding.updateMany({
      where: { scanId: scan.id, resolvedAt: { not: null } },
      data: { resolvedAt: endedAt },
    });

    if (plan.variant === "live") latestLiveScanId = scan.id;
    console.log(`✓ Scan "${plan.label}" (${plan.variant}) completed`);
  }

  // 5. Report for the latest live scan.
  if (latestLiveScanId) {
    const scan = await db.scan.findUniqueOrThrow({ where: { id: latestLiveScanId } });
    await db.report.create({
      data: {
        scanId: scan.id,
        title: `Campaign Preflight Report — Northstar Outfitters (Synthetic Demo)`,
        branding: {
          productName: "LandingSentinel",
          agencyName: "Meridian Performance Group",
          logoUrl: null,
          accentColor: "#A7372D",
          supportEmail: "preflight@meridianpg.test",
          website: "https://meridianpg.test",
          reportFooter: "Prepared by Meridian Performance Group · Synthetic demo data",
          reportContactName: "A. Sharma, Performance Lead",
          snapshotAt: new Date().toISOString(),
        },
      },
    });
    console.log("✓ Client report generated for the pre-launch scan");
  }

  // 6. Verify the headline numbers.
  const latest = await db.scan.findFirstOrThrow({
    where: { workspaceId: workspace.id, variant: "live" },
    orderBy: { startedAt: "desc" },
  });
  const stats = latest.stats as Record<string, number> | null;
  console.log("--------------------");
  console.log(`Total spend represented: £${(latest.totalSpendMinor / 100).toLocaleString("en-GB")}`);
  console.log(`Critical spend: £${((stats?.criticalSpendMinor ?? 0) / 100).toLocaleString("en-GB")}`);
  console.log(`Critical destinations: ${stats?.criticalDestinations}`);
  console.log(`Warning destinations: ${stats?.warningDestinations}`);
  console.log(`Healthy destinations: ${stats?.healthyDestinations}`);
  console.log(`Critical findings: ${stats?.criticalFindings}`);
  console.log(`Warning findings: ${stats?.warningFindings}`);
  console.log(`Preflight status: ${latest.preflightStatus} · Readiness ${latest.readinessScore}/100`);
  console.log("--------------------");
  console.log("Demo seed complete.");
}



/* ---------------------------------------------------------------- */
/* Shared dataset seeding (batches, campaign rows, destinations)     */
/* ---------------------------------------------------------------- */

/**
 * Seeds the synthetic Northstar Outfitters import dataset (3 batches,
 * 32 campaign rows, 22 destinations, links) into an existing workspace.
 * Used by both the CLI demo seed (which then adds scan history) and the
 * per-session demo workspaces (which start unscanned, ready for the
 * prospect's first preflight).
 *
 * Returns the created client's id.
 */
export async function seedDemoDataset(
  workspaceId: string,
  client: Prisma.TransactionClient = db
): Promise<string> {
  const clientRow = await client.client.create({
    data: { workspaceId, name: DEMO_CLIENT_NAME },
  });
  await client.branding.create({
    data: {
      workspaceId,
      productName: "LandingSentinel",
      agencyName: "Meridian Performance Group",
      accentColor: "#A7372D",
      supportEmail: "preflight@meridianpg.test",
      website: "https://meridianpg.test",
      reportFooter: "Prepared by Meridian Performance Group · Synthetic demo data",
      reportContactName: "A. Sharma, Performance Lead",
    },
  });

  // Import batches (mirrors sample-data/*.csv).
  const batchNames = [
    "google-ads-sample.csv",
    "meta-ads-sample.csv",
    "paid-media-mixed-sample.csv",
  ] as const;
  const batches = new Map<string, string>();
  for (const filename of batchNames) {
    const rows = DEMO_DESTINATIONS.flatMap((d) => d.rows.filter((r) => r.batch === filename));
    const batch = await client.importBatch.create({
      data: {
        workspaceId,
        clientId: clientRow.id,
        filename,
        platform:
          filename === "meta-ads-sample.csv"
            ? "Meta"
            : filename === "google-ads-sample.csv"
              ? "Google Ads"
              : "Mixed",
        currency: "GBP",
        originalRowCount: rows.length,
        validRowCount: rows.length,
        rejectedRowCount: 0,
        demo: true,
        createdAt: new Date(Date.now() - 15 * DAY),
      },
    });
    batches.set(filename, batch.id);
  }

  // Destinations, campaign rows and links — batched for speed.
  const destinations = await client.destination.createMany({
    data: DEMO_DESTINATIONS.map((dest) => ({
      workspaceId,
      normalizedKey: dest.normalizedKey,
      representativeUrl: dest.representativeUrl,
      hostname: dest.hostname,
      pathname: dest.pathname,
      createdAt: new Date(Date.now() - 15 * DAY),
    })),
  });

  // createMany does not return ids — fetch them keyed by normalizedKey.
  const created = await client.destination.findMany({
    where: { workspaceId },
    select: { id: true, normalizedKey: true },
  });
  const destinationIds = new Map(created.map((d) => [d.normalizedKey, d.id]));

  const campaignRows = DEMO_DESTINATIONS.flatMap((dest) =>
    dest.rows.map((row) => ({
      importBatchId: batches.get(row.batch)!,
      platform: row.platform === "meta" ? "Meta" : row.platform === "google" ? "Google Ads" : row.platform === "tiktok" ? "TikTok" : "LinkedIn",
      campaignName: row.campaignName,
      adGroupName: row.adGroupName ?? null,
      adName: null,
      originalUrl: row.originalUrl,
      spendMinor: row.spendMinor,
      currency: "GBP",
      rawRow: {
        platform: row.platform,
        campaign: row.campaignName,
        adGroup: row.adGroupName ?? "",
        finalUrl: row.originalUrl,
        spend: (row.spendMinor / 100).toFixed(2),
        currency: "GBP",
      },
      createdAt: new Date(Date.now() - 15 * DAY),
    }))
  );
  await client.campaignRow.createMany({ data: campaignRows });

  // Link every inserted row to its destination. The workspace is fresh, so
  // the rows just inserted are exactly these; each row's own spendMinor is
  // the link spend (deterministic even when URLs repeat within a destination).
  const inserted = await client.campaignRow.findMany({
    where: { importBatchId: { in: [...batches.values()] } },
    select: { id: true, originalUrl: true, spendMinor: true },
  });
  const urlToDest = new Map<string, string>();
  for (const dest of DEMO_DESTINATIONS) {
    for (const row of dest.rows) {
      urlToDest.set(row.originalUrl, destinationIds.get(dest.normalizedKey)!);
    }
  }
  await client.destinationCampaign.createMany({
    data: inserted.flatMap((r) => {
      const destinationId = urlToDest.get(r.originalUrl);
      return destinationId ? [{ campaignRowId: r.id, destinationId, spendMinor: r.spendMinor }] : [];
    }),
  });

  return clientRow.id;
}

/**
 * Seeds a fresh per-session demo workspace: the import dataset only —
 * no scans, no findings, no report. The prospect runs their own first
 * preflight from the RUN PREFLIGHT action.
 */
export async function seedDemoSessionWorkspace(
  workspaceId: string,
  client: Prisma.TransactionClient = db
): Promise<void> {
  await seedDemoDataset(workspaceId, client);
}
