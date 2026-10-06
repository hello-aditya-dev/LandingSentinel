import type { Metadata } from "next";
import { HomeView } from "@/components/marketing/home-view";

/**
 * Marketing homepage. Canonical URL resolution (NEXT_PUBLIC_SITE_URL →
 * VERCEL_URL → request origin) lives in the root layout so every route's
 * Open Graph URLs stay honest.
 */
export const metadata: Metadata = {
  title: { absolute: "LandingSentinel — Paid-Media Landing Page Preflight" },
  alternates: { canonical: "/" },
};

export default function Page() {
  return <HomeView />;
}
