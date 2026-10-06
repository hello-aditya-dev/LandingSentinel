import type { Metadata } from "next";
import { ScanDetailView } from "@/components/app/scan-detail";

export const metadata: Metadata = {
  title: "Demo Preflight Scan — LandingSentinel",
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await params;
  return <ScanDetailView scope="demo" scanId={scanId} />;
}
