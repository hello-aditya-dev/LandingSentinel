import type { Metadata } from "next";
import { ImportWorkflowView } from "@/components/app/import-workflow";

export const metadata: Metadata = {
  title: "Demo Import — LandingSentinel",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <ImportWorkflowView scope="demo" demo />;
}
