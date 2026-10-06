import type { Metadata } from "next";
import { PrivacyView } from "@/components/marketing/privacy-view";

export const metadata: Metadata = {
  title: { absolute: "Data & Privacy — LandingSentinel" },
  description: "What LandingSentinel stores, what it scans and how deployments handle data.",
  alternates: { canonical: "/privacy" },
};

export default function Page() {
  return <PrivacyView />;
}
