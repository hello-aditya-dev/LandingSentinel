import type { Metadata } from "next";
import { DocsView } from "@/components/marketing/docs-view";

export const metadata: Metadata = {
  title: { absolute: "Documentation — LandingSentinel" },
  description:
    "Setup, configuration, CSV import format, scanner checks and deployment documentation for the LandingSentinel source package.",
  alternates: { canonical: "/docs" },
};

export default function Page() {
  return <DocsView />;
}
