import type { Metadata } from "next";
import { DemoView } from "@/components/marketing/demo-view";

export const metadata: Metadata = {
  title: { absolute: "Repaired State — LandingSentinel" },
  description: "The synthetic campaign after fixes — every destination passes preflight.",
  alternates: { canonical: "/demo/fixed" },
  robots: { index: false },
};

export default function Page() {
  return <DemoView panel="fixed" />;
}
