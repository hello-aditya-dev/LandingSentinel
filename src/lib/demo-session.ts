/**
 * The anonymous demo-session cookie name (see src/lib/services/context.ts
 * and src/middleware.ts). This module is deliberately dependency-free so
 * the Edge middleware can import it without pulling server-only code.
 */
export const DEMO_SESSION_COOKIE = "ls_demo_sid";

/** Session ids are random UUIDs — validate the shape before trusting one. */
export function isValidDemoSessionId(value: string | undefined | null): value is string {
  return Boolean(value) && /^[a-zA-Z0-9-]{8,64}$/.test(value as string);
}
