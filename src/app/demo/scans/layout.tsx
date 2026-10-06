import { WorkspaceShell } from "@/components/app/workspace-shell";

/** Demo-scoped detail routes keep the product chrome + demo bar. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <WorkspaceShell scope="demo">{children}</WorkspaceShell>;
}
