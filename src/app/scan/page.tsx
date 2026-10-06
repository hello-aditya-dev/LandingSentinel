import type { Metadata } from "next";
import { ScanOneView } from "@/components/marketing/scan-one-view";

export const metadata: Metadata = {
  title: { absolute: "Scan a Landing Page — LandingSentinel" },
  description:
    "One real landing page, checked by the real engine: redirects, tracking signatures, attribution survival and content integrity — with evidence. Free, ephemeral, rate-limited.",
  alternates: { canonical: "/scan" },
};

export default function Page() {
  return <ScanOneView />;
}
