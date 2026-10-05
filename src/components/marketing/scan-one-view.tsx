"use client";

/**
 * Public one-page checker — the second sales instrument.
 *
 * One URL, optional platform/spend/expected-tracker context, and the REAL
 * scanning engine (same SSRF-hardened path as the paid product). The
 * evaluation is ephemeral: nothing is stored, no workspace is involved.
 * The result is deliberately compact — this proves the engine is real; the
 * portfolio workflow belongs to the full demo and the purchased product.
 */

import { useMemo, useState } from "react";
import { useRouter } from "@/store/router";
import { PRODUCT } from "@/config/product";
import { Sheet, MicroLabel, DossierLine, MarginNote } from "@/components/paper/paper";
import { StatusStamp, SeverityBadge } from "@/components/paper/stamp";
import { SentinelMark } from "@/components/paper/sentinel-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { api, ApiClientError } from "@/lib/client/api";
import { ArrowLeft, ArrowRight, Globe, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type TrackerStatus = { key: string; label: string; detected: boolean; relevant: boolean };
type AttributionItem = { param: string; status: "preserved" | "removed" | "changed" | "added"; originalValue?: string; finalValue?: string };
type FindingItem = { key: string; title: string; severity: string; summary: string; explanation: string; recommendation: string | null };
type ContentSummary = {
  title: string | null;
  noindex: boolean;
  soft404: boolean;
  maintenance: boolean;
  soldOut: boolean;
  ctaDetected: boolean;
  formDetected: boolean;
  wordCount: number;
};

type EvaluationResult = {
  outcome: "checked" | "unreachable" | "blocked";
  requestedUrl: string;
  message?: string;
  fetch?: {
    finalUrl: string | null;
    httpStatus: number | null;
    responseTimeMs: number | null;
    contentType?: string | null;
    redirects: { fromUrl: string; toUrl: string; statusCode: number }[];
    errorCode?: string;
    message?: string;
  };
  trackers?: TrackerStatus[];
  content?: ContentSummary | null;
  attribution?: AttributionItem[];
  findings?: FindingItem[];
  spend?: { minor: number; currency: string } | null;
  platform?: string;
  expectedTracker?: string | null;
  rateLimit?: { remaining: number };
};

const PLATFORM_OPTIONS = [
  { value: "none", label: "Not specified" },
  { value: "google", label: "Google Ads" },
  { value: "meta", label: "Meta" },
  { value: "tiktok", label: "TikTok" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "other", label: "Other" },
];

const TRACKER_OPTIONS = [
  { value: "none", label: "No expectation" },
  { value: "meta_pixel", label: "Meta Pixel" },
  { value: "google_ads", label: "Google Ads tag" },
  { value: "ga4", label: "Google Analytics (GA4)" },
  { value: "gtm", label: "Google Tag Manager" },
  { value: "tiktok_pixel", label: "TikTok Pixel" },
  { value: "linkedin_insight", label: "LinkedIn Insight Tag" },
];

const DEFAULT_TRACKER_BY_PLATFORM: Record<string, string> = {
  meta: "meta_pixel",
  google: "google_ads",
  tiktok: "tiktok_pixel",
  linkedin: "linkedin_insight",
};

function stampFor(result: EvaluationResult): "DO_NOT_LAUNCH" | "REVIEW_BEFORE_LAUNCH" | "LAUNCH_READY" {
  const critical = result.findings?.some((f) => f.severity === "critical") ?? false;
  const warning = result.findings?.some((f) => f.severity === "warning") ?? false;
  if (result.outcome !== "checked" || critical) return "DO_NOT_LAUNCH";
  if (warning) return "REVIEW_BEFORE_LAUNCH";
  return "LAUNCH_READY";
}

export function ScanOneView() {
  const navigate = useRouter((s) => s.navigate);
  const [url, setUrl] = useState("");
  const [platform, setPlatform] = useState("none");
  const [expectedTracker, setExpectedTracker] = useState("none");
  const [spendAmount, setSpendAmount] = useState("");
  const [currency, setCurrency] = useState("GBP");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<EvaluationResult | null>(null);

  const spendMinor = useMemo(() => {
    if (!spendAmount.trim()) return null;
    const n = Number.parseFloat(spendAmount.replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
  }, [spendAmount]);

  const onPlatformChange = (value: string) => {
    setPlatform(value);
    // Auto-select the expected tracker where sensible, still changeable.
    setExpectedTracker(DEFAULT_TRACKER_BY_PLATFORM[value] ?? "none");
  };

  const runCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || checking) return;
    setChecking(true);
    setResult(null);
    try {
      const data = await api<EvaluationResult>("/api/public/scan", {
        method: "POST",
        body: JSON.stringify({
          url: url.trim(),
          ...(platform !== "none" ? { platform } : {}),
          ...(spendMinor !== null ? { spendMinor, currency } : {}),
          ...(expectedTracker !== "none" ? { expectedTracker } : {}),
        }),
      });
      setResult(data);
    } catch (err) {
      if (err instanceof ApiClientError) {
        toast({ title: "The check could not run", description: err.message });
      } else {
        toast({ title: "The check could not run", description: "The request failed before it reached the scanner." });
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-hairline bg-paper/95 backdrop-blur-[2px]">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button type="button" onClick={() => navigate({ view: "home" })} className="flex items-center gap-2.5 text-left">
            <SentinelMark size={22} />
            <span className="font-display text-[17px] font-bold leading-none tracking-tight">{PRODUCT.name}</span>
          </button>
          <button type="button" onClick={() => navigate({ view: "home" })} className="micro-label transition-colors hover:text-ink">
            ← BACK TO PRODUCT SITE
          </button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        <div>
          <MicroLabel>ONE-PAGE CHECK · REAL SCANNER</MicroLabel>
          <h1 className="font-display mt-1 text-2xl font-bold leading-tight tracking-tight sm:text-[28px]">
            Scan one landing page.
          </h1>
          <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-ink-2">
            The same engine the paid product runs — SSRF-hardened, redirect-aware, evidence-backed.
            Public evaluation scans are not added to a workspace and are never stored.
          </p>
        </div>

        <Sheet label="CHECK FORM" title="The page your ads point at">
          <form onSubmit={runCheck} className="flex flex-col gap-4 px-4 py-5 sm:px-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="check-url" className="text-[12.5px] font-medium">
                Landing-page URL <span className="text-critical">*</span>
              </Label>
              <Input
                id="check-url"
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/landing?utm_source=google"
                className="font-mono text-[12.5px]"
                required
                disabled={checking}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="check-platform" className="text-[12.5px] font-medium">Ad platform (optional)</Label>
                <Select value={platform} onValueChange={onPlatformChange} disabled={checking}>
                  <SelectTrigger id="check-platform" className="h-9 rounded-[2px] text-[12.5px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORM_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value} className="text-[12.5px]">{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="check-tracker" className="text-[12.5px] font-medium">Expected tracker (optional)</Label>
                <Select value={expectedTracker} onValueChange={setExpectedTracker} disabled={checking}>
                  <SelectTrigger id="check-tracker" className="h-9 rounded-[2px] text-[12.5px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRACKER_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value} className="text-[12.5px]">{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="check-spend" className="text-[12.5px] font-medium">Associated monthly spend (optional)</Label>
                <Input
                  id="check-spend"
                  inputMode="decimal"
                  value={spendAmount}
                  onChange={(e) => setSpendAmount(e.target.value)}
                  placeholder="4000"
                  disabled={checking}
                  aria-describedby="spend-note"
                />
                <p id="spend-note" className="text-[11px] text-ink-3">
                  Used only to show associated spend. It is not a measurement of lost revenue.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="check-currency" className="text-[12.5px] font-medium">Currency</Label>
                <Select value={currency} onValueChange={setCurrency} disabled={checking}>
                  <SelectTrigger id="check-currency" className="h-9 rounded-[2px] font-mono text-[12.5px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["GBP", "USD", "EUR", "INR", "AUD", "CAD"].map((c) => (
                      <SelectItem key={c} value={c} className="font-mono text-[12.5px]">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
              <p className="text-[11.5px] text-ink-3">Limit: 3 checks per hour per visitor.</p>
              <Button type="submit" size="sm" disabled={checking || !url.trim()} className="gap-2">
                <Globe size={14} aria-hidden="true" /> {checking ? "Checking…" : "Run real check"}
              </Button>
            </div>
          </form>
        </Sheet>

        {checking ? (
          <div className="flex items-center gap-3 border border-hairline bg-paper-raised px-4 py-4 sm:px-5">
            <span className="inspect-row relative inline-block h-4 w-4 border border-ink" aria-hidden="true" />
            <p className="text-[13px] text-ink-2">
              Requesting the page, following redirects, inspecting the HTML…
            </p>
          </div>
        ) : null}

        {result ? <ResultCard result={result} navigate={navigate} /> : null}
      </div>

      <footer className="mt-auto border-t border-hairline bg-paper-raised">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <MicroLabel>ONE PUBLIC PAGE · NOTHING STORED</MicroLabel>
          <button type="button" onClick={() => navigate({ view: "demo" })} className="micro-label transition-colors hover:text-ink">
            SEE THE FULL CAMPAIGN DEMO →
          </button>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ResultCard({ result, navigate }: { result: EvaluationResult; navigate: ReturnType<typeof useRouter.getState>["navigate"] }) {
  const f = result.fetch;
  const relevantTrackers = (result.trackers ?? []).filter((t) => t.relevant);
  const otherTrackers = (result.trackers ?? []).filter((t) => !t.relevant);
  const removedAttribution = (result.attribution ?? []).filter((a) => a.status === "removed" || a.status === "changed");
  const content = result.content;
  const spendLabel =
    result.spend && result.spend.minor > 0
      ? new Intl.NumberFormat("en-GB", { style: "currency", currency: result.spend.currency }).format(result.spend.minor / 100)
      : null;

  return (
    <>
      {result.outcome === "blocked" ? (
        <Sheet label="CHECK / REJECTED" title="This address was not requested">
          <div className="flex items-start gap-3 px-4 py-5 sm:px-5">
            <ShieldCheck size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-2" />
            <p className="text-[13.5px] leading-relaxed text-ink-2">{result.message}</p>
          </div>
        </Sheet>
      ) : (
        <Sheet
          label="CHECK RESULT"
          title="One destination, inspected with the real engine"
          labelAside={<DossierLine items={[result.rateLimit ? `${result.rateLimit.remaining} CHECKS LEFT THIS HOUR` : null]} />}
        >
          <div className="flex flex-col gap-4 px-4 py-5 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <StatusStamp status={stampFor(result)} size="lg" animated rotation={-3} />
              {spendLabel ? (
                <p className="text-[13px] text-ink-2">
                  <strong className="font-semibold text-ink">{spendLabel}</strong> associated campaign spend
                </p>
              ) : null}
            </div>

            {result.outcome === "unreachable" ? (
              <MarginNote>
                The destination could not be inspected{f?.message ? ` — ${f.message}` : "."} This is exactly the kind of
                finding the paid product ranks by spend across a whole portfolio.
              </MarginNote>
            ) : null}

            {/* Destination + HTTP response */}
            <dl className="grid gap-px border border-hairline bg-hairline sm:grid-cols-2">
              <ResultCell label="Requested URL" mono full>{result.requestedUrl}</ResultCell>
              <ResultCell label="Final URL" mono full>{f?.finalUrl ?? "—"}</ResultCell>
              <ResultCell label="HTTP response">
                <span className={cn("font-mono", (f?.httpStatus ?? 0) >= 400 ? "text-critical" : (f?.httpStatus ?? 0) >= 300 ? "text-warning" : "text-healthy")}>
                  {f?.httpStatus ?? "—"}
                </span>
              </ResultCell>
              <ResultCell label="Server response duration">
                <span className="font-mono">{f?.responseTimeMs != null ? `${f.responseTimeMs} ms` : "—"}</span>
              </ResultCell>
            </dl>

            {/* Redirects */}
            {f && f.redirects.length > 0 ? (
              <div>
                <MicroLabel>REDIRECTS · {f.redirects.length}</MicroLabel>
                <ol className="mt-2 border border-hairline bg-paper-raised">
                  {f.redirects.map((h, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline px-3 py-2 last:border-b-0">
                      <span className="num font-mono text-[10px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                      <span className="font-mono text-[11px] font-semibold">{h.statusCode}</span>
                      <span className="url-wrap min-w-0 flex-1 font-mono text-[11.5px] text-ink-2">{h.fromUrl} → {h.toUrl}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {/* Campaign parameter survival */}
            {result.outcome === "checked" ? (
              <div>
                <MicroLabel>CAMPAIGN PARAMETER SURVIVAL</MicroLabel>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px]">
                  {(result.attribution ?? []).length === 0 ? (
                    <p className="text-ink-3">No attribution parameters on the requested URL.</p>
                  ) : (
                    (result.attribution ?? []).map((a) => (
                      <span key={a.param} className="flex items-center gap-1.5">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "inline-block h-2 w-2",
                            a.status === "preserved" ? "bg-healthy" : a.status === "added" ? "bg-healthy" : "bg-critical"
                          )}
                        />
                        <span className="font-mono text-[11.5px]">{a.param}</span>
                        <span className={cn("text-[11px]", a.status === "preserved" ? "text-healthy" : a.status === "added" ? "text-ink-3" : "text-critical")}>
                          {a.status}
                        </span>
                      </span>
                    ))
                  )}
                </div>
                {removedAttribution.length > 0 ? (
                  <MarginNote className="mt-2">
                    Analytics reading parameters from the landing URL will not attribute these visits to your campaign values.
                  </MarginNote>
                ) : null}
              </div>
            ) : null}

            {/* Tracker status */}
            {result.outcome === "checked" && relevantTrackers.length > 0 ? (
              <div>
                <MicroLabel>TRACKER STATUS</MicroLabel>
                <ul className="mt-2 divide-y divide-hairline border border-hairline bg-paper-raised">
                  {relevantTrackers.map((t) => (
                    <li key={t.key} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2">
                      <span className="text-[12.5px] text-ink">{t.label}</span>
                      <span className={cn("micro-label", t.detected ? "!text-healthy" : "!text-critical")}>
                        {t.detected ? "DETECTED" : "NOT DETECTED"}
                      </span>
                    </li>
                  ))}
                </ul>
                {otherTrackers.length > 0 ? (
                  <p className="mt-1.5 text-[11.5px] text-ink-3">
                    Also checked: {otherTrackers.map((t) => `${t.label} ${t.detected ? "✓" : "—"}`).join(" · ")}
                  </p>
                ) : null}
                {(result.trackers ?? []).some((t) => t.key === "gtm" && t.detected) &&
                relevantTrackers.some((t) => !t.detected && t.key !== "gtm") ? (
                  <MarginNote className="mt-2">
                    Google Tag Manager was detected. A missing tag can load at runtime through GTM — verify the rendered
                    page before treating this as a confirmed tracking failure.
                  </MarginNote>
                ) : null}
              </div>
            ) : null}

            {/* Content checks */}
            {content && result.outcome === "checked" ? (
              <div>
                <MicroLabel>CONTENT CHECKS</MicroLabel>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px]">
                  <ContentFlag ok={Boolean(content.title)} label={content.title ? `Title: ${content.title.slice(0, 40)}` : "No title"} />
                  <ContentFlag ok={!content.noindex} label={content.noindex ? "noindex set" : "Indexable"} warn={content.noindex} />
                  <ContentFlag ok={!content.soft404} label={content.soft404 ? "Soft 404 content" : "Real page content"} warn={content.soft404} />
                  <ContentFlag ok={!content.maintenance} label={content.maintenance ? "Maintenance page" : "No maintenance wording"} warn={content.maintenance} />
                  <ContentFlag ok={!content.soldOut} label={content.soldOut ? "Sold-out wording" : "No sold-out wording"} warn={content.soldOut} />
                  <ContentFlag ok={content.ctaDetected || content.formDetected} label={content.ctaDetected ? "Call-to-action present" : content.formDetected ? "Form present" : "No CTA or form found"} warn={!content.ctaDetected && !content.formDetected} />
                  <ContentFlag ok={content.wordCount >= 50} label={`${content.wordCount} words`} warn={content.wordCount < 50} />
                </div>
              </div>
            ) : null}

            {/* Findings */}
            {result.findings && result.findings.length > 0 ? (
              <div>
                <MicroLabel>FINDINGS · {result.findings.length}</MicroLabel>
                <ul className="mt-2 divide-y divide-hairline border border-hairline bg-paper-raised">
                  {result.findings.map((fd) => (
                    <li key={fd.key} className="flex flex-col gap-1 px-3 py-2.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="text-[13px] font-medium text-ink">{fd.title}</span>
                        <SeverityBadge severity={fd.severity as "critical" | "warning" | "info"} />
                      </div>
                      <p className="text-[12px] leading-relaxed text-ink-2">{fd.summary}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </Sheet>
      )}

      {/* The free-to-paid bridge */}
      <Sheet label="WHAT THE FULL PRODUCT DOES" title="This is one destination.">
        <div className="flex flex-col gap-4 px-4 py-5 sm:px-5">
          <p className="max-w-xl text-[13.5px] leading-relaxed text-ink-2">
            LandingSentinel imports an entire campaign portfolio, groups spend by destination, ranks findings by
            financial relevance, keeps scan history, and generates white-label reports.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={() => navigate({ view: "demo" })} className="gap-2">
              See the full campaign demo <ArrowRight size={13} aria-hidden="true" />
            </Button>
            {PRODUCT.checkoutUrl ? (
              <a
                href={PRODUCT.checkoutUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-2 rounded-[2px] border border-hairline-strong bg-paper px-4 text-[13px] font-medium text-ink transition-colors hover:bg-paper-deep"
              >
                Get the source — £349
              </a>
            ) : (
              <Button size="sm" variant="outline" onClick={() => navigate({ view: "license" })} className="gap-2">
                Get the source — £349
              </Button>
            )}
          </div>
        </div>
      </Sheet>
    </>
  );
}

function ResultCell({ label, children, mono, full }: { label: string; children: React.ReactNode; mono?: boolean; full?: boolean }) {
  return (
    <div className={cn("bg-paper-raised px-3 py-2.5", full && "sm:col-span-2")}>
      <span className="micro-label">{label.toUpperCase()}</span>
      <div className={cn("mt-0.5 text-[12.5px] text-ink", mono && "url-wrap break-all font-mono text-[11.5px]")}>{children}</div>
    </div>
  );
}

function ContentFlag({ ok, label, warn }: { ok: boolean; label: string; warn?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className={cn("inline-block h-2 w-2", ok ? "bg-healthy" : "bg-warning")} />
      <span className={cn("text-[12px]", warn ? "text-warning" : "text-ink-2")}>{label}</span>
    </span>
  );
}
