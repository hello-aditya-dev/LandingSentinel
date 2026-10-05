import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { resolveSiteUrl } from "@/lib/site-url";

/**
 * sitemap.xml — deliberately contains ONLY the root URL.
 *
 * LandingSentinel is a single-page application with hash-based routing:
 * the documentation, licence, privacy and demo views are fragments of `/`
 * (e.g. `/#/docs`), not server routes. Listing hash fragments as sitemap
 * URLs would be invalid, so this sitemap stays honest — one real,
 * indexable URL: the marketing homepage.
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

  return [
    {
      url: `${siteUrl}/`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
