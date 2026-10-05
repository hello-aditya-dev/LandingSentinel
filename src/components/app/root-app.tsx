"use client";

/**
 * Root application: hash router + query provider.
 * The deployable product ships as a single public route ("/"); every product
 * area is an in-app view routed by the URL hash.
 */

import { useEffect, useMemo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouter, scopeForRoute } from "@/store/router";
import { AppShell } from "./app-shell";
import { DashboardView } from "./dashboard";
import { ImportWorkflowView } from "./import-workflow";
import { ScansListView } from "./scans-list";
import { ScanDetailView } from "./scan-detail";
import { FindingDetailView } from "./finding-detail";
import { ReportsListView } from "./reports-list";
import { ReportView } from "./report-view";
import { ClientsView } from "./clients";
import { SettingsView } from "./settings";
import { DemoView } from "../marketing/demo-view";
import { HomeView } from "../marketing/home-view";
import { DocsView } from "../marketing/docs-view";
import { LicenseView } from "../marketing/license-view";
import { PrivacyView } from "../marketing/privacy-view";
import { useBranding, useDashboard } from "@/lib/client/queries";
import { FileUp, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RootApp() {
  const route = useRouter((s) => s.route);
  const syncFromLocation = useRouter((s) => s.syncFromLocation);

  useEffect(() => {
    syncFromLocation();
    const onHashChange = () => syncFromLocation();
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [syncFromLocation]);

  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
    []
  );

  return (
    <QueryClientProvider client={queryClient}>
      <RouteView route={route} />
    </QueryClientProvider>
  );
}

function RouteView({ route }: { route: ReturnType<typeof useRouter.getState>["route"] }) {
  switch (route.view) {
    case "home":
      return <HomeView />;
    case "demo":
      return <DemoView />;
    case "docs":
      return <DocsView />;
    case "license":
      return <LicenseView />;
    case "privacy":
      return <PrivacyView />;
    default:
      return <AppFrame route={route} />;
  }
}

function AppFrame({ route }: { route: ReturnType<typeof useRouter.getState>["route"] }) {
  const scope = scopeForRoute(route);
  const { data: brandingData } = useBranding(scope);
  const { data: dashboard } = useDashboard(scope);

  const branding = brandingData?.branding;
  const demo = dashboard?.scanEngine === "demo-fixture";
  const productName = branding?.productName ?? "LandingSentinel";

  const navigate = useRouter((s) => s.navigate);

  return (
    <AppShell
      clientName={dashboard?.client?.name ?? null}
      lastScanAt={dashboard?.latestScan?.completedAt ?? null}
      demo={demo}
      productName={productName}
      headerActions={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => navigate({ view: "import" })} className="hidden gap-2 sm:inline-flex">
            <FileUp size={14} aria-hidden="true" /> Import
          </Button>
          <Button size="sm" onClick={() => navigate({ view: "dashboard" })} className="gap-2">
            <Radar size={14} aria-hidden="true" /> Run scan
          </Button>
        </div>
      }
    >
      <div style={branding ? ({ ["--brand-accent" as string]: branding.accentColor } as React.CSSProperties) : undefined}>
        {route.view === "dashboard" ? <DashboardView scope={scope} /> : null}
        {route.view === "import" ? <ImportWorkflowView scope={scope} demo={demo} /> : null}
        {route.view === "scans" ? <ScansListView scope={scope} /> : null}
        {route.view === "scan" ? <ScanDetailView scope={scope} scanId={route.scanId} /> : null}
        {route.view === "finding" ? <FindingDetailView scope={scope} findingId={route.findingId} /> : null}
        {route.view === "reports" ? <ReportsListView scope={scope} /> : null}
        {route.view === "report" ? <ReportView scope={scope} reportId={route.reportId} /> : null}
        {route.view === "clients" ? <ClientsView scope={scope} /> : null}
        {route.view === "settings" ? <SettingsView scope={scope} tab={route.tab} /> : null}
      </div>
    </AppShell>
  );
}
