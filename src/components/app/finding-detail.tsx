"use client";

/**
 * Finding screen — forensic by design.
 *
 * Sections: severity header → what happened → evidence (machine-readable
 * rows) → campaigns affected → redirect path → tracking detected →
 * verify/next action → scan metadata + detected-issue history.
 * Raw evidence is always one click away; interpretation never replaces it.
 */

import { useFindingDetail, useDashboard, useGenerateReport } from "@/lib/client/queries";
import { useAppNavigate } from "@/lib/nav";
import { Sheet, MicroLabel, DossierLine, MarginNote } from "@/components/paper/paper";
import { SeverityBadge } from "@/components/paper/stamp";
import { Money, EvidenceBlock, RedirectChain, CopyButton } from "@/components/paper/evidence";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CampaignsPanel } from "./scan-detail";
import { ArrowLeft, ArrowRight, ClipboardCheck } from "lucide-react";

const TRACKER_LABELS: Record<string, string> = {
  ga4: "Google Analytics (GA4)",
  gtm: "Google Tag Manager",
  google_ads: "Google Ads tag",
  meta_pixel: "Meta Pixel",
  tiktok_pixel: "TikTok Pixel",
  linkedin_insight: "LinkedIn Insight Tag",
};

export function FindingDetailView({ scope, findingId }: { scope: "demo" | "app"; findingId: string }) {
  const { data, isLoading, isError, error } = useFindingDetail(scope, findingId);
  const navigate = useAppNavigate();

  if (isError) {
    return (
      <Sheet label="ERROR" title="This finding could not be loaded">
        <p className="px-4 py-4 text-[13.5px] text-critical sm:px-5">
          {error instanceof Error ? error.message : "The finding does not exist."}
        </p>
      </Sheet>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-28 rounded-[2px] bg-paper-deep" />
        <Skeleton className="h-40 rounded-[2px] bg-paper-deep" />
        <Skeleton className="h-56 rounded-[2px] bg-paper-deep" />
      </div>
    );
  }

  const { finding, destination, target, redirects, campaignsAffected, otherFindings, scan, history } = data;
  const totalAffected = campaignsAffected.reduce((s, c) => s + c.spendMinor, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <button
          type="button"
          onClick={() =>
            navigate(scope === "demo" ? { view: "scan", scanId: finding.scanId, scope: "demo" } : { view: "scan", scanId: finding.scanId })
          }
          className="micro-label transition-colors hover:text-ink"
        >
          ← BACK TO MONEY MAP
        </button>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <SeverityBadge severity={finding.severity} confidence={finding.confidence} />
          <MicroLabel>FINDING / {finding.id.slice(-6).toUpperCase()}</MicroLabel>
          <MicroLabel>CHECK · {finding.checkId.toUpperCase()}</MicroLabel>
        </div>
        <h1 className="font-display mt-2 max-w-3xl text-2xl font-bold leading-tight tracking-tight sm:text-[28px]">
          {finding.title}
        </h1>
        <p className="url-wrap mt-2 font-mono text-[13px] text-ink-2">
          Destination: <span className="text-ink">{destination.normalizedKey}</span>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div>
            <MicroLabel>ASSOCIATED SPEND</MicroLabel>
            <Money minor={finding.associatedSpendMinor} currency={finding.currency} className="mt-0.5 block text-xl font-semibold" exact />
          </div>
          <div>
            <MicroLabel>CAMPAIGN ROWS AFFECTED</MicroLabel>
            <span className="num mt-0.5 block font-mono text-xl font-semibold tabular-nums">{campaignsAffected.length}</span>
          </div>
          <div>
            <MicroLabel>FIRST DETECTED</MicroLabel>
            <span className="mt-0.5 block font-mono text-[13px]">
              {finding.firstSeenAt
                ? new Date(finding.firstSeenAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                : "This scan"}
            </span>
          </div>
          {finding.resolvedAt ? (
            <div>
              <MicroLabel>RESOLVED</MicroLabel>
              <span className="mt-0.5 block font-mono text-[13px] text-healthy">
                {new Date(finding.resolvedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* What happened */}
      <Sheet label="FINDING / SUMMARY" title="What happened">
        <div className="px-4 py-4 sm:px-5">
          <p className="text-[14px] leading-relaxed text-ink">{finding.summary}</p>
          <Hairline className="my-3" />
          <p className="text-[13.5px] leading-relaxed text-ink-2">{finding.explanation}</p>
        </div>
      </Sheet>

      {/* Evidence */}
      <Sheet
        label="EVIDENCE"
        title="Technical evidence"
        labelAside={
          <CopyButton
            text={finding.evidence
              .map((e) => `${e.label}: ${e.value ?? ""}${e.snippet ? ` "${e.snippet}"` : ""}`)
              .join("\n")}
            label="Copy all evidence as text"
          />
        }
      >
        <EvidenceBlock items={finding.evidence} />
      </Sheet>

      {/* Campaigns affected */}
      <Sheet label="CAMPAIGNS" title={`Campaigns affected · ${campaignsAffected.length} rows`} labelAside={<Money minor={totalAffected} currency={finding.currency} className="text-[13px] font-semibold" exact />}>
        <div className="px-4 py-4 sm:px-5">
          <CampaignsPanel campaigns={campaignsAffected} />
          <MarginNote className="mt-3">
            Every imported campaign row that reaches this destination. Original URLs are preserved exactly as imported.
          </MarginNote>
        </div>
      </Sheet>

      {/* Redirect path */}
      <Sheet label="REDIRECT PATH" title="Redirect path" labelAside={redirects.length > 0 ? `${redirects.length} hop${redirects.length === 1 ? "" : "s"}` : "Direct response"}>
        <RedirectChain hops={redirects} finalStatus={target.httpStatus} finalUrl={target.finalUrl} />
      </Sheet>

      {/* Tracking detected */}
      {target.trackerSummary ? (
        <Sheet label="TRACKING" title="Tracking signatures on this destination">
          <ul>
            {target.trackerSummary.map((t) => (
              <li key={t.key} className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2.5 last:border-b-0 sm:px-5">
                <span className="text-[13px] text-ink">{TRACKER_LABELS[t.key] ?? t.key}</span>
                <span className={t.detected ? "micro-label !text-healthy" : "micro-label"}>
                  {t.detected ? `DETECTED · ${t.signature ?? ""}` : "NOT DETECTED"}
                </span>
              </li>
            ))}
          </ul>
        </Sheet>
      ) : null}

      {/* Next action */}
      {finding.recommendation ? (
        <Sheet label="NEXT ACTION" title="Verify / next action">
          <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
            <ClipboardCheck size={18} className="mt-0.5 shrink-0 text-ink" aria-hidden="true" />
            <p className="text-[14px] leading-relaxed text-ink">{finding.recommendation}</p>
          </div>
        </Sheet>
      ) : null}

      {/* Scan metadata */}
      <Sheet label="METADATA" title="Scan metadata">
        <div className="grid gap-x-8 gap-y-3 px-4 py-4 sm:grid-cols-2 sm:px-5">
          <MetaRow label="Scan ID" value={scan.id} mono />
          <MetaRow label="Scan label" value={scan.label ?? "—"} />
          <MetaRow label="Scan started" value={new Date(scan.startedAt).toLocaleString("en-GB")} mono />
          <MetaRow label="Scan completed" value={scan.completedAt ? new Date(scan.completedAt).toLocaleString("en-GB") : "Running"} mono />
          <MetaRow label="Engine" value={scan.engine === "demo-fixture" ? "Synthetic fixture (demo)" : "Real HTTP scanner"} />
          <MetaRow label="Requested URL" value={target.originalUrl} mono wrap />
          <MetaRow label="Final URL" value={target.finalUrl ?? "—"} mono wrap />
          <MetaRow label="HTTP status" value={target.httpStatus !== null ? String(target.httpStatus) : "—"} mono />
          <MetaRow label="Response time" value={target.responseTimeMs !== null ? `${target.responseTimeMs} ms` : "—"} mono />
          <MetaRow label="Content type" value={target.contentType ?? "—"} mono />
          <MetaRow label="Bytes inspected" value={target.bytesInspected !== null ? target.bytesInspected.toLocaleString("en-GB") : "—"} mono />
        </div>
        {history.length > 1 ? (
          <div className="border-t border-hairline px-4 py-3 sm:px-5">
            <MicroLabel>DETECTED-ISSUE HISTORY</MicroLabel>
            <ul className="mt-2">
              {history.map((h, i) => (
                <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-hairline py-1.5 text-[12.5px] last:border-b-0">
                  <span className="font-mono text-[11.5px] text-ink-3">
                    Seen {h.lastSeenAt ? new Date(h.lastSeenAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}
                  </span>
                  {h.resolvedAt ? (
                    <span className="text-healthy">Resolved {new Date(h.resolvedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                  ) : i === history.length - 1 ? (
                    <span className="text-critical">Still present in latest scan</span>
                  ) : null}
                </li>
              ))}
            </ul>
            <MarginNote className="mt-2">
              History reflects stored scan timestamps only. LandingSentinel does not monitor continuously between scans.
            </MarginNote>
          </div>
        ) : null}
      </Sheet>

      {/* Other findings on this destination */}
      {otherFindings.length > 0 ? (
        <Sheet label="CONTEXT" title={`Other findings on this destination · ${otherFindings.length}`}>
          <ul>
            {otherFindings.map((f) => (
              <li key={f.id} className="ledger-row">
                <button
                  type="button"
                  onClick={() =>
                    navigate(scope === "demo" ? { view: "finding", findingId: f.id, scope: "demo" } : { view: "finding", findingId: f.id })
                  }
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left sm:px-5"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{f.title}</span>
                  <SeverityBadge severity={f.severity as "critical" | "warning" | "info"} />
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      ) : null}

      <div className="print:hidden">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            navigate(scope === "demo" ? { view: "scan", scanId: finding.scanId, scope: "demo" } : { view: "scan", scanId: finding.scanId })
          }
          className="gap-2"
        >
          <ArrowLeft size={14} aria-hidden="true" /> Back to Money Map
        </Button>
      </div>
      <DemoNextStep scope={scope} scanId={finding.scanId} />
    </div>
  );
}

/** Guided path (public demo): the natural next beat after the first finding. */
function DemoNextStep({ scope, scanId }: { scope: "demo" | "app"; scanId: string }) {
  const navigate = useAppNavigate();
  const { data: dashboard } = useDashboard(scope);
  const generateReport = useGenerateReport(scope);

  if (scope !== "demo") return null;

  const go = () => {
    if (dashboard?.latestReportId) {
      navigate({ view: "report", reportId: dashboard.latestReportId, scope: "demo" });
      return;
    }
    generateReport.mutate(
      { scanId },
      {
        onSuccess: ({ reportId }) => navigate({ view: "report", reportId, scope: "demo" }),
      }
    );
  };

  return (
    <div className="print:hidden flex justify-end">
      <button
        type="button"
        onClick={go}
        disabled={generateReport.isPending}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2 underline decoration-hairline-strong underline-offset-4 transition-colors hover:text-ink disabled:opacity-50"
      >
        {generateReport.isPending ? "Preparing report…" : "Next: See the campaign report"} <ArrowRight size={13} aria-hidden="true" />
      </button>
    </div>
  );
}

function MetaRow({ label, value, mono, wrap }: { label: string; value: string; mono?: boolean; wrap?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <MicroLabel>{label.toUpperCase()}</MicroLabel>
      <span className={`${mono ? "font-mono text-[12px]" : "text-[13px]"} ${wrap ? "url-wrap" : ""} text-ink-2`}>{value}</span>
    </div>
  );
}

function Hairline({ className }: { className?: string }) {
  return <hr className={`border-0 border-t border-hairline ${className ?? ""}`} />;
}
