import { ReportView } from "@/components/app/report-view";

export default async function Page({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  return <ReportView scope="app" reportId={reportId} />;
}
