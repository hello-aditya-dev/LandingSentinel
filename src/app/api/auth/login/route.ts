import { z } from "zod";
import { NextResponse } from "next/server";
import { ok, fail, route } from "@/lib/api/envelope";
import { PRODUCT } from "@/config/product";
import {
  authModeActive,
  createAdminSession,
  isPasswordHashConfigured,
  loginRateLimited,
  recordFailedLogin,
  clearLoginAttempts,
  verifyPassword,
  sessionCookieOptions,
  SESSION_COOKIE,
} from "@/lib/auth";

export const runtime = "nodejs";

const loginSchema = z.object({
  password: z.string().min(1).max(512),
});

export const POST = route(async (req) => {
  const body = await req.json().catch(() => ({}));
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return fail("INVALID_INPUT", "A password is required.", 400);
  }

  if (!authModeActive()) {
    return fail("INVALID_INPUT", "Access control is disabled (APP_ACCESS_MODE=open). Sign-in is not used.", 400);
  }

  if (!isPasswordHashConfigured()) {
    return fail(
      "AUTH_CONFIG_MISSING",
      "Administrator access is not configured. Set ADMIN_PASSWORD_HASH (generate one with: npm run hash-password) and restart the server.",
      503
    );
  }

  if (loginRateLimited(req)) {
    return fail(
      "RATE_LIMITED",
      "Too many failed sign-in attempts. Wait a few minutes before trying again.",
      429
    );
  }

  if (!verifyPassword(parsed.data.password)) {
    recordFailedLogin(req);
    return fail("AUTH_INVALID_CREDENTIALS", "That password is not correct.", 401);
  }

  clearLoginAttempts(req);
  const session = await createAdminSession();

  const res = NextResponse.json(
    { ok: true, data: { authenticated: true, expiresAt: session.expiresAt.toISOString() } },
    { status: 200 }
  );
  res.cookies.set({
    name: SESSION_COOKIE,
    value: session.token,
    ...sessionCookieOptions(),
    maxAge: Math.floor(PRODUCT.access.sessionTtlMs / 1000),
  });
  return res as NextResponse;
});
