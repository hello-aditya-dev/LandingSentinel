import { ok, route } from "@/lib/api/envelope";
import { PRODUCT } from "@/config/product";
import { resolveContext } from "@/lib/services/context";
import { authModeActive, isPasswordHashConfigured, validateAdminSession } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Session state for the client shell. The `scope` query parameter follows the
 * same convention as the workspace routes: the synthetic demo scope never
 * requires auth (it contains no real data).
 */
export const GET = route(async (req) => {
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") === "demo" ? "demo" : "app";
  const ctx = await resolveContext(scope);

  const authRequired = ctx.workspaceSlug !== "demo" && authModeActive();
  const authenticated = authRequired ? Boolean(await validateAdminSession(req)) : true;

  return ok({
    authRequired,
    authenticated,
    passwordConfigured: isPasswordHashConfigured(),
    mode: PRODUCT.access.mode,
  });
});
