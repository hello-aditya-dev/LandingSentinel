"use client";

import { useReportList, useGenerateReport, useScanList } from "@/lib/client/queries";
import { useRouter } from "@/store/router";
import { Sheet, MicroLabel, DossierLine, MarginNote } from "@/components/paper/paper";
import { StatusStamp } from "@/components/paper/stamp";
import { Money } from "@/components/paper/evidence";
import { stampStatus } from "./dashboard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, ArrowRight, Printer } from "lucide-react";

export function ReportsListView({ scope }: { scope: "demo" | "app" }) {
  const { data, isLoading } = useReportList(scope);
  const { data: scanData } = useScanList(scope);
  const generate = useGenerateReport(scope);
  const navigate = useRouter((s) => s.navigate);

  if (isLoading || !data) {
    return <Skeleton className="h-64 rounded-[2px] bg-paper-deep" />;
  }

  const latestComplete = scanData?.scans.find((s) => (s.state === "complete" || s.state === "partial") && !data.reports.some((r) => r.scan.id === s.id));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <MicroLabel>REPORTS / CLIENT COPIES</MicroLabel>
          <h1 className="font-display mt-1 text-2xl font-bold leading-tight tracking-tight sm:text-[28px]">
            Client reports
          </h1>
          <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-2">
            Branded, print-ready preflight reports. Open a report and use Print / Save PDF for the client copy.
          </p>
        </div>
        {latestComplete ? (
          <Button
            size="sm"
            variant="outline"
            className="gap-2 print:hidden"
            disabled={generate.isPending}
            onClick={() =>
              generate.mutate(
                { scanId: latestComplete.id },
                {
                  onSuccess: ({ reportId }) => navigate({ view: "report", reportId }),
                  onError: (err) => undefined,
                }
              )
            }
          >
            <FileText size={14} aria-hidden="true" /> Generate report for “{latestComplete.label ?? "latest scan"}”
          </Button>
        ) : null}
      </div>

      {data.reports.length === 0 ? (
        <Sheet label="REPORTS / EMPTY" title="No reports yet">
          <div className="px-4 py-6 text-[13.5px] text-ink-2 sm:px-5">
            <p>Complete a scan, then generate its client report from the scan summary or here.</p>
          </div>
        </Sheet>
      ) : (
        <Sheet label={`REPORTS / ${data.reports.length}`}>
          <ul>
            {data.reports.map((r) => (
              <li key={r.id} className="ledger-row">
                <button
                  type="button"
                  onClick={() => navigate({ view: "report", reportId: r.id })}
                  className="flex w-full flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 text-left sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[15px] font-semibold">{r.title}</p>
                    <DossierLine
                      items={[
                        `REPORT / ${r.id.slice(-6).toUpperCase()}`,
                        `SCAN · ${r.scan.label ?? r.scan.id.slice(-6).toUpperCase()}`,
                        new Date(r.generatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
                        r.scan.demo || r.scan.variant === "fixed" ? "SYNTHETIC DEMO DATA" : null,
                      ]}
                      className="mt-1"
                    />
                  </div>
                  <div className="flex items-center gap-5">
                    <StatusStamp status={stampStatus(r.scan.preflightStatus)} />
                    <Money minor={r.scan.totalSpendMinor} currency={r.scan.currency} className="text-[13px]" exact />
                    <ArrowRight size={16} className="text-ink-3" aria-hidden="true" />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}

      <MarginNote>
        Reports are generated from stored scan results and a snapshot of your branding at generation time.
        Re-generating after a new scan keeps earlier reports unchanged.
      </MarginNote>
    </div>
  );
}
