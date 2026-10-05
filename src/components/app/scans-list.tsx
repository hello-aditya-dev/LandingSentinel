"use client";

/**
 * Scan history with detected-issue timeline context.
 */

import { useScanList } from "@/lib/client/queries";
import { useRouter } from "@/store/router";
import { Sheet, MicroLabel, DossierLine, MarginNote } from "@/components/paper/paper";
import { StatusStamp } from "@/components/paper/stamp";
import { Money } from "@/components/paper/evidence";
import { stampStatus } from "./dashboard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Radar, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function ScansListView({ scope }: { scope: "demo" | "app" }) {
  const { data, isLoading } = useScanList(scope);
  const navigate = useRouter((s) => s.navigate);

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-[2px] bg-paper-deep" />
        ))}
      </div>
    );
  }

  const scans = data.scans;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <MicroLabel>SCANS / HISTORY</MicroLabel>
          <h1 className="font-display mt-1 text-2xl font-bold leading-tight tracking-tight sm:text-[28px]">
            Scan history
          </h1>
          <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-2">
            Repeated scans build detected-issue history: findings keep their first-seen and last-seen dates,
            and disappearances are marked resolved.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate({ view: "dashboard" })} className="gap-2 print:hidden">
          <Radar size={14} aria-hidden="true" /> Run scan from overview
        </Button>
      </div>

      {scans.length === 0 ? (
        <Sheet label="SCANS / EMPTY" title="No scans yet">
          <div className="px-4 py-6 text-[13.5px] text-ink-2 sm:px-5">
            <p>Import campaign data, then run your first preflight scan from the overview desk.</p>
          </div>
        </Sheet>
      ) : (
        <Sheet label={`SCANS / ${scans.length} RECORD${scans.length === 1 ? "" : "S"}`} title="Detected-issue history">
          <ul>
            {scans.map((scan) => (
              <li key={scan.id} className="ledger-row">
                <button
                  type="button"
                  onClick={() => navigate({ view: "scan", scanId: scan.id })}
                  className="flex w-full flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 text-left transition-colors sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-display text-[15px] font-semibold text-ink">
                        {scan.label ?? "Preflight scan"}
                      </span>
                      {scan.variant === "fixed" ? (
                        <span className="micro-label border border-hairline px-1.5 py-0.5">AFTER FIXES · SYNTHETIC</span>
                      ) : null}
                    </div>
                    <DossierLine
                      items={[
                        `SCAN / ${scan.id.slice(-6).toUpperCase()}`,
                        new Date(scan.startedAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
                        `${scan.targetCount} destinations`,
                        scan.engine === "demo-fixture" ? "FIXTURE ENGINE" : "REAL ENGINE",
                        scan.state === "partial" ? `PARTIAL · ${scan.stats?.failedTargets ?? 0} FAILED SAFELY` : scan.state.toUpperCase(),
                        scan.reportCount > 0 ? `${scan.reportCount} REPORT${scan.reportCount === 1 ? "" : "S"}` : null,
                      ]}
                      className="mt-1"
                    />
                    {scan.stats ? (
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
                        <span className={cn("num font-mono", scan.stats.criticalFindings > 0 && "font-semibold text-critical")}>
                          {scan.stats.criticalFindings} critical
                        </span>
                        <span className={cn("num font-mono", scan.stats.warningFindings > 0 && "font-semibold text-warning")}>
                          {scan.stats.warningFindings} warnings
                        </span>
                        <span className="num font-mono text-ink-3">{scan.stats.healthyDestinations} healthy destinations</span>
                        <Money minor={scan.stats.criticalSpendMinor} currency={scan.currency} className="text-[12px] text-critical" exact />
                        <span className="text-ink-3">critical-associated</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-4">
                    <StatusStamp status={stampStatus(scan.preflightStatus)} />
                    <ArrowRight size={16} className="text-ink-3" aria-hidden="true" />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}

      <MarginNote>
        History uses stored scan timestamps only. LandingSentinel does not monitor destinations continuously between scans.
      </MarginNote>
    </div>
  );
}
