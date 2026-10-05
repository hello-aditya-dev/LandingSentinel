"use client";

/**
 * TanStack Query hooks for the product views.
 * Scan detail polls while a scan is running or pending.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, withScope } from "./api";
import type { MoneyMapRow, ScanSummary } from "@/lib/services/queries";

export type DashboardData = {
  client: { id: string; name: string } | null;
  latestScan: ScanSummary | null;
  latestReportId: string | null;
  importBatches: {
    id: string;
    filename: string;
    platform: string | null;
    currency: string;
    originalRowCount: number;
    validRowCount: number;
    rejectedRowCount: number;
    demo: boolean;
    createdAt: string;
    campaignRowCount: number;
  }[];
  destinationCount: number;
  totalImportedSpendMinor: number;
  scope: "demo" | "app";
  scanEngine: "demo-fixture" | "real";
};

export type ScanDetailData = {
  scan: ScanSummary;
  moneyMap: MoneyMapRow[];
  targets: {
    id: string;
    state: string;
    stage: string | null;
    orderIndex: number;
    normalizedKey: string;
    originalUrl: string;
    finalUrl: string | null;
    httpStatus: number | null;
    responseTimeMs: number | null;
    error: { code: string; message: string } | null;
    trackerSummary: { key: string; detected: boolean; signature: string | null }[] | null;
  }[];
  campaignsByDestination: Record<
    string,
    {
      id: string;
      platform: string | null;
      campaignName: string | null;
      adGroupName: string | null;
      adName: string | null;
      originalUrl: string;
      spendMinor: number;
      currency: string;
    }[]
  >;
  latestReportId: string | null;
};

export type FindingDetailData = {
  finding: {
    id: string;
    scanId: string;
    scanTargetId: string;
    checkId: string;
    severity: "critical" | "warning" | "info";
    confidence: string;
    title: string;
    summary: string;
    explanation: string;
    recommendation: string | null;
    associatedSpendMinor: number;
    currency: string;
    evidence: { type: string; label: string; value?: string; meta?: Record<string, string | number | boolean | null | undefined>; snippet?: string }[];
    metadata: Record<string, unknown> | null;
    firstSeenAt: string | null;
    lastSeenAt: string | null;
    resolvedAt: string | null;
  };
  destination: { id: string; normalizedKey: string; representativeUrl: string };
  target: {
    id: string;
    originalUrl: string;
    finalUrl: string | null;
    httpStatus: number | null;
    responseTimeMs: number | null;
    contentType: string | null;
    bytesInspected: number | null;
    redirectCount: number | null;
    trackerSummary: { key: string; detected: boolean; signature: string | null }[] | null;
    error: { code: string; message: string } | null;
  };
  redirects: { sequence: number; fromUrl: string; toUrl: string; statusCode: number; durationMs: number | null }[];
  campaignsAffected: {
    platform: string | null;
    campaignName: string | null;
    adGroupName: string | null;
    adName: string | null;
    originalUrl: string;
    spendMinor: number;
    currency: string;
  }[];
  otherFindings: { id: string; severity: string; title: string }[];
  scan: { id: string; label?: string | null; state: string; startedAt: string; completedAt: string | null; engine: string; variant: string; demo: boolean };
  history: { scanId: string; firstSeenAt: string | null; lastSeenAt: string | null; resolvedAt: string | null }[];
};

export type BrandingData = {
  branding: {
    productName: string;
    agencyName: string;
    logoUrl: string | null;
    accentColor: string;
    supportEmail: string | null;
    website: string | null;
    reportFooter: string | null;
    reportContactName: string | null;
  };
};

export function useDashboard(scope: "demo" | "app") {
  return useQuery({
    queryKey: ["dashboard", scope],
    queryFn: () => api<DashboardData>(withScope("/api/dashboard", scope)),
  });
}

export function useScanList(scope: "demo" | "app") {
  return useQuery({
    queryKey: ["scans", scope],
    queryFn: () => api<{ scans: ScanSummary[] }>(withScope("/api/scans", scope)),
    // While a scan is running inside its request, its persisted state changes
    // target by target — poll so running scans surface themselves, and poll
    // briefly after each fetch so a scan created moments ago (POST in-flight)
    // appears without user action.
    refetchInterval: (query) => {
      const scans = query.state.data?.scans;
      if (!scans) return false;
      const anyActive = scans.some((s) => s.state === "running" || s.state === "pending");
      if (anyActive) return 1200;
      if (Date.now() - query.state.dataUpdatedAt < 15_000) return 1500;
      return false;
    },
  });
}

/* ------------------------------------------------------------------ */
/* Access control                                                      */
/* ------------------------------------------------------------------ */

export type SessionData = {
  authRequired: boolean;
  authenticated: boolean;
  passwordConfigured: boolean;
  mode: "auth" | "open";
};

export function useSession(scope: "demo" | "app") {
  return useQuery({
    queryKey: ["session", scope],
    queryFn: () => api<SessionData>(withScope("/api/auth/session", scope)),
    staleTime: 30_000,
    retry: false,
  });
}

export function useLogin(scope: "demo" | "app") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { password: string }) =>
      api<{ authenticated: boolean }>(withScope("/api/auth/login", scope), {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["session", scope] });
      queryClient.invalidateQueries(); // every workspace query was 401'd
    },
  });
}

export function useLogout(scope: "demo" | "app") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ authenticated: boolean }>("/api/auth/logout", { method: "POST" }),
    onSuccess: () => {
      // Remove — not merely invalidate — protected workspace queries so no
      // protected data survives sign-out in the client cache.
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "session" });
      queryClient.invalidateQueries({ queryKey: ["session", scope] });
    },
  });
}

export function useScanDetail(scope: "demo" | "app", scanId: string | null) {
  return useQuery({
    queryKey: ["scan", scope, scanId],
    queryFn: () => api<ScanDetailData>(withScope(`/api/scans/${scanId}`, scope)),
    enabled: Boolean(scanId),
    refetchInterval: (query) => {
      const state = query.state.data?.scan.state;
      return state === "running" || state === "pending" ? 900 : false;
    },
  });
}

export function useFindingDetail(scope: "demo" | "app", findingId: string | null) {
  return useQuery({
    queryKey: ["finding", scope, findingId],
    queryFn: () => api<FindingDetailData>(withScope(`/api/findings/${findingId}`, scope)),
    enabled: Boolean(findingId),
  });
}

export function useReportList(scope: "demo" | "app") {
  return useQuery({
    queryKey: ["reports", scope],
    queryFn: () =>
      api<{
        reports: {
          id: string;
          title: string;
          generatedAt: string;
          scan: {
            id: string;
            label: string | null;
            variant: string;
            demo: boolean;
            currency: string;
            preflightStatus: string | null;
            readinessScore: number | null;
            startedAt: string;
            totalSpendMinor: number;
          };
        }[];
      }>(withScope("/api/reports", scope)),
  });
}

export type ReportData = {
  report: {
    id: string;
    title: string;
    generatedAt: string;
    branding: Record<string, string | null>;
  };
  scan: ScanSummary;
  moneyMap: MoneyMapRow[];
  campaignsByDestination: Record<string, { platform: string | null; campaignName: string | null; adGroupName: string | null; originalUrl: string; spendMinor: number; currency: string }[]>;
  findings: {
    id: string;
    severity: "critical" | "warning" | "info";
    confidence: string;
    title: string;
    summary: string;
    explanation: string;
    recommendation: string | null;
    associatedSpendMinor: number;
    currency: string;
    evidence: { type: string; label: string; value?: string; meta?: Record<string, string | number | boolean | null | undefined>; snippet?: string }[];
    checkId: string;
    firstSeenAt: string | null;
    lastSeenAt: string | null;
    resolvedAt: string | null;
    destination: { normalizedKey: string; representativeUrl: string };
    redirects: { sequence: number; fromUrl: string; toUrl: string; statusCode: number; durationMs: number | null }[];
  }[];
};

export function useReportDetail(scope: "demo" | "app", reportId: string | null) {
  return useQuery({
    queryKey: ["report", scope, reportId],
    queryFn: () => api<ReportData>(withScope(`/api/reports/${reportId}`, scope)),
    enabled: Boolean(reportId),
  });
}

export function useBranding(scope: "demo" | "app") {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["branding", scope],
    queryFn: () => api<BrandingData>(withScope("/api/branding", scope)),
  });
  const mutation = useMutation({
    mutationFn: (payload: Record<string, string | null | undefined>) =>
      api<BrandingData>(withScope("/api/branding", scope), { method: "PUT", body: JSON.stringify(payload) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["branding", scope] }),
  });
  return { ...query, mutation };
}

export function useSystem() {
  return useQuery({
    queryKey: ["system"],
    queryFn: () =>
      api<{
        version: string;
        releaseName: string;
        productName: string;
        demoMode: boolean;
        publicScannerEnabled: boolean;
        nodeVersion: string;
        environment: string;
        scanner: Record<string, number>;
        checks: { name: string; status: "ok" | "warn" | "fail"; detail: string }[];
      }>("/api/system"),
  });
}

export function useStartScan(scope: "demo" | "app") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { importBatchId?: string | null; label?: string | null; variant?: "live" | "fixed" }) =>
      api<{ scanId: string }>(withScope("/api/scans", scope), {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scans", scope] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", scope] });
    },
  });
}

export function useGenerateReport(scope: "demo" | "app") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { scanId: string }) =>
      api<{ reportId: string }>(withScope("/api/reports", scope), {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports", scope] });
    },
  });
}
