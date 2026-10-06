import type { Metadata } from "next";
import { ReportView } from "@/components/app/report-view";

export const metadata: Metadata = {
  title: "Demo Client Report — LandingSentinel",
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  return <ReportView scope="demo" reportId={reportId} />;
}
