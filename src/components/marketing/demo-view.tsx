"use client";

/**
 * Public sales demo — no registration, entirely synthetic.
 *
 * Opens directly into the synthetic campaign preflight: the loaded import,
 * the Money Map of the latest scan, and the demo controls:
 *   · Run demo scan   — replays the fixture scan with staged progress
 *   · View after fixes — switches to the seeded post-remediation scan
 *   · Branding playground — edits white-label identity with live report preview
 *
 * The "SYNTHETIC DEMO DATA" label stays visible at all times.
 */

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useScanList, useStartScan, useBranding, useDashboard } from "@/lib/client/queries";
import { useRouter } from "@/store/router";
import { DemoBar } from "../app/app-shell";
import { ScanDetailView } from "../app/scan-detail";
import { Sheet, MicroLabel, DossierLine } from "@/components/paper/paper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { api } from "@/lib/client/api";
import { Radar, RefreshCw, FileText, ArrowRight, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export function DemoView() {
  const scope = "demo";
  const { data: scanList, isLoading } = useScanList(scope);
  const { data: dashboard } = useDashboard(scope);
  const startScan = useStartScan(scope);
  const navigate = useRouter((s) => s.navigate);
  const queryClient = useQueryClient();
  const [variant, setVariant] = useState<"live" | "fixed">("live");
  const [resetting, setResetting] = useState(false);

  const latestLive = useMemo(
    () => scanList?.scans.find((s) => s.variant === "live" && (s.state === "complete" || s.state === "partial")),
    [scanList]
  );
  const latestFixed = useMemo(
    () => scanList?.scans.find((s) => s.variant === "fixed" && (s.state === "complete" || s.state === "partial")),
    [scanList]
  );
  const activeScanId = variant === "live" ? latestLive?.id : latestFixed?.id;

  const runDemoScan = () => {
    startScan.mutate(
      { label: "Demo scan" },
      {
        onSuccess: ({ scanId }) => {
          setVariant("live");
          toast({ title: "Demo scan started", description: "Synthetic destinations are being inspected — watch the progress panel." });
          navigate({ view: "demo" });
          void scanId;
        },
        onError: (err) => toast({ title: "The demo scan could not start", description: err instanceof Error ? err.message : undefined }),
      }
    );
  };

  const resetDemo = async () => {
    setResetting(true);
    try {
      await api("/api/demo/reset", { method: "POST" });
      await queryClient.invalidateQueries();
      toast({ title: "Demo reset", description: "The synthetic dataset is back to its initial state." });
    } catch {
      toast({ title: "Reset failed", description: "The demo workspace could not be re-seeded." });
    } finally {
      setResetting(false);
    }
  };

  const starting = startScan.isPending;
  const scanning = scanList?.scans.some((s) => s.state === "running" || s.state === "pending");

  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-hairline bg-paper/95 backdrop-blur-[2px]">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <div>
            <p className="font-display text-[17px] font-bold leading-none tracking-tight">
              Campaign Preflight — Synthetic Demo
            </p>
            <DossierLine items={["NORTHSTAR OUTFITTERS — SYNTHETIC DEMO", "32 CAMPAIGN ROWS · 22 DESTINATIONS"]} className="mt-1" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={runDemoScan} disabled={starting || scanning} className="gap-2">
              <Radar size={14} aria-hidden="true" /> {starting || scanning ? "Scanning…" : "Run demo scan"}
            </Button>
            <Button
              size="sm"
              variant={variant === "fixed" ? "default" : "outline"}
              onClick={() => setVariant(variant === "live" ? "fixed" : "live")}
              className="gap-2"
              aria-pressed={variant === "fixed"}
            >
              <RefreshCw size={14} aria-hidden="true" />
              {variant === "live" ? "View after fixes" : "View live state"}
            </Button>
          </div>
        </div>
        <DemoBar />
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8">
        {/* Demo control sheet */}
        <Sheet
          label="DEMO / CONTROLS"
          title={variant === "live" ? "Live synthetic state — issues present" : "After fixes — synthetic remediated state"}
          labelAside={
            <DossierLine
              items={[
                variant === "live" ? "STAMP: DO NOT LAUNCH" : "STAMP: LAUNCH READY",
                variant === "live" ? "4 CRITICAL DESTINATIONS · £11,840" : "0 CRITICAL · 0 WARNINGS",
              ]}
            />
          }
        >
          <div className="grid gap-px bg-hairline sm:grid-cols-3">
            <DemoStat label="Campaign spend represented" value={variant === "live" ? "£84,260" : "£84,260"} note="Synthetic monthly campaign data" />
            <DemoStat
              label={variant === "live" ? "Associated with critical destinations" : "Associated with critical destinations"}
              value={variant === "live" ? "£11,840" : "£0"}
              note={variant === "live" ? "4 destinations with confirmed critical findings" : "All critical findings resolved (synthetic)"}
              tone={variant === "live" ? "critical" : "healthy"}
            />
            <DemoStat
              label={variant === "live" ? "Warnings" : "Warnings"}
              value={variant === "live" ? "9" : "0"}
              note={variant === "live" ? "Across 8 destinations" : "All warnings resolved (synthetic)"}
              tone={variant === "live" ? "warning" : "healthy"}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-4 py-3 sm:px-5">
            <p className="max-w-xl text-[12.5px] leading-relaxed text-ink-2">
              {variant === "live"
                ? "This dataset ships with deliberate issues: a 404, a dead hostname, stripped campaign parameters, and absent Meta tracking. Open any finding to inspect its evidence."
                : "The same dataset after synthetic remediation: every destination returns a valid page with tracking installed. This state illustrates the product's job — it is not a real repair."}
            </p>
            <div className="flex flex-wrap gap-2">
              {dashboard?.latestReportId ? (
                <Button size="sm" variant="outline" onClick={() => navigate({ view: "report", reportId: dashboard.latestReportId! })} className="gap-2">
                  <FileText size={13} aria-hidden="true" /> Open branded report
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={resetDemo} disabled={resetting} className="gap-2">
                <RotateCcw size={13} aria-hidden="true" /> {resetting ? "Resetting…" : "Reset demo"}
              </Button>
            </div>
          </div>
        </Sheet>

        {/* The actual product surface, demo-scoped */}
        {isLoading || !activeScanId ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-20 rounded-[2px] bg-paper-deep" />
            <Skeleton className="h-72 rounded-[2px] bg-paper-deep" />
            <p className="text-center text-[13px] text-ink-3">
              {scanning ? "A demo scan is running — results will appear here." : "Preparing the synthetic dataset…"}
            </p>
          </div>
        ) : (
          <DemoScanWrapper scanId={activeScanId} />
        )}

        <BrandingPlayground />
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

function DemoStat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "critical" | "warning" | "healthy" }) {
  return (
    <div className="bg-paper-raised px-4 py-4 sm:px-5">
      <MicroLabel>{label.toUpperCase()}</MicroLabel>
      <span
        className={cn(
          "num mt-1 block font-mono text-2xl font-semibold tabular-nums",
          tone === "critical" && "text-critical",
          tone === "warning" && "text-warning",
          tone === "healthy" && "text-healthy"
        )}
      >
        {value}
      </span>
      {note ? <p className="mt-0.5 text-[11px] leading-snug text-ink-3">{note}</p> : null}
    </div>
  );
}

/** White-label playground: edit identity, preview the report masthead live. */
function BrandingPlayground() {
  const { data, isLoading, mutation } = useBranding("demo");
  const queryClient = useQueryClient();
  const navigate = useRouter((s) => s.navigate);
  const [form, setForm] = useState<{ agencyName: string; accentColor: string; productName: string } | null>(null);

  if (isLoading || !data) return null;
  const branding = data.branding;
  const values = form ?? {
    agencyName: branding.agencyName,
    accentColor: branding.accentColor,
    productName: branding.productName,
  };
  const dirty = form !== null;
  const accentOk = /^#[0-9a-fA-F]{6}$/.test(values.accentColor);

  const save = () => {
    mutation.mutate(
      {
        agencyName: values.agencyName,
        productName: values.productName,
        ...(accentOk ? { accentColor: values.accentColor } : {}),
      },
      {
        onSuccess: () => {
          toast({ title: "Branding saved", description: "Open the branded report to see it applied." });
          setForm(null);
          queryClient.invalidateQueries({ queryKey: ["report", "demo"] });
          queryClient.invalidateQueries({ queryKey: ["branding", "demo"] });
        },
      }
    );
  };

  return (
    <Sheet label="WHITE-LABEL / PLAYGROUND" title="Rebrand the report — live" labelAside="Synthetic demo">
      <div className="grid gap-4 px-4 py-4 sm:grid-cols-[1fr_auto] sm:px-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="play-agency" className="text-[12.5px] font-medium">Agency name</Label>
            <Input
              id="play-agency"
              value={values.agencyName}
              onChange={(e) => setForm({ ...values, agencyName: e.target.value })}
              className="mt-1 h-9 rounded-[2px] border-hairline bg-paper text-[12.5px]"
              placeholder="Your agency"
            />
          </div>
          <div>
            <Label htmlFor="play-product" className="text-[12.5px] font-medium">Product title</Label>
            <Input
              id="play-product"
              value={values.productName}
              onChange={(e) => setForm({ ...values, productName: e.target.value })}
              className="mt-1 h-9 rounded-[2px] border-hairline bg-paper text-[12.5px]"
              placeholder="LandingSentinel"
            />
          </div>
          <div>
            <Label htmlFor="play-accent" className="text-[12.5px] font-medium">Accent colour</Label>
            <Input
              id="play-accent"
              value={values.accentColor}
              onChange={(e) => setForm({ ...values, accentColor: e.target.value })}
              className={cn("mt-1 h-9 rounded-[2px] border-hairline bg-paper font-mono text-[12.5px]", !accentOk && dirty && "border-critical")}
              placeholder="#A7372D"
              aria-invalid={dirty && !accentOk}
            />
            {!accentOk && dirty ? <p className="mt-1 text-[11px] text-critical">Use a hex colour such as #1A6B54.</p> : null}
          </div>
        </div>
        <div className="flex items-end">
          <Button size="sm" onClick={save} disabled={!dirty || mutation.isPending} className="gap-2">
            {mutation.isPending ? "Saving…" : "Apply to demo report"}
          </Button>
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
        <div className="mt-3 flex items-center justify-between">
          <p className="max-w-lg text-[12px] leading-relaxed text-ink-3">
            The demo report uses live branding so changes preview immediately. Reports you generate in a real
            workspace snapshot the branding at generation time.
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate({ view: "report", reportId: "latest" })}
            className="gap-1.5"
            hidden
          >
            <ArrowRight size={13} aria-hidden="true" /> Open report
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
