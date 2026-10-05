"use client";

/**
 * Public sales demo — no registration, entirely synthetic, per-session.
 *
 * Opens directly into the campaign preflight: the imported portfolio and
 * one dominant action, RUN PREFLIGHT. The staged fixture scan runs in
 * 8–15 seconds, then the reveal — DO NOT LAUNCH, the headline numbers,
 * and FIX THESE FIRST (the Money Map in plain language). From there the
 * natural path is signposted without a tour: evidence → report → after
 * fixes → branding playground → reset.
 *
 * The "SYNTHETIC DEMO DATA" label stays visible at all times.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useScanList,
  useStartScan,
  useDashboard,
  useGenerateReport,
  useBranding,
} from "@/lib/client/queries";
import { useRouter } from "@/store/router";
import { useDemoBranding } from "@/store/demo-branding";
import { DemoBar } from "../app/app-shell";
import { ScanDetailView } from "../app/scan-detail";
import { Sheet, MicroLabel, DossierLine } from "@/components/paper/paper";
import { StatusStamp } from "@/components/paper/stamp";
import { Money } from "@/components/paper/evidence";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { api } from "@/lib/client/api";
import { Radar, RefreshCw, FileText, ArrowRight, RotateCcw, FileUp, Eraser } from "lucide-react";
import { cn } from "@/lib/utils";

export function DemoView({ panel }: { panel?: "fixed" | "branding" }) {
  const scope = "demo";
  const { data: scanList, isLoading } = useScanList(scope);
  const { data: dashboard } = useDashboard(scope);
  const startScan = useStartScan(scope);
  const generateReport = useGenerateReport(scope);
  const navigate = useRouter((s) => s.navigate);
  const queryClient = useQueryClient();
  // The variant is derived from the route panel (hash) — every state change
  // is a navigation, so the demo state is always deep-linkable.
  const variant: "live" | "fixed" = panel === "fixed" ? "fixed" : "live";
  const [resetting, setResetting] = useState(false);
  const brandingRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (panel === "branding") {
      brandingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [panel]);

  const latestLive = useMemo(
    () => scanList?.scans.find((s) => s.variant === "live"),
    [scanList]
  );
  const liveComplete = latestLive?.state === "complete" || latestLive?.state === "partial";
  const latestFixed = useMemo(
    () => scanList?.scans.find((s) => s.variant === "fixed" && (s.state === "complete" || s.state === "partial")),
    [scanList]
  );
  const activeScanId = variant === "live" ? latestLive?.id : latestFixed?.id;

  const starting = startScan.isPending;
  const scanning = scanList?.scans.some((s) => s.state === "running" || s.state === "pending");
  const hasResults = variant === "live" ? Boolean(liveComplete) : Boolean(latestFixed);

  // The repaired state is generated on demand in the visitor's own session
  // (fixture engine, no staged delays — it appears within a second or two).
  // Guarded so the button click and the panel-arrival effect can never both
  // fire and produce duplicate comparison scans.
  const fixedRequestedRef = useRef(false);
  const fixedRunning = scanList?.scans.some(
    (s) => s.variant === "fixed" && (s.state === "running" || s.state === "pending")
  );
  const runFixedScan = () => {
    if (fixedRequestedRef.current || fixedRunning) return;
    fixedRequestedRef.current = true;
    startScan.mutate(
      { label: "After-fixes check (synthetic)", variant: "fixed" },
      {
        onSuccess: () => {
          toast({ title: "Repaired state ready", description: "The synthetic post-remediation scan is shown below." });
          navigate({ view: "demo", panel: "fixed" });
        },
        onError: (err) => {
          fixedRequestedRef.current = false;
          toast({ title: "The comparison scan could not start", description: err instanceof Error ? err.message : undefined });
        },
      }
    );
  };

  // Arriving at #/demo/fixed without a fixed scan (guided path) generates it.
  useEffect(() => {
    if (panel === "fixed" && !latestFixed && !fixedRunning && !startScan.isPending && !isLoading) {
      runFixedScan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, latestFixed, fixedRunning, isLoading, startScan.isPending]);

  const runPreflight = () => {
    startScan.mutate(
      { label: "Demo preflight" },
      {
        onSuccess: () => {
          toast({ title: "Preflight complete", description: "Every synthetic destination was inspected — the results are below." });
          navigate({ view: "demo" });
        },
        onError: (err) => toast({ title: "The demo scan could not start", description: err instanceof Error ? err.message : undefined }),
      }
    );
  };

  const viewReport = () => {
    if (dashboard?.latestReportId) {
      navigate({ view: "report", reportId: dashboard.latestReportId, scope: "demo" });
      return;
    }
    if (!activeScanId) return;
    generateReport.mutate(
      { scanId: activeScanId },
      {
        onSuccess: ({ reportId }) => {
          toast({ title: "Report ready", description: "The branded client report has been generated." });
          navigate({ view: "report", reportId, scope: "demo" });
        },
        onError: (err) => toast({ title: "The report could not be generated", description: err instanceof Error ? err.message : undefined }),
      }
    );
  };

  const resetDemo = async () => {
    setResetting(true);
    try {
      await api("/api/demo/reset", { method: "POST" });
      fixedRequestedRef.current = false;
      await queryClient.invalidateQueries();
      navigate({ view: "demo" });
      toast({ title: "Demo reset", description: "The synthetic dataset is back to its initial state." });
    } catch {
      toast({ title: "Reset failed", description: "The demo workspace could not be re-seeded." });
    } finally {
      setResetting(false);
    }
  };

  const importedRows = dashboard?.importBatches.reduce((s, b) => s + b.campaignRowCount, 0) ?? null;
  const stats = variant === "live" ? latestLive?.stats ?? null : latestFixed?.stats ?? null;

  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-hairline bg-paper/95 backdrop-blur-[2px]">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <div>
            <p className="font-display text-[17px] font-bold leading-none tracking-tight">
              Campaign Preflight — Synthetic Demo
            </p>
            <DossierLine
              items={[
                "NORTHSTAR OUTFITTERS — SYNTHETIC DEMO",
                importedRows !== null ? `${importedRows} CAMPAIGN ROWS · ${dashboard?.destinationCount ?? "—"} DESTINATIONS` : null,
              ]}
              className="mt-1"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasResults ? (
              <>
                <Button
                  size="sm"
                  variant={variant === "fixed" ? "default" : "outline"}
                  onClick={() => {
                    if (variant === "live") {
                      if (latestFixed) navigate({ view: "demo", panel: "fixed" });
                      else runFixedScan();
                    } else {
                      navigate({ view: "demo" });
                    }
                  }}
                  disabled={startScan.isPending}
                  className="gap-2"
                  aria-pressed={variant === "fixed"}
                >
                  <RefreshCw size={14} aria-hidden="true" />
                  {startScan.isPending && variant === "live" && !latestFixed
                    ? "Preparing…"
                    : variant === "live"
                      ? "View after fixes"
                      : "View live state"}
                </Button>
                <Button size="sm" variant="outline" onClick={viewReport} disabled={generateReport.isPending} className="gap-2">
                  <FileText size={13} aria-hidden="true" /> {generateReport.isPending ? "Preparing…" : "View client report"}
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={runPreflight} disabled={starting || Boolean(scanning)} className="gap-2">
                <Radar size={14} aria-hidden="true" /> {starting || scanning ? "Scanning…" : "Run preflight"}
              </Button>
            )}
          </div>
        </div>
        <DemoBar />
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8">
        {/* ---------------- BEFORE: the portfolio, one dominant action ---------------- */}
        {!isLoading && !hasResults && !scanning ? (
          <Sheet
            label="CAMPAIGN PREFLIGHT"
            title="This month's campaign portfolio, ready to inspect"
            labelAside={<DossierLine items={["SYNTHETIC DEMO DATA"]} />}
          >
            <div className="grid gap-px bg-hairline sm:grid-cols-3">
              <DemoStat label="Campaign rows imported" value={importedRows !== null ? String(importedRows) : "32"} note="CSV import · Google Ads, Meta, LinkedIn" />
              <DemoStat
                label="Destinations aggregated"
                value={dashboard?.destinationCount !== undefined ? String(dashboard.destinationCount) : "22"}
                note="Grouped after removing attribution parameters"
              />
              <DemoStat
                label="Campaign spend represented"
                value={dashboard ? <Money minor={dashboard.totalImportedSpendMinor} currency="GBP" /> : "£84,260"}
                note="Synthetic monthly campaign data"
              />
            </div>
            <div className="flex flex-col items-start gap-3 border-t border-hairline px-4 py-5 sm:px-6">
              <p className="max-w-xl text-[14px] leading-relaxed text-ink-2">
                See which landing-page problems deserve attention first.
              </p>
              <Button size="lg" onClick={runPreflight} disabled={starting || Boolean(scanning)} className="gap-2 rounded-[2px] px-6 py-3 text-[15px]">
                <Radar size={16} aria-hidden="true" /> Run preflight
              </Button>
              <p className="text-[12px] text-ink-3">
                No account required · Synthetic campaign data · About ten seconds
              </p>
            </div>
          </Sheet>
        ) : null}

        {/* ---------------- THE REVEAL ---------------- */}
        {hasResults && !scanning ? (
          <Sheet
            label={variant === "live" ? "PREFLIGHT RESULT" : "PREFLIGHT RESULT / AFTER FIXES"}
            title={variant === "live" ? "Issues found before this month's launch" : "The same portfolio after synthetic remediation"}
            labelAside={
              <DossierLine
                items={[
                  variant === "live" ? "STAMP: DO NOT LAUNCH" : "STAMP: LAUNCH READY",
                  variant === "live"
                    ? `${stats?.criticalDestinations ?? 4} CRITICAL DESTINATIONS · £${(((stats?.criticalSpendMinor ?? 1184000) / 100)).toLocaleString("en-GB")}`
                    : "0 CRITICAL · 0 WARNINGS",
                ]}
              />
            }
          >
            <div className="flex flex-col gap-4 px-4 py-5 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <StatusStamp
                  status={variant === "live" ? "DO_NOT_LAUNCH" : "LAUNCH_READY"}
                  size="lg"
                  animated
                  rotation={-3}
                />
                {variant === "fixed" ? (
                  <p className="num font-mono text-[13px] text-ink-3">READINESS {latestFixed?.readinessScore ?? 100} / 100 · SPEND-WEIGHTED</p>
                ) : (
                  <p className="num font-mono text-[13px] text-ink-3">READINESS {latestLive?.readinessScore ?? 90} / 100 · SPEND-WEIGHTED</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-px border border-hairline bg-hairline sm:grid-cols-5">
                <RevealStat label="Campaign spend represented" value={dashboard ? <Money minor={dashboard.totalImportedSpendMinor} currency="GBP" /> : "£84,260"} />
                <RevealStat label="Associated with critical destinations" value={variant === "live" ? <Money minor={stats?.criticalSpendMinor ?? 1184000} currency="GBP" /> : "£0"} tone="critical" />
                <RevealStat label="Critical" value={String(stats?.criticalDestinations ?? (variant === "live" ? 4 : 0))} tone={variant === "live" ? "critical" : "healthy"} />
                <RevealStat label="Warnings" value={String(stats?.warningDestinations ?? (variant === "live" ? 8 : 0))} tone={variant === "live" ? "warning" : "healthy"} />
                <RevealStat label="Healthy" value={String(stats?.healthyDestinations ?? (variant === "live" ? 10 : 22))} tone="healthy" />
              </div>
              <p className="max-w-2xl text-[13px] leading-relaxed text-ink-2">
                {variant === "live"
                  ? "This dataset ships with deliberate issues: a 404, a dead hostname, stripped campaign parameters, and absent Meta tracking. Findings are ranked using the campaign spend associated with each destination — open any one to inspect its evidence."
                  : "All inspected destinations passed the current preflight rules. This state is synthetic — it illustrates the product's job, not a real repair."}
              </p>
            </div>
          </Sheet>
        ) : null}

        {/* The actual product surface, demo-scoped (progress while running,
            FIX THESE FIRST Money Map once complete) */}
        {isLoading || !activeScanId ? (
          scanning || starting ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-20 rounded-[2px] bg-paper-deep" />
              <Skeleton className="h-72 rounded-[2px] bg-paper-deep" />
              <p className="text-center text-[13px] text-ink-3">
                Scanning the synthetic campaign destinations — progress appears here.
              </p>
            </div>
          ) : null
        ) : (
          <DemoScanWrapper scanId={activeScanId} />
        )}

        {/* Guided path: see how the import actually works */}
        {!isLoading && hasResults ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border border-hairline bg-paper-raised px-4 py-3 sm:px-5">
            <p className="text-[13px] text-ink-2">
              Every number above started as a CSV import — mapping, validation and aggregation.
            </p>
            <Button size="sm" variant="outline" onClick={() => navigate({ view: "import", scope: "demo" })} className="gap-2">
              <FileUp size={13} aria-hidden="true" /> See campaign import
            </Button>
          </div>
        ) : null}

        <div ref={brandingRef}>
          <BrandingPlayground onViewReport={viewReport} reportPending={generateReport.isPending} />
        </div>

        {/* Reset — synthetic data, no confirmation needed */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-2">
          <p className="text-[12px] text-ink-3">
            The public demo is isolated to this browser session — your changes never affect another visitor.
          </p>
          <Button size="sm" variant="ghost" onClick={resetDemo} disabled={resetting} className="gap-2">
            <RotateCcw size={13} aria-hidden="true" /> {resetting ? "Resetting…" : "Reset demo"}
          </Button>
        </div>
      </div>

      <footer className="mt-auto border-t border-hairline bg-paper-raised">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <MicroLabel>LANDINGSENTINEL DEMO · SYNTHETIC DEMO DATA</MicroLabel>
          <button
            type="button"
            onClick={() => navigate({ view: "home" })}
            className="micro-label transition-colors hover:text-ink"
          >
            ← BACK TO PRODUCT SITE
          </button>
        </div>
      </footer>
    </div>
  );
}

function DemoScanWrapper({ scanId }: { scanId: string }) {
  // Re-renders ScanDetailView with a fresh key so the stamp animation
  // replays when switching between live/fixed states.
  return <ScanDetailView key={scanId} scope="demo" scanId={scanId} />;
}

function DemoStat({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="bg-paper-raised px-4 py-4 sm:px-5">
      <MicroLabel>{label.toUpperCase()}</MicroLabel>
      <span className="num mt-1 block font-mono text-2xl font-semibold tabular-nums text-ink">{value}</span>
      {note ? <p className="mt-0.5 text-[11px] leading-snug text-ink-3">{note}</p> : null}
    </div>
  );
}

function RevealStat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "critical" | "warning" | "healthy" }) {
  return (
    <div className="bg-paper-raised px-3 py-3 sm:px-4">
      <MicroLabel>{label.toUpperCase()}</MicroLabel>
      <span
        className={cn(
          "num mt-0.5 block font-mono text-xl font-semibold tabular-nums",
          tone === "critical" && "text-critical",
          tone === "warning" && "text-warning",
          tone === "healthy" && "text-healthy",
          !tone && "text-ink"
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** White-label playground: browser-local changes, never saved to a server. */
function BrandingPlayground({ onViewReport, reportPending }: { onViewReport: () => void; reportPending: boolean }) {
  const { data, isLoading } = useBranding("demo");
  const override = useDemoBranding((s) => s.override);
  const setOverride = useDemoBranding((s) => s.setOverride);
  const clearOverride = useDemoBranding((s) => s.clearOverride);
  const navigate = useRouter((s) => s.navigate);

  if (isLoading || !data) return null;
  const branding = data.branding;

  const values = {
    agencyName: override?.agencyName ?? branding.agencyName,
    productName: override?.productName ?? branding.productName,
    accentColor: override?.accentColor ?? branding.accentColor,
    reportFooter: override?.reportFooter ?? branding.reportFooter ?? "",
  };
  const dirty = override !== null;
  const accentOk = /^#[0-9a-fA-F]{6}$/.test(values.accentColor);
  const set = (patch: Partial<typeof values>) => setOverride({ ...values, ...patch });

  return (
    <Sheet label="WHITE-LABEL / PLAYGROUND" title="Rebrand the report — live" labelAside={<DossierLine items={["SYNTHETIC DEMO"]} />}>
      <div className="grid gap-4 px-4 py-4 sm:grid-cols-[1fr_auto] sm:px-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="play-agency" className="text-[12.5px] font-medium">Agency name</Label>
            <Input
              id="play-agency"
              value={values.agencyName}
              onChange={(e) => set({ agencyName: e.target.value })}
              className="mt-1 h-9 rounded-[2px] border-hairline bg-paper text-[12.5px]"
              placeholder="Your agency"
            />
          </div>
          <div>
            <Label htmlFor="play-product" className="text-[12.5px] font-medium">Product title</Label>
            <Input
              id="play-product"
              value={values.productName}
              onChange={(e) => set({ productName: e.target.value })}
              className="mt-1 h-9 rounded-[2px] border-hairline bg-paper text-[12.5px]"
              placeholder="LandingSentinel"
            />
          </div>
          <div>
            <Label htmlFor="play-accent" className="text-[12.5px] font-medium">Accent colour</Label>
            <Input
              id="play-accent"
              value={values.accentColor}
              onChange={(e) => set({ accentColor: e.target.value })}
              className={cn("mt-1 h-9 rounded-[2px] border-hairline bg-paper font-mono text-[12.5px]", !accentOk && "border-critical")}
              placeholder="#A7372D"
              aria-invalid={!accentOk}
            />
            {!accentOk ? <p className="mt-1 text-[11px] text-critical">Use a hex colour such as #1A6B54.</p> : null}
          </div>
          <div>
            <Label htmlFor="play-footer" className="text-[12.5px] font-medium">Report footer</Label>
            <Input
              id="play-footer"
              value={values.reportFooter}
              onChange={(e) => set({ reportFooter: e.target.value })}
              className="mt-1 h-9 rounded-[2px] border-hairline bg-paper text-[12.5px]"
              placeholder="Prepared by your agency"
            />
          </div>
        </div>
        <div className="flex flex-col items-stretch justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onViewReport} disabled={reportPending} className="gap-2">
            <FileText size={13} aria-hidden="true" /> {reportPending ? "Preparing…" : "View branded report"}
          </Button>
          {dirty ? (
            <Button size="sm" variant="ghost" onClick={clearOverride} className="gap-2">
              <Eraser size={13} aria-hidden="true" /> Revert changes
            </Button>
          ) : null}
        </div>
      </div>

      {/* Live masthead preview */}
      <div className="border-t border-hairline px-4 py-4 sm:px-5">
        <MicroLabel>REPORT MASTHEAD PREVIEW</MicroLabel>
        <div className="mt-2 border-2 bg-paper px-5 py-4" style={{ borderColor: accentOk ? values.accentColor : "#A7372D" }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-display text-lg font-bold leading-tight">{values.agencyName || "Your Agency"}</p>
              <p className="mt-0.5 text-[11.5px] text-ink-3">Campaign preflight report · prepared with {values.productName || "LandingSentinel"}</p>
            </div>
            <div className="text-right">
              <span className="micro-label">PREFLIGHT STATUS</span>
              <p className="font-mono mt-0.5 text-[13px] font-semibold" style={{ color: accentOk ? values.accentColor : "#A7372D" }}>
                DO NOT LAUNCH
              </p>
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="max-w-lg text-[12px] leading-relaxed text-ink-3">
            These demo changes stay in your browser and are not saved. In the purchased product, white-label
            settings persist per workspace and every generated report snapshots them.
          </p>
          <Button size="sm" variant="ghost" onClick={() => navigate({ view: "scanOne" })} className="hidden gap-1.5 sm:inline-flex">
            <ArrowRight size={13} aria-hidden="true" /> Scan a real page
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
