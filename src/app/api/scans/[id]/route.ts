import { ok, fail, route } from "@/lib/api/envelope";
import { resolveContext } from "@/lib/services/context";
import { getScanDetail } from "@/lib/services/queries";

export const runtime = "nodejs";

export const GET = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") === "demo" ? "demo" : "app";
  const ctx = await resolveContext(scope);
  const detail = await getScanDetail(id, ctx);
  if (!detail) {
    return fail("NOT_FOUND", "This scan does not exist in this workspace.", 404);
  }
  return ok(detail);
});
