import type { Metadata } from "next";
import { LicenseView } from "@/components/marketing/license-view";

export const metadata: Metadata = {
  title: { absolute: "Commercial License — LandingSentinel" },
  description: "The founding-agency commercial licence terms for the LandingSentinel source package.",
  alternates: { canonical: "/license" },
};

export default function Page() {
  return <LicenseView />;
}
