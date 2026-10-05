import { z } from "zod";
import { ok, fail, route } from "@/lib/api/envelope";
import { resolveContext } from "@/lib/services/context";
import { startScan } from "@/lib/scanner/runner";
import { listScans } from "@/lib/services/queries";

export const runtime = "nodejs";

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
  try {
    const scanId = await startScan({
      ctx,
      clientId: parsed.data.clientId ?? null,
      importBatchId: parsed.data.importBatchId ?? null,
      label: parsed.data.label ?? null,
      variant: parsed.data.variant,
    });
    return ok({ scanId }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "The scan could not be started.";
    const code = (err as { code?: string }).code;
    if (code === "INVALID_IMPORT") {
      return fail("INVALID_IMPORT", message, 400);
    }
    return fail("SERVER_FAILURE", message, 500);
  }
});
