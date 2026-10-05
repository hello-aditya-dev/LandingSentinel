import type { Metadata } from "next";
import { headers } from "next/headers";
import { RootApp } from "@/components/app/root-app";
import { resolveSiteUrl } from "@/lib/site-url";

/**
 * The deployable product ships as one public route — the application shell
 * every product area hangs off (hash-routed views, no server routes).
 *
 * Metadata is resolved per request (the shell is dynamic by design: the
 * authenticated application renders inside it): the canonical URL prefers
 * explicit configuration (NEXT_PUBLIC_SITE_URL), then VERCEL_URL, then the
 * origin the page is actually being served from — so Open Graph and Twitter
 * card image URLs are always honest absolute URLs on any host, including
 * Vercel aliases and custom domains, with zero required configuration.
 */
export async function generateMetadata(): Promise<Metadata> {
  let siteUrl = resolveSiteUrl();

  if (!siteUrl) {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
    if (host) siteUrl = `${proto}://${host}`;
  }

  return {
    ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
    alternates: siteUrl ? { canonical: "/" } : undefined,
  };
}

export default function Page() {
  return <RootApp />;
}
