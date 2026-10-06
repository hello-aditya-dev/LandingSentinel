import type { Metadata } from "next";
import { WorkspaceShell } from "@/components/app/workspace-shell";

export const metadata: Metadata = {
  title: "Workspace — LandingSentinel",
  // The authenticated workspace holds real client campaign data — never
  // promoted for indexing, and no campaign information appears in metadata.
  robots: { index: false, follow: false },
};

/** Shared product chrome + access control for every /app/* route. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <WorkspaceShell scope="app">{children}</WorkspaceShell>;
}
