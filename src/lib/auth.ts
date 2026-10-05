/**
 * Single-admin access control (see SECURITY.md § Access protection).
 *
 * Design — deliberately small and standard:
 * - One administrator, identified by a password. The password hash lives in
 *   the ADMIN_PASSWORD_HASH environment variable (scrypt, never plaintext).
 * - Server-side sessions: the cookie carries an opaque random token; the
 *   database stores only its SHA-256 hash, plus an expiry. Cookies are
 *   HttpOnly, SameSite=Lax, Secure in production.
 * - Scope rule: the synthetic demo workspace stays public (it contains no
 *   real data). Every route operating on the primary (real) workspace
 *   requires a valid admin session when APP_ACCESS_MODE=auth (the default).
 * - APP_ACCESS_MODE=open disables auth entirely — a documented escape hatch
 *   for private/trusted deployments, warned about in the docs and Settings.
 *
 * Login attempts are rate-limited in memory (per instance, per IP). On
 * serverless platforms each instance keeps its own counter — this raises the
 * cost of online brute force, it does not eliminate it (documented).
 */

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { PRODUCT } from "@/config/product";
import { fail } from "@/lib/api/envelope";
import type { WorkspaceContext } from "@/lib/services/context";

export const SESSION_COOKIE = "ls_admin_session";

/* -------------------------------------------------------------- */
/* Password hashing (scrypt)                                       */
/* -------------------------------------------------------------- */

export const PASSWORD_HASH_FORMAT = "scrypt:N:r:p:salt:hash";

/**
 * Hash format: scrypt:N:r:p:<salt hex>:<hash hex>
 *
 * Deliberately colon-separated: `$` characters in .env values are expanded
 * away by dotenv-expand (used by Next.js and most hosting stacks), which
 * would silently corrupt a `$`-separated hash. Colons are safe everywhere.
 */
export function hashPassword(password: string): string {
  const N = 16384,
    r = 8,
    p = 1,
    keylen = 64;
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, keylen, { N, r, p });
  return `scrypt:${N}:${r}:${p}:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function isPasswordHashConfigured(): boolean {
  return PRODUCT.access.adminPasswordHash.trim().length > 0;
}

export function verifyPassword(password: string): boolean {
  const stored = PRODUCT.access.adminPasswordHash.trim();
  if (!stored) return false;
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number.parseInt(parts[1], 10);
  const r = Number.parseInt(parts[2], 10);
  const p = Number.parseInt(parts[3], 10);
  const salt = Buffer.from(parts[4], "hex");
  const expected = Buffer.from(parts[5], "hex");
  if (![N, r, p].every(Number.isFinite) || salt.length === 0 || expected.length === 0) {
    return false;
  }
  try {
    const actual = scryptSync(password, salt, expected.length, { N, r, p });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------- */
/* Server-side sessions                                            */
/* -------------------------------------------------------------- */

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseCookieHeader(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

export async function createAdminSession(): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + PRODUCT.access.sessionTtlMs);
  await db.adminSession.create({
    data: { tokenHash: sha256(token), expiresAt },
  });
  return { token, expiresAt };
}

export type AdminSessionInfo = {
  id: string;
  expiresAt: Date;
};

/** Validate the session cookie against the database (token hash + expiry). */
export async function validateAdminSession(req: Request): Promise<AdminSessionInfo | null> {
  const cookies = parseCookieHeader(req.headers.get("cookie"));
  const token = cookies[SESSION_COOKIE];
  if (!token || token.length < 32) return null;
  const row = await db.adminSession.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) {
    await db.adminSession.delete({ where: { id: row.id } }).catch(() => undefined);
    return null;
  }
  // Touch lastSeenAt without blocking the request.
  void db.adminSession
    .update({ where: { id: row.id }, data: { lastSeenAt: new Date() } })
    .catch(() => undefined);
  return { id: row.id, expiresAt: row.expiresAt };
}

export async function destroyAdminSession(req: Request): Promise<void> {
  const cookies = parseCookieHeader(req.headers.get("cookie"));
  const token = cookies[SESSION_COOKIE];
  if (!token) return;
  await db.adminSession.delete({ where: { tokenHash: sha256(token) } }).catch(() => undefined);
}

/* -------------------------------------------------------------- */
/* Route guard                                                     */
/* -------------------------------------------------------------- */

export function authModeActive(): boolean {
  return PRODUCT.access.mode === "auth";
}

/**
 * Guard for workspace-scoped API routes. Returns a failure response when the
 * request must be rejected, or null when it may proceed.
 *
 * Public: the synthetic demo workspace (no real data) and APP_ACCESS_MODE=open.
 * Everything operating on the primary (real) workspace requires a session.
 */
export async function requireAdminFor(
  ctx: WorkspaceContext,
  req: Request
): Promise<ReturnType<typeof fail> | null> {
  if (ctx.workspaceSlug === "demo" || !authModeActive()) return null;
  const session = await validateAdminSession(req);
  if (session) return null;
  return fail(
    "AUTH_REQUIRED",
    "Administrator sign-in is required to work with real campaign data.",
    401
  );
}

/* -------------------------------------------------------------- */
/* Login rate limiting (in memory, per instance, per IP)           */
/* -------------------------------------------------------------- */

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export function loginRateLimited(req: Request): boolean {
  const key = clientIp(req);
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) return false;
  return entry.count >= MAX_ATTEMPTS;
}

export function recordFailedLogin(req: Request): void {
  const key = clientIp(req);
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count += 1;
  }
  // Opportunistic cleanup so the map cannot grow without bound.
  if (attempts.size > 1000) {
    for (const [k, v] of attempts) {
      if (v.resetAt <= now) attempts.delete(k);
    }
  }
}

export function clearLoginAttempts(req: Request): void {
  attempts.delete(clientIp(req));
}
