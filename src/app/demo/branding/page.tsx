import type { Metadata } from "next";
import { DemoView } from "@/components/marketing/demo-view";

export const metadata: Metadata = {
  title: { absolute: "Rebrand the Report — LandingSentinel" },
  description: "Live white-label playground: rebrand the synthetic client report in the browser.",
  alternates: { canonical: "/demo/branding" },
  robots: { index: false },
};

export default function Page() {
  return <DemoView panel="branding" />;
}
