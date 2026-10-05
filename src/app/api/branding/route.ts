import { z } from "zod";
import { ok, fail, route } from "@/lib/api/envelope";
import { resolveContext, resolveBranding, ensureBrandingRow } from "@/lib/services/context";

export const runtime = "nodejs";

const brandingSchema = z.object({
  productName: z.string().max(100).optional(),
  agencyName: z.string().max(120).optional(),
  logoUrl: z.string().max(500).nullish(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  supportEmail: z.string().max(200).nullish(),
  website: z.string().max(300).nullish(),
  reportFooter: z.string().max(400).nullish(),
  reportContactName: z.string().max(120).nullish(),
});

export const GET = route(async (req) => {
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") === "demo" ? "demo" : "app";
  const ctx = await resolveContext(scope);
  const branding = await resolveBranding(ctx.workspaceId);
  return ok({ branding, scope: ctx.scope });
});

export const PUT = route(async (req) => {
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") === "demo" ? "demo" : "app";
  const ctx = await resolveContext(scope);

  const body = await req.json().catch(() => null);
  const parsed = brandingSchema.safeParse(body);
  if (!parsed.success) {
    return fail("INVALID_INPUT", "The branding payload is not valid.", 400, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }

  await ensureBrandingRow(ctx.workspaceId);

  // Only validate URL fields lightly — they are display-only.
  const data = parsed.data;
  await (await import("@/lib/db")).db.branding.update({
    where: { workspaceId: ctx.workspaceId },
    data: {
      ...(data.productName !== undefined ? { productName: data.productName } : {}),
      ...(data.agencyName !== undefined ? { agencyName: data.agencyName } : {}),
      ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl || null } : {}),
      ...(data.accentColor !== undefined ? { accentColor: data.accentColor } : {}),
      ...(data.supportEmail !== undefined ? { supportEmail: data.supportEmail || null } : {}),
      ...(data.website !== undefined ? { website: data.website || null } : {}),
      ...(data.reportFooter !== undefined ? { reportFooter: data.reportFooter || null } : {}),
      ...(data.reportContactName !== undefined ? { reportContactName: data.reportContactName || null } : {}),
    },
  });

  const branding = await resolveBranding(ctx.workspaceId);
  return ok({ branding });
});
