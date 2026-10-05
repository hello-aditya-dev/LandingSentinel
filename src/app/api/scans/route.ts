import { z } from "zod";
import { ok, fail, route } from "@/lib/api/envelope";
import { resolveContext } from "@/lib/services/context";
import { executeScan } from "@/lib/scanner/runner";
import { listScans } from "@/lib/services/queries";
import { requireAdminFor } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * The scan runs INSIDE this request (see ARCHITECTURE.md — no detached
 * background work). 60s is the maximum function duration available on every
 * Vercel plan; SCAN_MAX_DURATION_MS (default 55s) bounds the scan below it.
 * On Pro/Enterprise raise both together if you scan slower destinations.
 */
export const maxDuration = 60;

const startSchema = z.object({
  importBatchId: z.string().nullish(),
  clientId: z.string().nullish(),
  label: z.string().max(200).nullish(),
  variant: z.enum(["live", "fixed"]).default("live"),
});

export const GET = route(async (req) => {
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") === "demo" ? "demo" : "app";
  const ctx = await resolveContext(scope);
  const denied = await requireAdminFor(ctx, req);
  if (denied) return denied;
  const scans = await listScans(ctx);
  return ok({ scans });
});

export const POST = route(async (req) => {
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") === "demo" ? "demo" : "app";
  const body = await req.json().catch(() => ({}));
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return fail("INVALID_INPUT", "The scan request is not valid.", 400);
  }

  const ctx = await resolveContext(scope);
  const denied = await requireAdminFor(ctx, req);
  if (denied) return denied;

  try {
    // Resolves only after every target has been scanned and aggregates are
    // persisted. Progress is observable during the request by polling
    // GET /api/scans/[id] — each target's state is persisted as it completes.
    const result = await executeScan({
      ctx,
      clientId: parsed.data.clientId ?? null,
      importBatchId: parsed.data.importBatchId ?? null,
      label: parsed.data.label ?? null,
      variant: parsed.data.variant,
    });
    return ok(result, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "The scan could not be started.";
    const code = (err as { code?: string }).code;
    if (code === "INVALID_IMPORT") {
      return fail("INVALID_IMPORT", message, 400);
    }
    return fail("SERVER_FAILURE", message, 500);
  }
});
