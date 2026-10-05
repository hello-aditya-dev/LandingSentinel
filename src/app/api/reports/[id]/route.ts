import { ok, fail, route } from "@/lib/api/envelope";
import { resolveContext } from "@/lib/services/context";
import { getReportData } from "@/lib/services/queries";

export const runtime = "nodejs";

export const GET = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") === "demo" ? "demo" : "app";
  const ctx = await resolveContext(scope);
  const data = await getReportData(id, ctx);
  if (!data) {
    return fail("NOT_FOUND", "This report does not exist in this workspace.", 404);
  }

  // Prisma Json fields arrive as plain objects — normalize dates for transport.
  const findings = data.findings.map((f) => ({
    id: f.id,
    severity: f.severity,
    confidence: f.confidence,
    title: f.title,
    summary: f.summary,
    explanation: f.explanation,
    recommendation: f.recommendation,
    associatedSpendMinor: f.associatedSpendMinor,
    currency: f.currency,
    evidence: f.evidence,
    checkId: f.checkId,
    firstSeenAt: f.firstSeenAt?.toISOString() ?? null,
    lastSeenAt: f.lastSeenAt?.toISOString() ?? null,
    resolvedAt: f.resolvedAt?.toISOString() ?? null,
    destination: {
      normalizedKey: f.scanTarget.destination.normalizedKey,
      representativeUrl: f.scanTarget.destination.representativeUrl,
    },
    redirects: f.scanTarget.redirects.map((h) => ({
      sequence: h.sequence,
      fromUrl: h.fromUrl,
      toUrl: h.toUrl,
      statusCode: h.statusCode,
      durationMs: h.durationMs,
    })),
  }));

  return ok({
    report: data.report,
    scan: data.scan,
    moneyMap: data.moneyMap,
    campaignsByDestination: data.campaignsByDestination,
    findings,
  });
});
