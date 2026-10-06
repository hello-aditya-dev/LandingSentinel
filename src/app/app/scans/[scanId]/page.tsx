import { ScanDetailView } from "@/components/app/scan-detail";

export default async function Page({ params }: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await params;
  return <ScanDetailView scope="app" scanId={scanId} />;
}
