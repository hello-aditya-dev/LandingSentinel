"use client";

/**
 * Scan summary + Money Map.
 *
 * The Money Map is a ranked destination ledger: severity first, then
 * associated spend descending. Spend exposure is visualised as a single
 * horizontal bar (critical / warning / healthy proportions of represented
 * spend) — the table is the primary instrument.
 *
 * While a scan runs, targets show genuine backend stages (dns, request,
 * redirects, inspect, persist) polled from the database — no fake stages.
 */

import { useMemo, useState } from "react";
import { useScanDetail, useGenerateReport } from "@/lib/client/queries";
import { useRouter } from "@/store/router";
import { Sheet, MicroLabel, DossierLine, MarginNote } from "@/components/paper/paper";
import { StatusStamp, SeverityBadge, StatusCell } from "@/components/paper/stamp";
import { Money, CopyButton } from "@/components/paper/evidence";
import { stampStatus } from "./dashboard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Radar,
  FileText,
  ArrowUpDown,
  Search,
  FileSearch,
  TriangleAlert,
  OctagonX,
  Info,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { MoneyMapRow } from "@/lib/services/queries";

type StatusFilter = "all" | "critical" | "warning" | "healthy";
type PlatformFilter = "all" | "google" | "meta" | "tiktok" | "linkedin" | "other";

const PLATFORM_LABELS: Record<string, string> = {
  google: "Google",
  meta: "Meta",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
};

export function ScanDetailView({ scope, scanId }: { scope: "demo" | "app"; scanId: string }) {
  const { data, isLoading, isError, error } = useScanDetail(scope, scanId);
  const navigate = useRouter((s) => s.navigate);
  const generateReport = useGenerateReport(scope);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [sortBy, setSortBy] = useState<"severity" | "spend">("severity");

  const filtered = useMemo(() => {
    const moneyMap = data?.moneyMap ?? [];
    let rows = moneyMap.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (platformFilter !== "all") {
        const has = row.platforms.some((p) => p.includes(platformFilter));
        if (!has) return false;
      }
      return true;
    });
    if (sortBy === "spend") {
      rows = [...rows].sort((a, b) => b.associatedSpendMinor - a.associatedSpendMinor);
    }
    return rows;
  }, [data?.moneyMap, statusFilter, platformFilter, sortBy]);

  if (isError) {
    return (
      <Sheet label="ERROR" title="This scan could not be loaded">
        <p className="px-4 py-4 text-[13.5px] text-critical sm:px-5">
          {error instanceof Error ? error.message : "The scan does not exist."}
        </p>
      </Sheet>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-24 rounded-[2px] bg-paper-deep" />
        <Skeleton className="h-10 rounded-[2px] bg-paper-deep" />
        <Skeleton className="h-64 rounded-[2px] bg-paper-deep" />
      </div>
    );
  }

  const { scan, moneyMap, targets, campaignsByDestination } = data;
  const running = scan.state === "running" || scan.state === "pending";
  const stats = scan.stats;
  const completedCount = targets.filter((t) => t.state === "complete" || t.state === "failed").length;
  const current = targets.find((t) => t.state === "running");

  const totalSpend = moneyMap.reduce((s, r) => s + r.associatedSpendMinor, 0);
  const criticalSpend = stats?.criticalSpendMinor ?? 0;
  const warningSpend = stats?.warningSpendMinor ?? 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Scan header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => navigate({ view: "scans" })}
            className="micro-label transition-colors hover:text-ink"
          >
            ← SCAN HISTORY
          </button>
          <h1 className="font-display mt-1 text-2xl font-bold leading-tight tracking-tight sm:text-[28px]">
            {scan.label ?? "Preflight scan"}
          </h1>
          <DossierLine
            items={[
              `SCAN / ${scan.id.slice(-6).toUpperCase()}`,
              new Date(scan.startedAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
              scan.engine === "demo-fixture" ? "FIXTURE ENGINE · SYNTHETIC" : "REAL ENGINE",
              scan.state === "partial" ? `PARTIAL — ${(stats?.failedTargets ?? 0)} DESTINATIONS FAILED SAFELY` : scan.state.toUpperCase(),
            ]}
            className="mt-1.5"
          />
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <StatusStamp status={stampStatus(scan.preflightStatus)} size="lg" animated={!running} rotation={-3} />
          <div className="flex items-center gap-2 print:hidden">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                generateReport.mutate(
                  { scanId: scan.id },
                  {
                    onSuccess: ({ reportId }) => {
                      toast({ title: "Report ready", description: "The branded client report has been generated." });
                      navigate({ view: "report", reportId });
                    },
                    onError: (err) =>
                      toast({ title: "The report could not be generated", description: err instanceof Error ? err.message : undefined }),
                  }
                );
              }}
              disabled={running || generateReport.isPending}
              className="gap-2"
            >
              <FileText size={14} aria-hidden="true" /> {data.latestReportId ? "View report" : "Generate report"}
            </Button>
          </div>
        </div>
      </div>

      {/* Progress panel while running */}
      {running ? (
        <ProgressPanel
          total={targets.length}
          completed={completedCount}
          currentKey={current?.normalizedKey ?? null}
          currentStage={current?.stage ?? null}
          targets={targets}
        />
      ) : (
        <MetricsRow scan={scan} />
      )}

      {/* Spend exposure bar */}
      {!running && moneyMap.length > 0 ? (
        <Sheet label="EXPOSURE / SPEND" title="Spend exposure by destination status">
          <div className="px-4 py-4 sm:px-5">
            <div className="flex h-4 w-full overflow-hidden border border-hairline" role="img" aria-label="Spend exposure bar">
              {totalSpend > 0 ? (
                <>
                  <div className="bg-critical" style={{ width: `${(criticalSpend / totalSpend) * 100}%` }} title="Critical" />
                  <div className="bg-warning" style={{ width: `${(warningSpend / totalSpend) * 100}%` }} title="Warning" />
                  <div className="bg-healthy" style={{ width: `${((totalSpend - criticalSpend - warningSpend) / totalSpend) * 100}%` }} title="Healthy" />
                </>
              ) : (
                <div className="bg-paper-deep" style={{ width: "100%" }} />
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
              <ExposureLegend label="Critical-associated spend" minor={criticalSpend} currency={scan.currency} tone="critical" />
              <ExposureLegend label="Warning-associated spend" minor={warningSpend} currency={scan.currency} tone="warning" />
              <ExposureLegend label="Healthy destinations" minor={totalSpend - criticalSpend - warningSpend} currency={scan.currency} tone="healthy" />
            </div>
            <MarginNote className="mt-3">
              Spend is counted once per destination. A destination with both critical and warning findings counts towards
              critical only — the same money is never counted twice.
            </MarginNote>
          </div>
        </Sheet>
      ) : null}

      {/* Money Map */}
      <Sheet
        label="MONEY MAP"
        title="Destinations ranked by severity and associated spend"
        labelAside={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <button
              type="button"
              onClick={() => setSortBy(sortBy === "severity" ? "spend" : "severity")}
              className="micro-label flex items-center gap-1.5 border border-hairline px-2 py-1 transition-colors hover:border-hairline-strong hover:text-ink"
              aria-label={`Currently sorting by ${sortBy}. Switch to sorting by ${sortBy === "severity" ? "spend" : "severity"}.`}
            >
              <ArrowUpDown size={11} aria-hidden="true" />
              SORT · {sortBy === "severity" ? "SEVERITY" : "SPEND"}
            </button>
            <CopyButton
              text={moneyMap
                .map((r) => `${r.priority}\t${r.normalizedKey}\t${(r.associatedSpendMinor / 100).toFixed(2)}\t${r.status}`)
                .join("\n")}
              label="Copy Money Map as text"
            />
          </div>
        }
      >
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hairline px-4 py-2.5 sm:px-5 print:hidden">
          <div className="flex items-center gap-1" role="group" aria-label="Filter by status">
            {(["all", "critical", "warning", "healthy"] as StatusFilter[]).map((f) => (
              <FilterChip key={f} active={statusFilter === f} onClick={() => setStatusFilter(f)}>
                {f === "all" ? "All" : f === "critical" ? "Critical" : f === "warning" ? "Warning" : "Healthy"}
              </FilterChip>
            ))}
          </div>
          <div className="flex items-center gap-1" role="group" aria-label="Filter by platform">
            {(["all", "google", "meta", "tiktok", "linkedin"] as PlatformFilter[]).map((f) => (
              <FilterChip key={f} active={platformFilter === f} onClick={() => setPlatformFilter(f)}>
                {f === "all" ? "All platforms" : (PLATFORM_LABELS[f] ?? f)}
              </FilterChip>
            ))}
          </div>
          <span className="micro-label ml-auto">{filtered.length} / {moneyMap.length} DESTINATIONS</span>
        </div>

        {filtered.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-6 text-[13px] text-ink-3 sm:px-5">
            <Search size={14} aria-hidden="true" />
            No destinations match these filters.
          </div>
        ) : (
          <>
            {/* Desktop ledger table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[880px] border-collapse text-left">
                <thead className="sticky top-[57px] z-10 bg-paper-raised">
                  <tr className="border-b border-hairline-strong">
                    <th scope="col" className="micro-label px-3 py-2 text-left">#</th>
                    <th scope="col" className="micro-label px-3 py-2 text-left">DESTINATION</th>
                    <th scope="col" className="micro-label px-3 py-2 text-right">ASSOCIATED SPEND</th>
                    <th scope="col" className="micro-label px-3 py-2 text-center">CAMPAIGNS</th>
                    <th scope="col" className="micro-label px-3 py-2 text-left">STATUS</th>
                    <th scope="col" className="micro-label px-3 py-2 text-left">PRIMARY FINDING</th>
                    <th scope="col" className="micro-label px-3 py-2 text-left">LAST SCAN</th>
                    <th scope="col" className="micro-label px-3 py-2 text-right print:hidden">EVIDENCE</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <MoneyMapRowDesktop
                      key={row.scanTargetId}
                      row={row}
                      campaigns={campaignsByDestination[row.destinationId] ?? []}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile ledger cards */}
            <div className="md:hidden">
              {filtered.map((row) => (
                <MoneyMapRowMobile
                  key={row.scanTargetId}
                  row={row}
                  campaigns={campaignsByDestination[row.destinationId] ?? []}
                />
              ))}
            </div>
          </>
        )}
      </Sheet>

      <MarginNote>
        Associated spend describes the campaign money that reaches each destination through imported campaign rows.
        It is not a measurement of lost revenue.
      </MarginNote>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function MetricsRow({ scan }: { scan: { currency: string; totalSpendMinor: number; stats: { criticalFindings: number; warningFindings: number; infoFindings: number; criticalDestinations: number; warningDestinations: number; healthyDestinations: number; criticalSpendMinor: number } | null; readinessScore: number | null } }) {
  const stats = scan.stats;
  return (
    <div className="grid grid-cols-2 gap-px border border-hairline bg-hairline sm:grid-cols-4">
      <StatCell label="Spend represented" value={<Money minor={scan.totalSpendMinor} currency={scan.currency} exact />} />
      <StatCell label="Critical findings" value={String(stats?.criticalFindings ?? 0)} tone="critical" />
      <StatCell label="Warning findings" value={String(stats?.warningFindings ?? 0)} tone="warning" />
      <StatCell label="Readiness score" value={`${scan.readinessScore ?? "—"}/100`} />
    </div>
  );
}

function StatCell({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "critical" | "warning" }) {
  return (
    <div className="bg-paper-raised px-4 py-3 sm:px-5">
      <span className="micro-label">{label}</span>
      <div className={cn("num mt-1 font-mono text-lg font-semibold tabular-nums", tone === "critical" && "text-critical", tone === "warning" && "text-warning")}>
        {value}
      </div>
    </div>
  );
}

function ExposureLegend({ label, minor, currency, tone }: { label: string; minor: number; currency: string; tone: "critical" | "warning" | "healthy" }) {
  const dot = tone === "critical" ? "bg-critical" : tone === "warning" ? "bg-warning" : "bg-healthy";
  return (
    <span className="flex items-center gap-2 text-[12.5px] text-ink-2">
      <span aria-hidden="true" className={cn("inline-block h-2.5 w-2.5", dot)} />
      {label}
      <Money minor={minor} currency={currency} className="text-[13px] font-semibold text-ink" exact />
    </span>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "border px-2.5 py-1 text-[12px] font-medium transition-colors",
        active ? "border-ink bg-ink text-paper" : "border-hairline text-ink-2 hover:border-hairline-strong hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

/* ---------------- Money Map rows ---------------- */

function PrimaryFindingCell({ row }: { row: MoneyMapRow }) {
  if (!row.primaryFinding) {
    return (
      <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
        <Info size={12} aria-hidden="true" /> All checks passed
      </span>
    );
  }
  const severity = row.primaryFinding.severity as "critical" | "warning" | "info";
  const Icon = severity === "critical" ? OctagonX : severity === "warning" ? TriangleAlert : Info;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Icon
        size={13}
        aria-hidden="true"
        className={severity === "critical" ? "text-critical" : severity === "warning" ? "text-warning" : "text-ink-3"}
      />
      <span className="truncate text-[12.5px] text-ink" title={row.primaryFinding.title}>
        {row.primaryFinding.title}
      </span>
    </span>
  );
}

function MoneyMapRowDesktop({ row, campaigns }: { row: MoneyMapRow; campaigns: { platform: string | null; campaignName: string | null; spendMinor: number; currency: string }[] }) {
  const navigate = useRouter((s) => s.navigate);
  return (
    <tr
      className={cn(
        "ledger-row align-top transition-colors",
        row.status === "critical" && "bg-critical-wash/40",
        row.status === "warning" && "bg-warning-wash/30"
      )}
    >
      <td className="num px-3 py-3 font-mono text-[12px] text-ink-3">{String(row.priority).padStart(2, "0")}</td>
      <td className="px-3 py-3">
        <DestinationCell row={row} campaigns={campaigns} />
      </td>
      <td className="px-3 py-3 text-right">
        <Money minor={row.associatedSpendMinor} currency={row.currency} exact className="text-[13px] font-semibold" />
        {campaigns.length > 1 ? (
          <div className="micro-label mt-0.5">{campaigns.length} CAMPAIGN ROWS</div>
        ) : null}
      </td>
      <td className="px-3 py-3 text-center">
        <PlatformDots platforms={row.platforms} />
      </td>
      <td className="px-3 py-3">
        <StatusCell status={row.status} />
        {row.httpStatus !== null && row.httpStatus >= 400 ? (
          <div className="micro-label mt-1 text-critical">HTTP {row.httpStatus}</div>
        ) : null}
      </td>
      <td className="max-w-[240px] px-3 py-3">
        <PrimaryFindingCell row={row} />
      </td>
      <td className="px-3 py-3 font-mono text-[11.5px] text-ink-3">
        {row.lastScanAt ? new Date(row.lastScanAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}
      </td>
      <td className="px-3 py-3 text-right print:hidden">
        {row.primaryFinding ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 px-2 text-[11.5px]"
            onClick={() => navigate({ view: "finding", findingId: row.primaryFinding!.id })}
          >
            <FileSearch size={12} aria-hidden="true" /> Open
          </Button>
        ) : (
          <span className="micro-label">CLEAN</span>
        )}
      </td>
    </tr>
  );
}

function MoneyMapRowMobile({ row, campaigns }: { row: MoneyMapRow; campaigns: { platform: string | null; campaignName: string | null; spendMinor: number; currency: string }[] }) {
  const navigate = useRouter((s) => s.navigate);
  return (
    <div className={cn("border-b border-hairline px-4 py-3", row.status === "critical" && "bg-critical-wash/40", row.status === "warning" && "bg-warning-wash/30")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="num font-mono text-[10px] text-ink-3">{String(row.priority).padStart(2, "0")} · {row.hostname}</span>
          <p className="url-wrap font-mono text-[12.5px] text-ink">{row.pathname === "/" ? "/" : row.pathname}</p>
        </div>
        <StatusCell status={row.status} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <Money minor={row.associatedSpendMinor} currency={row.currency} exact className="text-[13px] font-semibold" />
        <PlatformDots platforms={row.platforms} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <PrimaryFindingCell row={row} />
        </div>
        {row.primaryFinding ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0 gap-1 px-2 text-[11.5px]"
            onClick={() => navigate({ view: "finding", findingId: row.primaryFinding!.id })}
          >
            <FileSearch size={12} aria-hidden="true" /> Open
          </Button>
        ) : null}
      </div>
      {campaigns.length > 0 ? <CampaignsInline campaigns={campaigns} destinationId={row.destinationId} /> : null}
    </div>
  );
}

function CampaignsInline({ campaigns, destinationId }: { campaigns: { platform: string | null; campaignName: string | null; spendMinor: number; currency: string }[]; destinationId: string }) {
  const [open, setOpen] = useState(false);
  if (campaigns.length <= 1) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="micro-label mt-2 border-b border-dotted border-hairline-strong text-ink-2 transition-colors hover:text-ink">
          {campaigns.length} CAMPAIGN ROWS →
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg rounded-[2px] border-hairline bg-paper-raised">
        <DialogHeader>
          <DialogTitle className="font-display text-left text-base">Campaigns touching this destination</DialogTitle>
        </DialogHeader>
        <CampaignsPanel campaigns={campaigns} destinationId={destinationId} />
      </DialogContent>
    </Dialog>
  );
}

export function CampaignsPanel({ campaigns, destinationId }: { campaigns: { platform: string | null; campaignName: string | null; spendMinor: number; currency: string }[]; destinationId?: string }) {
  const total = campaigns.reduce((s, c) => s + c.spendMinor, 0);
  const currency = campaigns[0]?.currency ?? "GBP";
  return (
    <div>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-hairline">
            <th scope="col" className="micro-label px-2 py-1.5">PLATFORM</th>
            <th scope="col" className="micro-label px-2 py-1.5">CAMPAIGN</th>
            <th scope="col" className="micro-label px-2 py-1.5 text-right">SPEND</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c, i) => (
            <tr key={`${destinationId ?? "d"}-${i}`} className="border-b border-hairline last:border-b-0">
              <td className="px-2 py-2 text-[12.5px] text-ink-2">{c.platform ?? "—"}</td>
              <td className="px-2 py-2 text-[12.5px] text-ink">{c.campaignName ?? "—"}</td>
              <td className="px-2 py-2 text-right">
                <Money minor={c.spendMinor} currency={c.currency} exact className="text-[12.5px]" />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-hairline-strong">
            <td colSpan={2} className="px-2 py-2 text-[12px] font-semibold uppercase tracking-wide text-ink-2">Total</td>
            <td className="px-2 py-2 text-right">
              <Money minor={total} currency={currency} exact className="text-[13px] font-semibold" />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function DestinationCell({ row, campaigns }: { row: MoneyMapRow; campaigns: unknown[] }) {
  return (
    <div className="min-w-0">
      <p className="url-wrap font-mono text-[12.5px] font-medium text-ink">
        {row.hostname}
        <span className="text-ink-2">{row.pathname === "/" ? "/" : row.pathname}</span>
      </p>
      {campaigns.length > 1 ? null : null}
      {row.finalUrl && row.finalUrl !== row.representativeUrl ? (
        <p className="url-wrap mt-0.5 font-mono text-[11px] text-ink-3">→ {row.finalUrl}</p>
      ) : null}
    </div>
  );
}

function PlatformDots({ platforms }: { platforms: string[] }) {
  if (platforms.length === 0) return <span className="micro-label">—</span>;
  const short: Record<string, string> = { google: "G", meta: "M", tiktok: "T", linkedin: "L" };
  return (
    <span className="inline-flex items-center gap-1" title={platforms.join(", ")}>
      {platforms.slice(0, 4).map((p) => (
        <span key={p} className="inline-flex h-5 w-5 items-center justify-center border border-hairline bg-paper font-mono text-[10px] font-semibold text-ink-2">
          {short[p.toLowerCase()] ?? "?"}
        </span>
      ))}
    </span>
  );
}

/* ---------------- Progress panel ---------------- */

const STAGE_LABELS: Record<string, string> = {
  dns: "Checking DNS",
  request: "Requesting",
  redirects: "Inspecting redirect",
  inspect: "Inspecting page",
  persist: "Persisting results",
};

function ProgressPanel({
  total,
  completed,
  currentKey,
  currentStage,
  targets,
}: {
  total: number;
  completed: number;
  currentKey: string | null;
  currentStage: string | null;
  targets: { id: string; state: string; stage: string | null; normalizedKey: string }[];
}) {
  return (
    <Sheet label="SCAN / PROGRESS" title={`Scanning ${total} destination${total === 1 ? "" : "s"}`}>
      <div className="px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="num font-mono text-lg font-semibold tabular-nums">
            {String(completed).padStart(2, "0")} / {total} complete
          </p>
          {currentKey ? (
            <p className="url-wrap font-mono text-[12px] text-ink-2">
              Current: <span className="text-ink">{currentKey}</span>
              {currentStage ? <span className="text-ink-3"> · {STAGE_LABELS[currentStage] ?? currentStage}</span> : null}
            </p>
          ) : (
            <p className="font-mono text-[12px] text-ink-3">Finishing…</p>
          )}
        </div>
        <div className="mt-3 h-1.5 w-full border border-hairline bg-paper-deep">
          <div
            className="h-full bg-ink transition-[width] duration-500"
            style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
            role="progressbar"
            aria-valuenow={completed}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label="Scan progress"
          />
        </div>

        <ul className="thin-scroll mt-4 max-h-72 overflow-y-auto border border-hairline bg-paper-raised">
          {targets.map((t) => (
            <li
              key={t.id}
              className={cn(
                "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-hairline px-3 py-2 last:border-b-0",
                t.state === "running" && "inspect-row"
              )}
            >
              <span className="url-wrap min-w-0 flex-1 font-mono text-[12px] text-ink">{t.normalizedKey}</span>
              <TargetState state={t.state} stage={t.stage} />
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}

function TargetState({ state, stage }: { state: string; stage: string | null }) {
  if (state === "queued") return <span className="micro-label">QUEUED</span>;
  if (state === "running")
    return (
      <span className="flex items-center gap-2">
        <Radar size={12} className="animate-pulse text-evidence" aria-hidden="true" />
        <span className="micro-label !text-evidence">{STAGE_LABELS[stage ?? ""] ?? "WORKING"}</span>
      </span>
    );
  if (state === "failed")
    return (
      <span className="micro-label !text-critical">FAILED SAFELY</span>
    );
  return <span className="micro-label !text-healthy">COMPLETE</span>;
}
