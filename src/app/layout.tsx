import type { Metadata, Viewport } from "next";
import { Source_Serif_4, Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { resolveSiteUrl } from "@/lib/site-url";

// Editorial display serif — report titles and major headlines only.
const displaySerif = Source_Serif_4({
  variable: "--font-display-face",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

// UI sans — dense tables, controls, body copy.
const uiSans = Inter({
  variable: "--font-sans-face",
  subsets: ["latin"],
  display: "swap",
});

// Evidence mono — URLs, statuses, timestamps, technical metadata.
const evidenceMono = IBM_Plex_Mono({
  variable: "--font-mono-face",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

/**
 * Canonical URL strategy: resolveSiteUrl() (NEXT_PUBLIC_SITE_URL → VERCEL_URL
 * → localhost in development) is used when available; the homepage adds a
 * request-origin fallback at runtime (see src/app/page.tsx), so absolute-URL
 * metadata is always honest and never points at a domain that does not exist.
 */
const siteUrl = resolveSiteUrl();

export const metadata: Metadata = {
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
  title: {
    default: "LandingSentinel — Paid-Media Landing Page Preflight",
    template: "%s · LandingSentinel",
  },
  description:
    "Scan paid-media landing pages for broken destinations, tracking gaps, redirect problems and attribution issues. Prioritize findings by associated campaign spend.",
  applicationName: "LandingSentinel",
  robots: { index: true, follow: true },
  alternates: siteUrl ? { canonical: "/" } : undefined,
  openGraph: {
    type: "website",
    siteName: "LandingSentinel",
    title: "LandingSentinel — Paid-Media Landing Page Preflight",
    description:
      "Scan paid-media landing pages for broken destinations, tracking gaps, redirect problems and attribution issues. Prioritize findings by associated campaign spend.",
  },
  twitter: {
    card: "summary_large_image",
    title: "LandingSentinel — Paid-Media Landing Page Preflight",
    description:
      "Spend-weighted technical evidence for paid-media teams. White-label, self-hosted, source included.",
  },
};

export const viewport: Viewport = {
  themeColor: "#f4f0e7",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${displaySerif.variable} ${uiSans.variable} ${evidenceMono.variable} antialiased bg-paper text-ink`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
