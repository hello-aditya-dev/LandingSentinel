import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { resolveSiteUrl } from "@/lib/site-url";

/**
 * robots.txt — the public marketing site (homepage; docs, licence, privacy
 * and demo views are hash fragments of it) is indexable. API routes and the
 * authenticated application are not promoted for indexing.
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
        disallow: ["/api/"],
      },
    ],
    sitemap: siteUrl ? `${siteUrl}/sitemap.xml` : undefined,
  };
}
