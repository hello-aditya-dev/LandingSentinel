import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { resolveSiteUrl } from "@/lib/site-url";

/**
 * sitemap.xml — the real public routes.
 *
 * The product uses real App Router URLs: the marketing homepage, the public
 * demo, the one-page checker and the legal/documentation pages are indexable
 * server routes. The authenticated workspace (`/app/…`) and the login screen
 * are deliberately excluded.
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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = await currentSiteUrl();

  if (!siteUrl) {
    // No canonical site URL resolvable — emit a valid, empty sitemap rather
    // than one pointing at a domain that does not exist.
    return [];
  }

  const now = new Date();

  return [
    {
      url: `${siteUrl}/`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${siteUrl}/demo`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/scan`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${siteUrl}/buy`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/docs`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${siteUrl}/license`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${siteUrl}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
