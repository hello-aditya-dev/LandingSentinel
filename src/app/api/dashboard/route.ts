import { z } from "zod";
import { ok, fail, route } from "@/lib/api/envelope";
import { resolveContext } from "@/lib/services/context";
import { getDashboard } from "@/lib/services/queries";

export const runtime = "nodejs";

export const GET = route(async (req) => {
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") === "demo" ? "demo" : "app";
  const ctx = await resolveContext(scope);
  const data = await getDashboard(ctx);
  return ok({ ...data, scope: ctx.scope, scanEngine: ctx.scanEngine });
});
