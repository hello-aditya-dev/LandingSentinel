"use client";

/**
 * Application shell: top header + side navigation for the product views.
 * The marketing/demo views use their own chrome.
 */

import { cn } from "@/lib/utils";
import { useRouter, type Route } from "@/store/router";
import { PRODUCT } from "@/config/product";
import { MicroLabel } from "@/components/paper/paper";
import {
  LayoutDashboard,
  FileUp,
  Radar,
  FileText,
  Users,
  Settings,
  Compass,
} from "lucide-react";
import type { ReactNode } from "react";

const NAV: { label: string; route: Route; icon: typeof LayoutDashboard; match: (r: Route) => boolean }[] = [
  { label: "Overview", route: { view: "dashboard" }, icon: LayoutDashboard, match: (r) => r.view === "dashboard" },
  { label: "Import campaigns", route: { view: "import" }, icon: FileUp, match: (r) => r.view === "import" },
  { label: "Scans", route: { view: "scans" }, icon: Radar, match: (r) => r.view === "scans" || r.view === "scan" || r.view === "finding" },
  { label: "Reports", route: { view: "reports" }, icon: FileText, match: (r) => r.view === "reports" || r.view === "report" },
  { label: "Clients", route: { view: "clients" }, icon: Users, match: (r) => r.view === "clients" },
  { label: "Settings", route: { view: "settings", tab: "overview" }, icon: Settings, match: (r) => r.view === "settings" },
];

export function AppShell({
  children,
  clientName,
  lastScanAt,
  demo,
  productName,
  headerActions,
}: {
  children: ReactNode;
  clientName?: string | null;
  lastScanAt?: string | null;
  demo?: boolean;
  productName: string;
  headerActions?: ReactNode;
}) {
  const route = useRouter((s) => s.route);
  const navigate = useRouter((s) => s.navigate);

  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:border focus:border-ink focus:bg-paper-raised focus:px-3 focus:py-1.5 focus:text-sm"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-hairline bg-paper/95 backdrop-blur-[2px] print:hidden">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 sm:px-6">
          <button
            type="button"
            onClick={() => navigate({ view: "home" })}
            className="flex items-center gap-2.5 text-left"
            aria-label="Back to LandingSentinel home"
          >
            <Compass size={20} strokeWidth={2} aria-hidden="true" className="text-ink" />
            <span className="font-display text-[17px] font-bold leading-none tracking-tight">{productName}</span>
          </button>

          <div className="hidden flex-1 items-baseline gap-3 sm:flex">
            <span className="micro-label">{clientName ?? "No client"}</span>
            {lastScanAt ? (
              <span className="micro-label text-ink-3">
                Last scan {new Date(lastScanAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            ) : (
              <span className="micro-label text-ink-3">No scans yet</span>
            )}
          </div>

          <nav aria-label="Product areas" className="flex flex-1 items-center gap-1 sm:flex-none">
            {headerActions}
          </nav>
        </div>
        {demo ? <DemoBar /> : null}
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:gap-8 lg:py-8">
        <nav aria-label="Product navigation" className="lg:w-52 lg:shrink-0 print:hidden">
          <ul className="flex flex-row flex-wrap gap-1 lg:flex-col lg:gap-0.5">
            {NAV.map((item) => {
              const active = item.match(route);
              return (
                <li key={item.label}>
                  <button
                    type="button"
                    onClick={() => navigate(item.route)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2.5 border border-transparent px-3 py-2 text-left text-[13.5px] font-medium transition-colors",
                      active
                        ? "border-hairline bg-paper-raised text-ink shadow-[inset_2px_0_0_var(--ink)]"
                        : "text-ink-2 hover:bg-paper-deep hover:text-ink"
                    )}
                  >
                    <item.icon size={15} strokeWidth={2} aria-hidden="true" className={active ? "text-ink" : "text-ink-3"} />
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 hidden border-t border-hairline pt-3 lg:block">
            <MicroLabel>v{PRODUCT.version} · {PRODUCT.releaseName}</MicroLabel>
          </div>
        </nav>

        <main id="main-content" className="min-w-0 flex-1">
          {children}
        </main>
      </div>

      <footer className="mt-auto border-t border-hairline bg-paper-raised print:hidden">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <MicroLabel>{productName} · v{PRODUCT.version}</MicroLabel>
          <MicroLabel>Spend associated with affected destinations is not a measurement of lost revenue</MicroLabel>
        </div>
      </footer>
    </div>
  );
}

export function DemoBar() {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-t border-warning/30 bg-warning-wash px-4 py-1.5"
    >
      <span className="micro-label !text-[10px] font-semibold !text-warning">DEMO MODE · SYNTHETIC CAMPAIGN DATA</span>
    </div>
  );
}
