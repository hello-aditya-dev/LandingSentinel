"use client";

/**
 * Client report — formal printed dossier.
 *
 * On screen it renders inside the app; @media print (globals.css) strips all
 * navigation and controls and lays the report out for A4. Print / Save PDF
 * uses the browser's native print engine — no fragile PDF backend.
 */

import { useReportDetail } from "@/lib/client/queries";
import { useAppNavigate } from "@/lib/nav";
import { MicroLabel, DossierLine, MarginNote } from "@/components/paper/paper";
import { StatusStamp, SeverityBadge } from "@/components/paper/stamp";
import { Money, EvidenceBlock, RedirectChain } from "@/components/paper/evidence";
import { stampStatus } from "./dashboard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Printer, ArrowLeft, ArrowRight } from "lucide-react";
import { useDemoBranding } from "@/store/demo-branding";
import { cn } from "@/lib/utils";

export function ReportView({ scope, reportId }: { scope: "demo" | "app"; reportId: string }) {
  // Public-demo playground: browser-local override, never saved to a server.
  // (The hook is always called; the override only applies to demo scope.)
  const demoBrandingOverride = useDemoBranding((st) => st.override);
  const { data, isLoading, isError, error } = useReportDetail(scope, reportId);
  const navigate = useAppNavigate();

  if (isError) {
    return (
      <div className="paper-sheet px-4 py-4 text-[13.5px] text-critical sm:px-5">
        {error instanceof Error ? error.message : "This report does not exist."}
      </div>
    );
  }

  if (isLoading || !data) {
    return <Skeleton className="h-96 rounded-[2px] bg-paper-deep" />;
  }

  const { report, scan, moneyMap, findings, campaignsByDestination } = data;
  const branding = report.branding as Record<string, string | null | undefined>;
  const demoOverride = scope === "demo" ? demoBrandingOverride : null;
  const effective: Record<string, string | null | undefined> = demoOverride
    ? { ...branding, ...demoOverride }
    : branding;
  const agency = effective.agencyName || "";
  const accent = typeof effective.accentColor === "string" && /^#[0-9a-fA-F]{6}$/.test(effective.accentColor) ? effective.accentColor : "#A7372D";
  const stats = scan.stats;
  const criticals = findings.filter((f) => f.severity === "critical");
  const warnings = findings.filter((f) => f.severity === "warning");
  const healthy = moneyMap.filter((r) => r.status === "healthy");
  const demo = scan.demo || scan.variant === "fixed";

  return (
    <div className="flex flex-col gap-5">
      {/* Controls (screen only) */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            // From the demo playground, back goes to the demo — not to the
            // authenticated workspace's reports list.
            navigate(scope === "demo" ? { view: "demo" } : { view: "reports" })
          }
          className="gap-2"
        >
          <ArrowLeft size={14} aria-hidden="true" /> {scope === "demo" ? "Back to demo" : "All reports"}
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {scope === "demo" ? (
            <Button variant="outline" size="sm" onClick={() => navigate({ view: "demo", panel: "branding" })} className="gap-2">
              Rebrand this report
            </Button>
          ) : null}
          <Button size="sm" onClick={() => window.print()} className="gap-2">
            <Printer size={14} aria-hidden="true" /> Print / Save PDF
          </Button>
        </div>
      </div>

      {/* Guided path (public demo): the repaired state is the next beat. */}
      {scope === "demo" ? (
        <div className="no-print flex justify-end">
          <button
            type="button"
            onClick={() => navigate({ view: "demo", panel: "fixed" })}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2 underline decoration-hairline-strong underline-offset-4 transition-colors hover:text-ink"
          >
            Next: See the repaired state <ArrowRight size={13} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {/* ------------------------- REPORT SHEET ------------------------- */}
      <article
        className="paper-sheet print-sheet mx-auto w-full max-w-3xl"
        style={{ ["--brand-accent" as string]: accent }}
      >
        {/* Masthead */}
        <header className="border-b-2 border-ink px-6 py-6 sm:px-8" style={{ borderBottomColor: accent }}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              {/* White-label agency logo (branding.logoUrl) when configured */}
              {typeof effective.logoUrl === "string" && effective.logoUrl ? (
                 
                <img
                  src={effective.logoUrl}
                  alt=""
                  className="max-h-10 max-w-[160px] object-contain object-left"
                />
              ) : null}
              <div>
              <p className="font-display text-xl font-bold leading-tight">{agency || "Campaign Preflight"}</p>
              {effective.reportContactName ? (
                <p className="mt-0.5 text-[12px] text-ink-2">{branding.reportContactName}</p>
              ) : null}
              {effective.website ? (
                <p className="url-wrap font-mono text-[11px] text-ink-3">{branding.website}</p>
              ) : null}
              </div>
            </div>
            <div className="text-right">
              <MicroLabel>CAMPAIGN PREFLIGHT REPORT</MicroLabel>
              <p className="font-display mt-1 text-[15px] font-semibold">Northstar Outfitters — Synthetic Demo</p>
              <DossierLine
                items={[
                  `REPORT / ${report.id.slice(-6).toUpperCase()}`,
                  new Date(report.generatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
                ]}
              />
            </div>
          </div>
          {demo ? (
            <p className="micro-label mt-4 !text-warning">SYNTHETIC DEMO DATA — NO REAL CAMPAIGNS WERE SCANNED</p>
          ) : null}
        </header>

        {/* Summary */}
        <section className="grid grid-cols-2 gap-px border-b border-hairline bg-hairline sm:grid-cols-3" aria-label="Report summary">
          <SummaryCell label="Spend represented" value={<Money minor={scan.totalSpendMinor} currency={scan.currency} exact />} note={`${scan.targetCount} destinations`} />
          <SummaryCell
            label="Critical-associated spend"
            value={<Money minor={stats?.criticalSpendMinor ?? 0} currency={scan.currency} exact />}
            note="Spend on destinations with critical findings"
            tone="critical"
          />
          <SummaryCell label="Critical destinations" value={String(stats?.criticalDestinations ?? 0)} tone="critical" />
          <SummaryCell label="Warning destinations" value={String(stats?.warningDestinations ?? 0)} tone="warning" />
          <SummaryCell label="Healthy destinations" value={String(stats?.healthyDestinations ?? 0)} tone="healthy" />
          <div className="flex flex-col justify-between gap-2 bg-paper px-6 py-4">
            <MicroLabel>PREFLIGHT STATUS</MicroLabel>
            <div>
              <StatusStamp status={stampStatus(scan.preflightStatus)} />
              <p className="num mt-1.5 font-mono text-[11.5px] text-ink-3">
                Readiness score {scan.readinessScore ?? "—"}/100 · spend-weighted
              </p>
            </div>
          </div>
        </section>

        {/* Executive summary */}
        <ReportSection label="01 / EXECUTIVE SUMMARY" title="What this scan found">
          <div className="space-y-3 px-6 py-5 sm:px-8">
            <p className="text-[13.5px] leading-relaxed text-ink">
              {criticals.length === 0
                ? "No critical findings were detected in this scan."
                : `This scan detected ${criticals.length} critical finding${criticals.length === 1 ? "" : "s"} across ${stats?.criticalDestinations ?? 0} destination${(stats?.criticalDestinations ?? 0) === 1 ? "" : "s"}. ${fmtMoneyPhrase(stats?.criticalSpendMinor ?? 0, scan.currency)} of campaign spend is associated with those destinations.`}
            </p>
            {warnings.length > 0 ? (
              <p className="text-[13.5px] leading-relaxed text-ink-2">
                {warnings.length} warning{warnings.length === 1 ? "" : "s"} need review before launch.{" "}
                {fmtMoneyPhrase(stats?.warningSpendMinor ?? 0, scan.currency)} of campaign spend is associated with warning destinations.
              </p>
            ) : null}
            <p className="text-[13.5px] leading-relaxed text-ink-2">
              {stats?.healthyDestinations ?? 0} destinations returned no critical or warning findings.
              Each finding below lists its technical evidence, the campaigns affected, and the spend associated with the destination.
            </p>
            {scan.state === "partial" ? (
              <p className="text-[13px] leading-relaxed text-warning">
                This scan completed partially: {stats?.failedTargets ?? 0} destination{stats?.failedTargets === 1 ? "" : "s"} failed safely and were not fully inspected.
              </p>
            ) : null}
          </div>
        </ReportSection>

        {/* Critical findings */}
        {criticals.length > 0 ? (
          <ReportSection label="02 / CRITICAL FINDINGS" title={`Critical findings · ${criticals.length}`}>
            {criticals.map((f) => (
              <FindingBlock key={f.id} finding={f} campaigns={campaignsByDestination} />
            ))}
          </ReportSection>
        ) : null}

        {/* Warnings */}
        {warnings.length > 0 ? (
          <ReportSection label="03 / WARNINGS" title={`Warnings needing review · ${warnings.length}`}>
            {warnings.map((f) => (
              <FindingBlock key={f.id} finding={f} campaigns={campaignsByDestination} />
            ))}
          </ReportSection>
        ) : null}

        {/* Healthy destinations */}
        <ReportSection label="04 / HEALTHY DESTINATIONS" title={`Destinations with no critical or warning findings · ${healthy.length}`}>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-hairline-strong">
                <th scope="col" className="micro-label px-6 py-2">DESTINATION</th>
                <th scope="col" className="micro-label px-3 py-2 text-right">SPEND</th>
                <th scope="col" className="micro-label px-3 py-2 text-center">CAMPAIGNS</th>
                <th scope="col" className="micro-label px-6 py-2">LAST SCAN</th>
              </tr>
            </thead>
            <tbody>
              {healthy.map((row) => (
                <tr key={row.scanTargetId} className="print-row-avoid border-b border-hairline last:border-b-0">
                  <td className="url-wrap px-6 py-2 font-mono text-[11.5px] text-ink">{row.normalizedKey}</td>
                  <td className="px-3 py-2 text-right"><Money minor={row.associatedSpendMinor} currency={row.currency} exact className="text-[12px]" /></td>
                  <td className="num px-3 py-2 text-center font-mono text-[12px] text-ink-2">{row.campaignCount}</td>
                  <td className="px-6 py-2 font-mono text-[11px] text-ink-3">
                    {row.lastScanAt ? new Date(row.lastScanAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportSection>

        {/* Spend priority table */}
        <ReportSection label="05 / SPEND PRIORITY" title="Money Map — destinations ranked by severity and spend">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-hairline-strong">
                <th scope="col" className="micro-label px-6 py-2">#</th>
                <th scope="col" className="micro-label px-3 py-2">DESTINATION</th>
                <th scope="col" className="micro-label px-3 py-2 text-right">SPEND</th>
                <th scope="col" className="micro-label px-6 py-2">STATUS</th>
                <th scope="col" className="micro-label px-6 py-2">PRIMARY FINDING</th>
              </tr>
            </thead>
            <tbody>
              {moneyMap.map((row) => (
                <tr key={row.scanTargetId} className="print-row-avoid border-b border-hairline last:border-b-0">
                  <td className="num px-6 py-2 font-mono text-[11px] text-ink-3">{String(row.priority).padStart(2, "0")}</td>
                  <td className="url-wrap px-3 py-2 font-mono text-[11.5px] text-ink">{row.normalizedKey}</td>
                  <td className="px-3 py-2 text-right"><Money minor={row.associatedSpendMinor} currency={row.currency} exact className="text-[12px]" /></td>
                  <td className="px-6 py-2 text-[11.5px] font-medium">
                    <span
                      className={cn(
                        row.status === "critical" && "text-critical",
                        row.status === "warning" && "text-warning",
                        row.status === "healthy" && "text-healthy"
                      )}
                    >
                      {row.status === "critical" ? "Critical" : row.status === "warning" ? "Warning" : "Healthy"}
                    </span>
                  </td>
                  <td className="max-w-[220px] truncate px-6 py-2 text-[11.5px] text-ink-2">{row.primaryFinding?.title ?? "All checks passed"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportSection>

        {/* Evidence appendix */}
        <ReportSection label="06 / EVIDENCE APPENDIX" title="Technical evidence per finding">
          {findings
            .filter((f) => f.severity !== "info")
            .map((f) => (
              <div key={f.id} className="border-b border-hairline last:border-b-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2 px-6 pt-4 sm:px-8">
                  <div className="flex items-center gap-3">
                    <SeverityBadge severity={f.severity} />
                    <span className="font-mono text-[12px] text-ink">{f.destination.normalizedKey}</span>
                  </div>
                  <Money minor={f.associatedSpendMinor} currency={f.currency} exact className="text-[12px]" />
                </div>
                <EvidenceBlock items={f.evidence} />
                {f.redirects.length > 0 ? (
                  <RedirectChain hops={f.redirects} finalStatus={null} finalUrl={null} />
                ) : null}
              </div>
            ))}
        </ReportSection>

        {/* Method notes */}
        <ReportSection label="07 / METHOD NOTES" title="How these results were produced">
          <div className="space-y-2 px-6 py-5 text-[12.5px] leading-relaxed text-ink-2 sm:px-8">
            <p>• Campaign spend comes from the imported CSV files. LandingSentinel groups campaign rows by normalized destination.</p>
            <p>• The scanner checks network response, redirects, campaign parameters, selected tracking signatures and page content.</p>
            <p>• Static tracking detection does not confirm runtime tag execution. Findings use "not detected" language for this reason.</p>
            <p>• Response-time measurements reflect the scanner region. They are not Core Web Vitals and not Lighthouse results.</p>
            <p>• Associated spend is not a measurement of lost revenue. A finding does not prove revenue loss.</p>
            <p>• Language heuristics for content checks focus on English.</p>
          </div>
        </ReportSection>

        {/* Footer */}
        <footer className="border-t border-hairline px-6 py-5 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-display text-[14px] font-semibold">{agency || "Campaign Preflight"}</p>
              <p className="mt-0.5 text-[11.5px] text-ink-3">
                {effective.reportFooter ?? `Prepared with ${effective.productName ?? "LandingSentinel"}.`}
              </p>
              {branding.supportEmail ? (
                <p className="url-wrap font-mono text-[11px] text-ink-3">{branding.supportEmail}</p>
              ) : null}
            </div>
            <div className="text-right">
              <DossierLine items={[`SCAN / ${scan.id.slice(-6).toUpperCase()}`, `REPORT / ${report.id.slice(-6).toUpperCase()}`]} />
              <p className="mt-1 max-w-xs text-[11px] leading-snug text-ink-3">
                Spend figures come from imported campaign data. A finding does not prove revenue loss.
              </p>
            </div>
          </div>
        </footer>
      </article>
    </div>
  );
}

function fmtMoneyPhrase(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(minor / 100);
}

function ReportSection({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  return (
    <section className="print-break-avoid border-b border-hairline last:border-b-0" aria-label={title}>
      <header className="flex items-baseline justify-between gap-3 border-b border-hairline px-6 py-3 sm:px-8">
        <MicroLabel>{label}</MicroLabel>
        <h2 className="font-display text-[14.5px] font-semibold leading-tight">{title}</h2>
      </header>
      {children}
    </section>
  );
}

function SummaryCell({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  note?: string;
  tone?: "critical" | "warning" | "healthy";
}) {
  return (
    <div className="bg-paper px-6 py-4">
      <MicroLabel>{label.toUpperCase()}</MicroLabel>
      <div className={cn("num mt-1 font-mono text-lg font-semibold tabular-nums", tone === "critical" && "text-critical", tone === "warning" && "text-warning", tone === "healthy" && "text-healthy")}>
        {value}
      </div>
      {note ? <p className="mt-0.5 text-[10.5px] leading-snug text-ink-3">{note}</p> : null}
    </div>
  );
}

function FindingBlock({
  finding,
  campaigns,
}: {
  finding: {
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
    destination: { normalizedKey: string };
    firstSeenAt: string | null;
    lastSeenAt: string | null;
    resolvedAt: string | null;
  };
  campaigns: Record<string, { platform: string | null; campaignName: string | null; spendMinor: number; currency: string }[]>;
}) {
  return (
    <article className="print-break-avoid border-b border-hairline px-6 py-5 last:border-b-0 sm:px-8">
      <div className="flex flex-wrap items-center gap-3">
        <SeverityBadge severity={finding.severity} confidence={finding.confidence} />
        <h3 className="font-display text-[15.5px] font-semibold leading-snug">{finding.title}</h3>
      </div>
      <p className="url-wrap mt-1.5 font-mono text-[12px] text-ink-2">{finding.destination.normalizedKey}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div>
          <MicroLabel>ASSOCIATED SPEND</MicroLabel>
          <Money minor={finding.associatedSpendMinor} currency={finding.currency} className="mt-0.5 block text-[15px] font-semibold" exact />
        </div>
        {finding.firstSeenAt && finding.lastSeenAt && finding.firstSeenAt !== finding.lastSeenAt ? (
          <div>
            <MicroLabel>ISSUE WINDOW</MicroLabel>
            <p className="mt-0.5 font-mono text-[12px]">
              first seen {new Date(finding.firstSeenAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              {finding.resolvedAt ? ` · resolved ${new Date(finding.resolvedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : " · still present"}
            </p>
          </div>
        ) : null}
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-ink">{finding.summary}</p>
      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">{finding.explanation}</p>
      {finding.recommendation ? (
        <p className="mt-2 border-l-2 border-ink pl-3 text-[12.5px] leading-relaxed text-ink">
          <span className="micro-label mr-2">NEXT ACTION</span>
          {finding.recommendation}
        </p>
      ) : null}
      <div className="mt-4 border border-hairline bg-paper-raised">
        <div className="border-b border-hairline px-4 py-2">
          <MicroLabel>EVIDENCE</MicroLabel>
        </div>
        <EvidenceBlock items={finding.evidence.slice(0, 5)} />
      </div>
    </article>
  );
}

export { MarginNote };
