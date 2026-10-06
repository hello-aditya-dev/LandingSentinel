"use client";

/**
 * Campaign operations desk: spend exposure, preflight status of the latest
 * scan, import history. Empty states are designed, not accidental.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useDashboard, useStartScan } from "@/lib/client/queries";
import { useAppNavigate } from "@/lib/nav";
import { Sheet, MicroLabel, DossierLine, MarginNote } from "@/components/paper/paper";
import { StatusStamp } from "@/components/paper/stamp";
import { MetricFigure, Money } from "@/components/paper/evidence";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileUp, Radar, FileText, AlertTriangle, ArrowRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function DashboardView({ scope }: { scope: "demo" | "app" }) {
  const { data, isLoading, isError, error } = useDashboard(scope);
  const navigate = useAppNavigate();
  const startScan = useStartScan(scope);
  const queryClient = useQueryClient();

  if (isError) {
    return (
      <Sheet label="SYSTEM" title="The dashboard could not load">
        <div className="px-4 py-4 sm:px-5">
          <p className="text-[13.5px] text-critical">{error instanceof Error ? error.message : "The server did not respond."}</p>
          <MarginNote className="mt-2">
            Check that the database is reachable and that the schema migration has been applied
            (<span className="font-mono text-[12px]">npm run db:migrate</span>).
          </MarginNote>
        </div>
      </Sheet>
    );
  }

  const loading = isLoading || !data;
  const scan = data?.latestScan ?? null;
  const stats = scan?.stats ?? null;

  const runScan = () => {
    if (!data || data.destinationCount === 0) {
      toast({
        title: "No destinations to scan",
        description: "Import a campaign CSV first — the scan covers every imported destination.",
      });
      return;
    }
    // The scan runs inside the request — surface it immediately in the
    // scans list, where its persisted state is polled live.
    queryClient.invalidateQueries({ queryKey: ["scans", scope] });
    navigate({ view: "scans" });
    startScan.mutate(
      { label: scope === "demo" ? "Demo scan" : "Preflight scan" },
      {
        onSuccess: ({ scanId }) => {
          toast({ title: "Scan complete", description: "Every destination was inspected — the results are ready." });
          navigate({ view: "scan", scanId });
        },
        onError: (err) => toast({ title: "The scan could not run", description: err instanceof Error ? err.message : undefined }),
      }
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Action header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <MicroLabel>OVERVIEW / {data?.client?.name?.toUpperCase() ?? "WORKSPACE"}</MicroLabel>
          <h1 className="font-display mt-1 text-2xl font-bold leading-tight tracking-tight sm:text-[30px]">
            Campaign preflight desk
          </h1>
          <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-2">
            Imported spend, aggregated by landing-page destination. Findings are ranked by severity and associated spend.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => navigate({ view: "import" })} className="gap-2">
            <FileUp size={14} aria-hidden="true" /> Import campaigns
          </Button>
          <Button size="sm" onClick={runScan} disabled={loading || startScan.isPending} className="gap-2">
            <Radar size={14} aria-hidden="true" /> {startScan.isPending ? "Starting scan…" : "Run scan"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-[2px] bg-paper-deep" />
          ))}
        </div>
      ) : !scan ? (
        <EmptyDashboard />
      ) : (
        <>
          {/* Metric row */}
          <div className="grid grid-cols-2 gap-px border border-hairline bg-hairline sm:grid-cols-3 lg:grid-cols-5">
            <MetricCell label="Spend represented" minor={scan.totalSpendMinor} currency={scan.currency} note={`${data.destinationCount} destinations · ${data.importBatches.reduce((s, b) => s + b.campaignRowCount, 0)} campaign rows`} />
            <MetricCell label="Associated with critical destinations" minor={stats?.criticalSpendMinor ?? 0} currency={scan.currency} tone="critical" note="Spend on destinations with confirmed critical findings" />
            <MetricCell label="Critical destinations" minor={stats?.criticalDestinations ?? 0} currency="" raw />
            <MetricCell label="Warning destinations" minor={stats?.warningDestinations ?? 0} currency="" raw />
            <MetricCell label="Healthy destinations" minor={stats?.healthyDestinations ?? 0} currency="" raw />
          </div>

          {/* Latest scan summary */}
          <Sheet
            label={`SCAN / ${scan.id.slice(-4).toUpperCase()}`}
            title={scan.label ?? "Preflight scan"}
            labelAside={
              <DossierLine
                items={[
                  scan.state === "partial" ? "Partial — some destinations failed safely" : scan.state,
                  new Date(scan.startedAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
                  scan.demo ? "Synthetic demo data" : null,
                ]}
              />
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-6 px-4 py-5 sm:px-5">
              <div className="flex flex-col gap-3">
                <StatusStamp status={stampStatus(scan.preflightStatus)} />
                <p className="max-w-md text-[13.5px] leading-relaxed text-ink-2">
                  {scan.preflightStatus === "DO_NOT_LAUNCH"
                    ? "At least one confirmed critical finding exists. Resolve critical destinations before launch."
                    : scan.preflightStatus === "REVIEW_BEFORE_LAUNCH"
                      ? "No critical findings. At least one warning needs review before launch."
                      : "No critical or warning findings. Informational notes may remain."}
                </p>
              </div>
              <div className="flex items-end gap-8">
                <div className="flex flex-col gap-1">
                  <MicroLabel>READINESS SCORE</MicroLabel>
                  <span className="num font-mono text-3xl font-semibold tabular-nums">
                    {scan.readinessScore ?? "—"}
                    <span className="text-base text-ink-3">/100</span>
                  </span>
                  <span className="max-w-[220px] text-[11px] leading-snug text-ink-3">
                    Spend-weighted. The status stamp takes precedence over the score.
                  </span>
                </div>
                <div className="flex flex-col gap-2 print:hidden">
                  <Button size="sm" variant="outline" onClick={() => navigate({ view: "scan", scanId: scan.id })} className="gap-2">
                    Open Money Map <ArrowRight size={14} aria-hidden="true" />
                  </Button>
                  {data.latestReportId ? (
                    <Button size="sm" variant="ghost" onClick={() => navigate({ view: "report", reportId: data.latestReportId! })} className="gap-2">
                      <FileText size={14} aria-hidden="true" /> View report
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </Sheet>

          {/* Import history */}
          <Sheet label="IMPORTS" title="Campaign imports" labelAside={`${data.importBatches.length} file${data.importBatches.length === 1 ? "" : "s"}`}>
            {data.importBatches.length === 0 ? (
              <p className="px-4 py-4 text-[13px] text-ink-3 sm:px-5">No imports yet.</p>
            ) : (
              <ul>
                {data.importBatches.map((batch) => (
                  <li key={batch.id} className="ledger-row flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-4 py-3 sm:px-5">
                    <div className="min-w-0">
                      <p className="url-wrap font-mono text-[12.5px] text-ink">{batch.filename}</p>
                      <DossierLine
                        items={[
                          batch.platform ?? "Platform not set",
                          `${batch.validRowCount} rows imported`,
                          batch.rejectedRowCount > 0 ? `${batch.rejectedRowCount} rows need review` : null,
                          new Date(batch.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
                        ]}
                      />
                    </div>
                    <Money minor={data.totalImportedSpendMinor} currency={batch.currency} className="text-[13px]" exact />
                  </li>
                ))}
              </ul>
            )}
          </Sheet>

          <MarginNote>
            Figures describe campaign spend associated with destinations that have findings — not proven revenue loss.
            Spend comes from the imported CSV files.
          </MarginNote>
        </>
      )}
    </div>
  );
}

function MetricCell({
  label,
  minor,
  currency,
  tone,
  note,
  raw,
}: {
  label: string;
  minor: number;
  currency: string;
  tone?: "ink" | "critical";
  note?: string;
  raw?: boolean;
}) {
  return (
    <div className="bg-paper-raised px-4 py-4 sm:px-5">
      {raw ? (
        <div className="flex flex-col gap-1">
          <span className="micro-label">{label}</span>
          <span className={`num font-mono text-2xl font-semibold tabular-nums leading-none sm:text-[28px] ${tone === "critical" ? "text-critical" : "text-ink"}`}>
            {minor}
          </span>
        </div>
      ) : (
        <MetricFigure label={label} minor={minor} currency={currency} tone={tone === "critical" ? "critical" : "ink"} note={note} />
      )}
    </div>
  );
}

function EmptyDashboard() {
  const navigate = useAppNavigate();
  return (
    <Sheet label="START" title="No campaign data yet">
      <div className="flex flex-col items-start gap-4 px-4 py-8 sm:px-6">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 text-ink-3" aria-hidden="true" />
          <p className="max-w-xl text-[13.5px] leading-relaxed text-ink-2">
            Import a campaign CSV to create your first preflight scan. LandingSentinel maps the fields,
            aggregates destinations and connects each finding to the spend that reaches it.
          </p>
        </div>
        <Button size="sm" onClick={() => navigate({ view: "import" })} className="gap-2">
          <FileUp size={14} aria-hidden="true" /> Import campaign CSV
        </Button>
      </div>
    </Sheet>
  );
}

export function stampStatus(status: string | null | undefined): "DO_NOT_LAUNCH" | "REVIEW_BEFORE_LAUNCH" | "LAUNCH_READY" {
  if (status === "DO_NOT_LAUNCH" || status === "REVIEW_BEFORE_LAUNCH" || status === "LAUNCH_READY") return status;
  return "REVIEW_BEFORE_LAUNCH";
}
