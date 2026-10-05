/**
 * Canonical site URL resolution (see CONFIGURATION.md).
 *
 * Order of preference:
 *   1. NEXT_PUBLIC_SITE_URL when the operator configures it (explicit wins);
 *   2. the Vercel deployment URL (VERCEL_URL) on Vercel;
 *   3. http://localhost:3000 in development.
 *
 * The homepage additionally falls back to the REQUEST origin at runtime
 * (see src/app/page.tsx generateMetadata) so social metadata is always an
 * honest absolute URL on whatever host actually serves the page — Vercel
 * aliases and custom domains included — without requiring configuration.
 */
export function resolveSiteUrl(): string | null {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
  return null;
}
