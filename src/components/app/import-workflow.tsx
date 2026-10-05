"use client";

/**
 * Campaign import workflow:
 *   file → mapping → review → commit.
 *
 * Client-side parsing is only a preview. Every commit is re-validated
 * server-side (POST /api/import) — client validation is never trusted alone.
 * In demo mode, synthetic sample files can be loaded instead of a real CSV.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { api, ApiClientError, withScope } from "@/lib/client/api";
import { useRouter } from "@/store/router";
import { Sheet, MicroLabel, DossierLine, MarginNote } from "@/components/paper/paper";
import { Money } from "@/components/paper/evidence";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUp, Check, TriangleAlert, FileSpreadsheet, Radar, ArrowRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PRODUCT } from "@/config/product";

type PreviewData = {
  filename: string;
  headers: string[];
  rowCount: number;
  suggestions: { role: string; header: string; confidence: "exact" | "fuzzy" | "unmapped"; score: number }[];
  sampleRows: Record<string, string>[];
  currencies: string[];
  platforms: Record<string, number>;
  estimatedValid: number;
  estimatedRejected: number;
  rejectedPreview: { index: number; code: string; reason: string; raw: Record<string, string> }[];
};

type CommitResult = {
  batchId: string;
  summary: {
    originalRowCount: number;
    validRowCount: number;
    rejectedRowCount: number;
    destinationCount: number;
    currency: string;
    totalSpendMinor: number;
  };
};

const ROLE_LABELS: Record<string, string> = {
  url: "Destination URL",
  spend: "Spend",
  campaign: "Campaign name",
  platform: "Platform",
  adGroup: "Ad group / ad set",
  ad: "Ad name",
  currency: "Currency",
};

const CURRENCIES = ["GBP", "USD", "EUR", "INR", "AUD", "CAD", "CHF", "SEK", "NZD", "SGD"];

export function ImportWorkflowView({ scope, demo }: { scope: "demo" | "app"; demo?: boolean }) {
  const [step, setStep] = useState<"file" | "mapping" | "review" | "done">("file");
  const [csvText, setCsvText] = useState<string>("");
  const [filename, setFilename] = useState<string>("");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [defaultCurrency, setDefaultCurrency] = useState<string>("GBP");
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useRouter((s) => s.navigate);

  const loadCsv = useCallback(
    async (text: string, name: string) => {
      setError(null);
      setCommitResult(null);
      setCsvText(text);
      setFilename(name);
      try {
        const data = await api<PreviewData>(withScope("/api/import/preview", scope), {
          method: "POST",
          body: JSON.stringify({ csvText: text, filename: name }),
        });
        setPreview(data);
        // Pre-apply exact suggestions only — uncertain guesses are offered, never silent.
        const initial: Record<string, string> = {};
        for (const s of data.suggestions) {
          if (s.confidence === "exact" && s.header) initial[s.role] = s.header;
        }
        setMapping(initial);
        setStep("mapping");
      } catch (err) {
        const message = err instanceof ApiClientError ? err.message : "The file could not be parsed.";
        setError(message);
        setStep("file");
      }
    },
    [scope]
  );

  const onFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        setError("Only .csv files are accepted.");
        return;
      }
      if (file.size > 4 * 1024 * 1024) {
        setError("The file is larger than 4 MB. Split the export and import it in parts.");
        return;
      }
      const text = await file.text();
      await loadCsv(text, file.name);
    },
    [loadCsv]
  );

  const requiredReady = Boolean(mapping.url && mapping.spend);
  const hasCurrencyColumn = Boolean(mapping.currency);
  const mixedCurrency = (preview?.currencies.length ?? 0) > 1;

  const commit = async () => {
    if (!requiredReady) return;
    setCommitting(true);
    setError(null);
    try {
      const result = await api<CommitResult>(withScope("/api/import", scope), {
        method: "POST",
        body: JSON.stringify({
          filename,
          csvText,
          mapping: { ...mapping, defaultCurrency: hasCurrencyColumn ? undefined : defaultCurrency },
        }),
      });
      setCommitResult(result);
      setStep("done");
      toast({
        title: "Import complete",
        description: `${result.summary.validRowCount} rows imported · ${result.summary.destinationCount} destinations aggregated.`,
      });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
        if (err.code === "MIXED_CURRENCY") {
          setStep("review");
        }
      } else {
        setError("The import could not be completed.");
      }
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <MicroLabel>IMPORT / CAMPAIGN DATA</MicroLabel>
        <h1 className="font-display mt-1 text-2xl font-bold leading-tight tracking-tight sm:text-[28px]">
          Import campaign CSV
        </h1>
        <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-2">
          The file is parsed by this deployment only — it is never sent to an external service. Rows are grouped
          by landing-page destination; attribution parameters such as <span className="font-mono text-[12px]">utm_*</span> and
          click IDs are removed for grouping but preserved as evidence.
        </p>
      </div>

      <StepRail step={step} />

      {error ? (
        <div role="alert" className="flex items-start gap-3 border border-critical bg-critical-wash px-4 py-3">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-critical" aria-hidden="true" />
          <div>
            <p className="text-[13.5px] font-medium text-critical">{error}</p>
            {mixedCurrency ? (
              <p className="mt-1 text-[12.5px] text-ink-2">
                Choose one currency and re-export, or split the file by currency and import each part separately.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {step === "file" ? (
        <FileStep
          dragActive={dragActive}
          setDragActive={setDragActive}
          onFile={onFile}
          fileInputRef={fileInputRef}
          scope={scope}
          demo={scope === "demo" || demo}
          onSample={loadCsv}
        />
      ) : null}

      {step === "mapping" && preview ? (
        <MappingStep
          preview={preview}
          mapping={mapping}
          setMapping={setMapping}
          requiredReady={requiredReady}
          hasCurrencyColumn={hasCurrencyColumn}
          defaultCurrency={defaultCurrency}
          setDefaultCurrency={setDefaultCurrency}
          mixedCurrency={mixedCurrency}
          onBack={() => setStep("file")}
          onNext={() => setStep("review")}
        />
      ) : null}

      {step === "review" && preview ? (
        <ReviewStep
          preview={preview}
          mapping={mapping}
          onBack={() => setStep("mapping")}
          onCommit={commit}
          committing={committing}
          requiredReady={requiredReady}
        />
      ) : null}

      {step === "done" && commitResult ? (
        <DoneStep result={commitResult} onScan={() => navigate({ view: "scans" })} onAnother={() => setStep("file")} />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function StepRail({ step }: { step: string }) {
  const steps = [
    { key: "file", label: "1 · File" },
    { key: "mapping", label: "2 · Field mapping" },
    { key: "review", label: "3 · Review" },
    { key: "done", label: "4 · Imported" },
  ];
  const activeIndex = steps.findIndex((s) => s.key === step);
  return (
    <ol className="flex flex-wrap gap-x-2 gap-y-1 print:hidden" aria-label="Import progress">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2">
          <span
            className={cn(
              "micro-label border px-2 py-1",
              i < activeIndex && "border-healthy text-healthy",
              i === activeIndex && "border-ink bg-ink text-paper",
              i > activeIndex && "border-hairline"
            )}
            aria-current={i === activeIndex ? "step" : undefined}
          >
            {s.label}
          </span>
          {i < steps.length - 1 ? <span aria-hidden="true" className="text-hairline-strong">—</span> : null}
        </li>
      ))}
    </ol>
  );
}

function FileStep({
  dragActive,
  setDragActive,
  onFile,
  fileInputRef,
  scope,
  demo,
  onSample,
}: {
  dragActive: boolean;
  setDragActive: (v: boolean) => void;
  onFile: (file: File) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  scope: "demo" | "app";
  demo?: boolean;
  onSample: (text: string, name: string) => void;
}) {
  const samples = useMemo(() => buildSampleFiles(), []);
  return (
    <div className="flex flex-col gap-4">
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop a campaign CSV here, or press Enter to choose a file"
        className={cn(
          "flex flex-col items-center justify-center gap-3 border-2 border-dashed px-6 py-12 text-center transition-colors",
          dragActive ? "border-ink bg-paper-raised" : "border-hairline-strong bg-paper-raised/60 hover:border-ink-3"
        )}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onFile(file);
        }}
      >
        <FileUp size={28} className="text-ink-3" aria-hidden="true" />
        <div>
          <p className="text-[14px] font-medium text-ink">Drop a campaign CSV here</p>
          <p className="mt-1 text-[12.5px] text-ink-3">
            or choose a file · .csv only · up to {PRODUCT.scanner.maxImportRows.toLocaleString()} rows
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {demo ? (
        <Sheet label="SYNTHETIC SAMPLES" title="Or load a synthetic sample file">
          <ul>
            {samples.map((s) => (
              <li key={s.name} className="ledger-row flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="font-mono text-[12.5px] text-ink">{s.name}</p>
                  <DossierLine items={[s.description, `${s.rowCount} rows`, "SYNTHETIC DEMO DATA"]} />
                </div>
                <Button size="sm" variant="outline" className="gap-2" onClick={() => onSample(s.csvText, s.name)}>
                  <FileSpreadsheet size={14} aria-hidden="true" /> Load
                </Button>
              </li>
            ))}
          </ul>
        </Sheet>
      ) : null}
    </div>
  );
}

function MappingStep({
  preview,
  mapping,
  setMapping,
  requiredReady,
  hasCurrencyColumn,
  defaultCurrency,
  setDefaultCurrency,
  mixedCurrency,
  onBack,
  onNext,
}: {
  preview: PreviewData;
  mapping: Record<string, string>;
  setMapping: (m: Record<string, string>) => void;
  requiredReady: boolean;
  hasCurrencyColumn: boolean;
  defaultCurrency: string;
  setDefaultCurrency: (c: string) => void;
  mixedCurrency: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const roles = ["url", "spend", "campaign", "platform", "adGroup", "ad", "currency"];
  const suggestionFor = (role: string) => preview.suggestions.find((s) => s.role === role);

  return (
    <div className="flex flex-col gap-4">
      <Sheet
        label="FILE / ACCEPTED"
        title={preview.filename}
        labelAside={
          <DossierLine
            items={[
              `${preview.rowCount} rows`,
              `${preview.headers.length} columns`,
              `${preview.estimatedValid} estimated valid`,
              preview.estimatedRejected > 0 ? `${preview.estimatedRejected} need review` : null,
            ]}
          />
        }
      >
        <div className="flex flex-wrap gap-x-8 gap-y-2 px-4 py-3 sm:px-5">
          {preview.headers.slice(0, 14).map((h) => (
            <span key={h} className="font-mono text-[11.5px] text-ink-2">
              <span className="text-hairline-strong">[]</span> {h}
            </span>
          ))}
          {preview.headers.length > 14 ? <span className="micro-label">+{preview.headers.length - 14} MORE</span> : null}
        </div>
      </Sheet>

      <Sheet label="MAPPING" title="Map the fields" labelAside="Destination URL and spend are required">
        <div className="grid gap-px bg-hairline sm:grid-cols-2">
          {roles.map((role) => {
            const suggestion = suggestionFor(role);
            const required = role === "url" || role === "spend";
            const value = mapping[role] ?? "";
            return (
              <div key={role} className="bg-paper-raised px-4 py-3 sm:px-5">
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor={`map-${role}`} className="text-[13px] font-medium text-ink">
                    {ROLE_LABELS[role]}
                    {required ? <span className="ml-1 text-critical" aria-hidden="true">*</span> : null}
                    {required ? <span className="sr-only"> (required)</span> : null}
                  </label>
                  {suggestion?.confidence === "exact" && suggestion.header ? (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-healthy">
                      <Check size={11} aria-hidden="true" /> matched
                    </span>
                  ) : suggestion?.confidence === "fuzzy" && suggestion.header ? (
                    <span className="text-[11px] text-warning">possible match — confirm</span>
                  ) : (
                    <span className="micro-label">UNMAPPED</span>
                  )}
                </div>
                <Select
                  value={value || "__none__"}
                  onValueChange={(v) => {
                    const next = { ...mapping };
                    if (v === "__none__") delete next[role];
                    else next[role] = v;
                    setMapping(next);
                  }}
                >
                  <SelectTrigger id={`map-${role}`} className="mt-1.5 h-9 rounded-[2px] border-hairline bg-paper font-mono text-[12.5px]">
                    <SelectValue placeholder="Not mapped" />
                  </SelectTrigger>
                  <SelectContent className="rounded-[2px] border-hairline">
                    <SelectItem value="__none__" className="font-mono text-[12px]">Not mapped</SelectItem>
                    {preview.headers.map((h) => (
                      <SelectItem key={h} value={h} className="font-mono text-[12px]">
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {role === "currency" && !hasCurrencyColumn ? (
                  <div className="mt-2 flex items-center gap-2">
                    <label htmlFor="default-currency" className="text-[12px] text-ink-2">
                      No currency column. Apply one currency to all rows:
                    </label>
                    <Select value={defaultCurrency} onValueChange={setDefaultCurrency}>
                      <SelectTrigger id="default-currency" className="h-8 w-24 rounded-[2px] font-mono text-[12px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-[2px]">
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c} value={c} className="font-mono text-[12px]">{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        {mixedCurrency ? (
          <div className="border-t border-hairline px-4 py-3 sm:px-5">
            <p className="text-[13px] font-medium text-warning">
              This file contains more than one currency ({preview.currencies.join(", ")}).
            </p>
            <p className="mt-1 text-[12.5px] text-ink-2">
              LandingSentinel never silently combines currencies. Split the file by currency and import each part separately.
            </p>
          </div>
        ) : null}
      </Sheet>

      <div className="flex items-center justify-between print:hidden">
        <Button variant="outline" size="sm" onClick={onBack}>Back</Button>
        <Button size="sm" onClick={onNext} disabled={!requiredReady} className="gap-2">
          Review import <ArrowRight size={14} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function ReviewStep({
  preview,
  mapping,
  onBack,
  onCommit,
  committing,
  requiredReady,
}: {
  preview: PreviewData;
  mapping: Record<string, string>;
  onBack: () => void;
  onCommit: () => void;
  committing: boolean;
  requiredReady: boolean;
}) {
  const [showRejected, setShowRejected] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <Sheet label="REVIEW / VALIDATION" title="Import summary">
        <div className="grid grid-cols-2 gap-px bg-hairline sm:grid-cols-4">
          <Stat label="Rows in file" value={preview.rowCount.toLocaleString()} />
          <Stat label="Estimated valid" value={preview.estimatedValid.toLocaleString()} tone="healthy" />
          <Stat label="Need review" value={preview.estimatedRejected.toLocaleString()} tone={preview.estimatedRejected > 0 ? "warning" : undefined} />
          <Stat label="Currencies" value={preview.currencies.join(" / ") || "—"} />
        </div>
        <div className="px-4 py-3 sm:px-5">
          <p className="text-[13px] leading-relaxed text-ink-2">
            Invalid rows are rejected individually — they never destroy the rest of the import. The server
            re-validates everything before anything is stored.
          </p>
          {preview.estimatedRejected > 0 ? (
            <button
              type="button"
              onClick={() => setShowRejected(!showRejected)}
              className="micro-label mt-3 border-b border-dotted border-hairline-strong text-ink-2 transition-colors hover:text-ink"
              aria-expanded={showRejected}
            >
              {showRejected ? "HIDE" : "SHOW"} {Math.min(preview.rejectedPreview.length, preview.estimatedRejected)} FLAGGED ROW{preview.estimatedRejected === 1 ? "" : "S"} {showRejected ? "↑" : "↓"}
            </button>
          ) : null}
          {showRejected ? (
            <div className="thin-scroll mt-3 max-h-72 overflow-y-auto border border-hairline">
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 bg-paper-raised">
                  <tr className="border-b border-hairline-strong">
                    <th scope="col" className="micro-label px-3 py-2">ROW</th>
                    <th scope="col" className="micro-label px-3 py-2">REASON</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rejectedPreview.map((r) => (
                    <tr key={r.index} className="border-b border-hairline last:border-b-0">
                      <td className="num px-3 py-2 font-mono text-[11.5px] text-ink-3">{r.index + 2}</td>
                      <td className="px-3 py-2 text-[12px] text-ink-2">
                        <span className="font-mono text-[10.5px] text-critical">{r.code}</span>{" "}
                        {r.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </Sheet>

      <Sheet label="MAPPING / FINAL" title="Fields to import">
        <ul className="px-4 py-2 sm:px-5">
          {Object.entries(mapping)
            .filter(([, header]) => header)
            .map(([role, header]) => (
              <li key={role} className="flex items-center justify-between gap-3 border-b border-hairline py-2 last:border-b-0">
                <span className="text-[13px] text-ink">{ROLE_LABELS[role] ?? role}</span>
                <span className="font-mono text-[12px] text-ink-2">
                  <span className="text-healthy">✓</span> {header}
                </span>
              </li>
            ))}
        </ul>
      </Sheet>

      <div className="flex items-center justify-between print:hidden">
        <Button variant="outline" size="sm" onClick={onBack}>Back</Button>
        <Button size="sm" onClick={onCommit} disabled={committing || !requiredReady}>
          {committing ? "Importing…" : `Import ${preview.estimatedValid.toLocaleString()} rows`}
        </Button>
      </div>
    </div>
  );
}

function DoneStep({ result, onScan, onAnother }: { result: CommitResult; onScan: () => void; onAnother: () => void }) {
  const s = result.summary;
  return (
    <div className="flex flex-col gap-4">
      <Sheet label="IMPORT / COMPLETE" title="Campaign data imported">
        <div className="grid grid-cols-2 gap-px bg-hairline sm:grid-cols-4">
          <Stat label="Rows imported" value={s.validRowCount.toLocaleString()} tone="healthy" />
          <Stat label="Rows needing review" value={s.rejectedRowCount.toLocaleString()} tone={s.rejectedRowCount > 0 ? "warning" : undefined} />
          <Stat label="Destinations aggregated" value={s.destinationCount.toLocaleString()} />
          <div className="bg-paper-raised px-4 py-3 sm:px-5">
            <MicroLabel>TOTAL SPEND</MicroLabel>
            <Money minor={s.totalSpendMinor} currency={s.currency} className="mt-1 block text-lg font-semibold" exact />
          </div>
        </div>
        <div className="px-4 py-3 sm:px-5">
          <MarginNote>
            {s.validRowCount} rows imported. {s.rejectedRowCount > 0 ? `${s.rejectedRowCount} rows need review — they were skipped, not stored.` : "All rows passed validation."}
            {" "}Campaign rows sharing a landing page (after removing attribution parameters) were aggregated into destinations.
          </MarginNote>
        </div>
      </Sheet>
      <div className="flex flex-wrap gap-2 print:hidden">
        <Button size="sm" onClick={onScan} className="gap-2">
          <Radar size={14} aria-hidden="true" /> Run a scan
        </Button>
        <Button size="sm" variant="outline" onClick={onAnother}>Import another file</Button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "healthy" | "warning" }) {
  return (
    <div className="bg-paper-raised px-4 py-3 sm:px-5">
      <MicroLabel>{label.toUpperCase()}</MicroLabel>
      <span
        className={cn(
          "num mt-1 block font-mono text-lg font-semibold tabular-nums",
          tone === "healthy" && "text-healthy",
          tone === "warning" && "text-warning"
        )}
      >
        {value}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */

import { DEMO_DESTINATIONS } from "@/lib/scanner/demo-fixtures";

/** Build synthetic sample CSVs from the same fixture dataset (demo mode only). */
function buildSampleFiles(): { name: string; description: string; rowCount: number; csvText: string }[] {
  const build = (batch: string, platformLabel: (p: string) => string) => {
    const rows = DEMO_DESTINATIONS.flatMap((d) => d.rows.filter((r) => r.batch === batch));
    const header = [
      platformLabel(batch === "google-ads-sample.csv" ? "google" : batch === "meta-ads-sample.csv" ? "meta" : "other"),
      "Campaign",
      "Ad group",
      "Final URL",
      "Cost",
      "Currency",
    ].join(",");
    const lines = rows.map((r) =>
      [
        platformLabel(r.platform),
        `"${r.campaignName}"`,
        r.adGroupName ? `"${r.adGroupName}"` : "",
        r.originalUrl,
        (r.spendMinor / 100).toFixed(2),
        "GBP",
      ].join(",")
    );
    return { header, lines, rowCount: rows.length };
  };

  const google = build("google-ads-sample.csv", (p) => (p === "google" ? "Google Ads" : p));
  const meta = build("meta-ads-sample.csv", (p) => (p === "meta" ? "Meta" : p));
  const mixed = build("paid-media-mixed-sample.csv", (p) =>
    p === "tiktok" ? "TikTok" : p === "linkedin" ? "LinkedIn" : p === "meta" ? "Meta" : "Google Ads"
  );

  return [
    {
      name: "google-ads-sample.csv",
      description: "Google Ads campaign export",
      rowCount: google.rowCount,
      csvText: [google.header, ...google.lines].join("\n"),
    },
    {
      name: "meta-ads-sample.csv",
      description: "Meta Ads campaign export",
      rowCount: meta.rowCount,
      csvText: [meta.header, ...meta.lines].join("\n"),
    },
    {
      name: "paid-media-mixed-sample.csv",
      description: "TikTok + LinkedIn campaign export",
      rowCount: mixed.rowCount,
      csvText: [mixed.header, ...mixed.lines].join("\n"),
    },
  ];
}
