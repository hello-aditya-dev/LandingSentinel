import { z } from "zod";
import { ok, fail, route } from "@/lib/api/envelope";
import { resolveContext } from "@/lib/services/context";
import { commitImport } from "@/lib/services/import";

export const runtime = "nodejs";

const mappingSchema = z.object({
  url: z.string().optional(),
  spend: z.string().optional(),
  currency: z.string().optional(),
  platform: z.string().optional(),
  campaign: z.string().optional(),
  adGroup: z.string().optional(),
  ad: z.string().optional(),
  defaultCurrency: z.string().optional(),
});

const importSchema = z.object({
  filename: z.string().min(1).max(300),
  csvText: z.string().min(1).max(4 * 1024 * 1024),
  mapping: mappingSchema,
  clientId: z.string().nullish(),
});

export const POST = route(async (req) => {
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") === "demo" ? "demo" : "app";
  const body = await req.json().catch(() => null);
  const parsedBody = importSchema.safeParse(body);
  if (!parsedBody.success) {
    return fail("INVALID_INPUT", "The import request is not valid.", 400);
  }

  const ctx = await resolveContext(scope);
  const result = await commitImport(ctx, {
    filename: parsedBody.data.filename,
    csvText: parsedBody.data.csvText,
    mapping: parsedBody.data.mapping,
    clientId: parsedBody.data.clientId ?? null,
  });

  if (!result.ok) {
    return fail(result.code, result.message, 400, result.details);
  }

  return ok(result, 201);
});
