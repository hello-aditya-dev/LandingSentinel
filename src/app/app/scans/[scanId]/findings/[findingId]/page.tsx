import { FindingDetailView } from "@/components/app/finding-detail";

export default async function Page({
  params,
}: {
  params: Promise<{ scanId: string; findingId: string }>;
}) {
  const { findingId } = await params;
  return <FindingDetailView scope="app" findingId={findingId} />;
}
