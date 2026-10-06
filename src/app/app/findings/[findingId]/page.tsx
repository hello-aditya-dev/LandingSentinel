import { FindingDetailView } from "@/components/app/finding-detail";

export default async function Page({ params }: { params: Promise<{ findingId: string }> }) {
  const { findingId } = await params;
  return <FindingDetailView scope="app" findingId={findingId} />;
}
