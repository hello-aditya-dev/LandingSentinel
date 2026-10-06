/**
 * API envelope and error model.
 *
 * Every route returns:
 *   success: { ok: true,  data: ... }
 *   failure: { ok: false, error: { code, message, details? } }
 *
 * Stack traces are never leaked to clients; unexpected errors are logged
 * server-side with scan/target context where available.
 */

import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ApiErrorCode =
  | "INVALID_INPUT"
  | "INVALID_IMPORT"
  | "INVALID_URL"
  | "BLOCKED_URL"
  | "MIXED_CURRENCY"
  | "NETWORK_FAILURE"
  | "SCAN_TIMEOUT"
  | "SCANNER_BLOCKED"
  | "UNSUPPORTED_CONTENT"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "PERSISTENCE_FAILURE"
  | "AUTH_REQUIRED"
  | "AUTH_CONFIG_MISSING"
  | "AUTH_INVALID_CREDENTIALS"
  | "PAYMENT_UNAVAILABLE"
  | "PAYMENT_FAILED"
  | "SERVER_FAILURE";

export class ApiError extends Error {
  code: ApiErrorCode;
  status: number;
  details?: Record<string, unknown>;

  constructor(code: ApiErrorCode, message: string, status = 400, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(
  code: ApiErrorCode,
  message: string,
  status = 400,
  details?: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    { ok: false, error: { code, message, ...(details ? { details } : {}) } },
    { status }
  );
}

/**
 * Safe, actionable responses for known deployment-database states.
 *
 * When the deployment's PostgreSQL is unreachable (DATABASE_URL missing or
 * wrong) or its schema has not been migrated, the backend KNOWS why every
 * workspace request fails — the client is told that, in words that name the
 * configuration step, never the database host, SQL or stack trace. These
 * conditions are already reported publicly by /api/system diagnostics.
 *
 * Returns null when the error is not a known database-state failure.
 */
export function dbFailure(err: unknown): NextResponse | null {
  const code = (err as { code?: string } | null)?.code;
  const name = (err as { name?: string } | null)?.name ?? "";
  const message = err instanceof Error ? err.message : "";
  // Missing DATABASE_URL surfaces as an initialization error naming the
  // variable; an unreachable server carries P1001/P1002. Both are deployment
  // configuration states, not product failures.
  const envMissing = name === "PrismaClientInitializationError" && message.includes("DATABASE_URL");
  if (envMissing || code === "P1001" || code === "P1002") {
    return fail(
      "SERVER_FAILURE",
      "The deployment database is not reachable — set DATABASE_URL and redeploy (see DEPLOYMENT.md). The demo needs the database to create its synthetic workspace.",
      503
    );
  }
  if (code === "P2021" || code === "P2022") {
    return fail(
      "SERVER_FAILURE",
      "The database schema is not initialized — run the migration (npm run db:migrate, see DEPLOYMENT.md).",
      503
    );
  }
  return null;
}

type LogContext = Record<string, unknown>;

/** Wrap a route handler with the standard error envelope + server logging. */
export function route<Args extends unknown[]>(
  handler: (req: Request, ...args: Args) => Promise<NextResponse>,
  context: LogContext = {}
) {
  return async (req: Request, ...args: Args): Promise<NextResponse> => {
    const startedAt = Date.now();
    try {
      const res = await handler(req, ...args);
      if (process.env.NODE_ENV !== "test") {
        serverLog("info", "route_complete", {
          ...context,
          path: new URL(req.url).pathname,
          status: res.status,
          durationMs: Date.now() - startedAt,
        });
      }
      return res;
    } catch (err) {
      if (err instanceof ApiError) {
        serverLog("warn", "api_error", { ...context, code: err.code, message: err.message });
        return fail(err.code, err.message, err.status, err.details);
      }
      if (err instanceof ZodError) {
        return fail("INVALID_INPUT", "The request is not valid.", 400, {
          issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }
      const dbFail = dbFailure(err);
      if (dbFail) {
        serverLog("warn", "api_error", {
          ...context,
          path: new URL(req.url).pathname,
          code: "DB_UNREACHABLE",
          prismaCode: (err as { code?: string }).code,
        });
        return dbFail;
      }
      serverLog("error", "unhandled_route_error", {
        ...context,
        path: new URL(req.url).pathname,
        error: err instanceof Error ? err.message : String(err),
      });
      return fail(
        "SERVER_FAILURE",
        "The server could not complete this request.",
        500
      );
    }
  };
}

/** Structured server logging. Never logs cookies, secrets or full row data. */
export function serverLog(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, unknown> = {}
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
