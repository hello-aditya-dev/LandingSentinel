import type { Metadata } from "next";
import { Source_Serif_4, Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

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

export const metadata: Metadata = {
  title: {
    default: "LandingSentinel — Paid-media landing-page preflight",
    template: "%s · LandingSentinel",
  },
  description:
    "Import campaign spend, scan every landing-page destination, and find tracking, redirect, availability and attribution issues — with evidence. White-label source code for agencies.",
  applicationName: "LandingSentinel",
  robots: { index: true, follow: true },
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
