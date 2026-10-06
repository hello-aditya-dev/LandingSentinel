import type { Metadata } from "next";
import { DemoView } from "@/components/marketing/demo-view";

export const metadata: Metadata = {
  title: { absolute: "Live Demo — LandingSentinel" },
  description:
    "Run the full campaign preflight on the synthetic Northstar Outfitters portfolio — 22 destinations, £84,260 monthly spend — and see the Money Map, evidence and white-label report. No account required.",
  alternates: { canonical: "/demo" },
  openGraph: {
    title: { absolute: "Live Demo — LandingSentinel" },
    description:
      "Run a full synthetic campaign preflight: DO NOT LAUNCH verdict, Money Map, evidence and the white-label client report. No account required.",
  },
};

export default function Page() {
  return <DemoView />;
}
