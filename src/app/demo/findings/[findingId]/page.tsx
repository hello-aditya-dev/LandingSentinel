import type { Metadata } from "next";
import { FindingDetailView } from "@/components/app/finding-detail";

export const metadata: Metadata = {
  title: "Demo Finding — LandingSentinel",
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ findingId: string }> }) {
  const { findingId } = await params;
  return <FindingDetailView scope="demo" findingId={findingId} />;
}
