import { z } from "zod";
import { ok, fail, route } from "@/lib/api/envelope";
import { resolveContext } from "@/lib/services/context";
import { generateReport } from "@/lib/services/queries";
import { db } from "@/lib/db";
import { requireAdminFor } from "@/lib/auth";

export const runtime = "nodejs";

const generateSchema = z.object({
  scanId: z.string().min(1),
  title: z.string().max(200).optional(),
});

export const GET = route(async (req) => {
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") === "demo" ? "demo" : "app";
  const ctx = await resolveContext(scope);
  const denied = await requireAdminFor(ctx, req);
  if (denied) return denied;
  const reports = await db.report.findMany({
    where: { scan: { workspaceId: ctx.workspaceId } },
    orderBy: { generatedAt: "desc" },
    take: 50,
    include: {
      scan: {
        select: {
          id: true, label: true, state: true, variant: true, demo: true, currency: true,
          preflightStatus: true, readinessScore: true, startedAt: true, completedAt: true,
          totalSpendMinor: true, stats: true,
        },
      },
    },
  });
  return ok({
    reports: reports.map((r) => ({
      id: r.id,
      title: r.title,
      generatedAt: r.generatedAt.toISOString(),
      scan: {
        id: r.scan.id,
        label: r.scan.label,
        variant: r.scan.variant,
        demo: r.scan.demo,
        currency: r.scan.currency,
        preflightStatus: r.scan.preflightStatus,
        readinessScore: r.scan.readinessScore,
        startedAt: r.scan.startedAt.toISOString(),
        totalSpendMinor: r.scan.totalSpendMinor,
      },
    })),
  });
});

export const POST = route(async (req) => {
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") === "demo" ? "demo" : "app";
  const body = await req.json().catch(() => null);
  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return fail("INVALID_INPUT", "The report request is not valid.", 400);
  }
  const ctx = await resolveContext(scope);
  const denied = await requireAdminFor(ctx, req);
  if (denied) return denied;
  const report = await generateReport(parsed.data.scanId, ctx, parsed.data.title);
  if (!report) {
    return fail("NOT_FOUND", "No completed scan was found for this report.", 404);
  }
  return ok({ reportId: report.id }, 201);
});
