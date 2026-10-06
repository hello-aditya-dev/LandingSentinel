import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { resolveSiteUrl } from "@/lib/site-url";

/**
 * robots.txt — public marketing, demo and documentation routes are
 * indexable. API endpoints, the authenticated workspace and the sign-in
 * screen are not promoted for indexing. The homepage is explicitly allowed.
 *
 * Resolved per request: NEXT_PUBLIC_SITE_URL → VERCEL_URL → the origin
 * actually serving the request.
 */
async function currentSiteUrl(): Promise<string | null> {
  const configured = resolveSiteUrl();
  if (configured) return configured;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : null;
}

export default async function robots(): Promise<MetadataRoute.Robots> {
  const siteUrl = await currentSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/app/", "/login"],
      },
    ],
    sitemap: siteUrl ? `${siteUrl}/sitemap.xml` : undefined,
  };
}
