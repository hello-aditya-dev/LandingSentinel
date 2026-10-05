"use client";

/**
 * Settings: overview, white-label branding, scanner configuration (read-only
 * view of env-driven limits), and system diagnostics.
 */

import { useState } from "react";
import { useBranding, useSystem } from "@/lib/client/queries";
import { api, withScope } from "@/lib/client/api";
import { useRouter } from "@/store/router";
import { Sheet, MicroLabel, DossierLine, MarginNote } from "@/components/paper/paper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { Check, RefreshCw, ShieldCheck, TriangleAlert, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

type Tab = "overview" | "branding" | "scanning" | "system";

export function SettingsView({ scope, tab }: { scope: "demo" | "app"; tab: Tab }) {
  const navigate = useRouter((s) => s.navigate);
  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "branding", label: "White-label branding" },
    { key: "scanning", label: "Scanning" },
    { key: "system", label: "System" },
  ];
  return (
    <div className="flex flex-col gap-6">
      <div>
        <MicroLabel>SETTINGS</MicroLabel>
        <h1 className="font-display mt-1 text-2xl font-bold leading-tight tracking-tight sm:text-[28px]">Settings</h1>
      </div>
      <div className="flex flex-wrap gap-1 print:hidden" role="tablist" aria-label="Settings areas">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            type="button"
            onClick={() => navigate({ view: "settings", tab: t.key })}
            className={cn(
              "border px-3 py-1.5 text-[13px] font-medium transition-colors",
              tab === t.key ? "border-ink bg-ink text-paper" : "border-hairline text-ink-2 hover:border-hairline-strong hover:text-ink"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? <OverviewTab /> : null}
      {tab === "branding" ? <BrandingTab scope={scope} /> : null}
      {tab === "scanning" ? <ScanningTab /> : null}
      {tab === "system" ? <SystemTab /> : null}
    </div>
  );
}

function OverviewTab() {
  return (
    <Sheet label="SETTINGS / OVERVIEW" title="How this deployment is configured">
      <div className="space-y-4 px-4 py-5 text-[13.5px] leading-relaxed text-ink-2 sm:px-5">
        <p>
          <span className="font-semibold text-ink">White-label branding</span> — the product name, agency identity and
          report branding used across navigation and generated reports. Database values override the{" "}
          <span className="font-mono text-[12px]">NEXT_PUBLIC_*</span> environment fallbacks. See{" "}
          <span className="font-mono text-[12px]">BRANDING.md</span>.
        </p>
        <p>
          <span className="font-semibold text-ink">Scanning</span> — resource limits for the destination scanner
          (targets per scan, concurrency, timeout, redirect budget, body cap). Set via environment variables;
          see <span className="font-mono text-[12px]">CONFIGURATION.md</span>.
        </p>
        <p>
          <span className="font-semibold text-ink">System</span> — deployment diagnostics: database connection,
          schema state, scanner configuration, runtime modes.
        </p>
      </div>
    </Sheet>
  );
}

function BrandingTab({ scope }: { scope: "demo" | "app" }) {
  const { data, isLoading, mutation } = useBranding(scope);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Record<string, string> | null>(null);

  if (isLoading || !data) return <Skeleton className="h-96 rounded-[2px] bg-paper-deep" />;

  const branding = data.branding;
  const values = form ?? {
    productName: branding.productName,
    agencyName: branding.agencyName,
    logoUrl: branding.logoUrl ?? "",
    accentColor: branding.accentColor,
    supportEmail: branding.supportEmail ?? "",
    website: branding.website ?? "",
    reportFooter: branding.reportFooter ?? "",
    reportContactName: branding.reportContactName ?? "",
  };
  const dirty = form !== null;

  const fields: { key: string; label: string; placeholder: string; hint?: string; mono?: boolean }[] = [
    { key: "productName", label: "Product name", placeholder: "LandingSentinel", hint: "Shown in navigation and reports." },
    { key: "agencyName", label: "Agency name", placeholder: "Meridian Performance Group", hint: "Appears on reports and the app header." },
    { key: "reportContactName", label: "Report contact name", placeholder: "A. Sharma, Performance Lead", hint: "Optional. Printed under the agency name." },
    { key: "logoUrl", label: "Logo URL", placeholder: "https://agency.example/logo.png", hint: "Optional. Used on reports.", mono: true },
    { key: "accentColor", label: "Accent colour", placeholder: "#A7372D", hint: "Hex colour used for report rules and accents.", mono: true },
    { key: "supportEmail", label: "Support email", placeholder: "preflight@agency.example", mono: true },
    { key: "website", label: "Website", placeholder: "https://agency.example", mono: true },
    { key: "reportFooter", label: "Report footer", placeholder: "Prepared by Meridian Performance Group", hint: "Optional line at the foot of every report." },
  ];

  const save = async () => {
    if (!form) return;
    mutation.mutate(
      {
        productName: form.productName,
        agencyName: form.agencyName,
        logoUrl: form.logoUrl || null,
        accentColor: /^#[0-9a-fA-F]{6}$/.test(form.accentColor) ? form.accentColor : undefined,
        supportEmail: form.supportEmail || null,
        website: form.website || null,
        reportFooter: form.reportFooter || null,
        reportContactName: form.reportContactName || null,
      },
      {
        onSuccess: () => {
          toast({ title: "Branding saved", description: "Navigation and future reports use the new identity." });
          setForm(null);
          queryClient.invalidateQueries({ queryKey: ["branding", scope] });
        },
        onError: (err) => toast({ title: "Could not save branding", description: err instanceof Error ? err.message : undefined }),
      }
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Sheet
        label="BRANDING / WHITE-LABEL"
        title="Product identity"
        labelAside={dirty ? <span className="micro-label !text-warning">UNSAVED CHANGES</span> : <span className="micro-label !text-healthy">SAVED</span>}
      >
        <div className="grid gap-px bg-hairline sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.key} className="bg-paper-raised px-4 py-3 sm:px-5">
              <Label htmlFor={`branding-${f.key}`} className="text-[13px] font-medium text-ink">
                {f.label}
              </Label>
              <Input
                id={`branding-${f.key}`}
                value={values[f.key] ?? ""}
                placeholder={f.placeholder}
                onChange={(e) => setForm({ ...values, [f.key]: e.target.value })}
                className={cn("mt-1.5 h-9 rounded-[2px] border-hairline bg-paper font-[12.5px]", f.mono && "font-mono")}
              />
              {f.hint ? <p className="mt-1 text-[11.5px] text-ink-3">{f.hint}</p> : null}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-hairline px-4 py-3 sm:px-5">
          {dirty ? (
            <Button size="sm" variant="outline" onClick={() => setForm(null)}>
              Reset
            </Button>
          ) : null}
          <Button size="sm" onClick={save} disabled={!dirty || mutation.isPending} className="gap-2">
            <Check size={14} aria-hidden="true" /> {mutation.isPending ? "Saving…" : "Save branding"}
          </Button>
        </div>
      </Sheet>
      <MarginNote>
        Precedence: these database values override <span className="font-mono text-[12px]">NEXT_PUBLIC_PRODUCT_NAME</span>,{" "}
        <span className="font-mono text-[12px]">NEXT_PUBLIC_AGENCY_NAME</span> and{" "}
        <span className="font-mono text-[12px]">NEXT_PUBLIC_ACCENT_COLOR</span> when set. See{" "}
        <span className="font-mono text-[12px]">BRANDING.md</span> for the fastest rebrand path.
      </MarginNote>
    </div>
  );
}

function ScanningTab() {
  const { data } = useSystem();
  if (!data) return <Skeleton className="h-64 rounded-[2px] bg-paper-deep" />;
  const s = data.scanner;
  const rows: { label: string; value: string; env: string }[] = [
    { label: "Maximum destinations per interactive scan", value: String(s.maxTargets), env: "SCAN_MAX_TARGETS" },
    { label: "Concurrent URL scans", value: String(s.concurrency), env: "SCAN_CONCURRENCY" },
    { label: "Request timeout", value: `${(s.timeoutMs / 1000).toFixed(0)} s`, env: "SCAN_TIMEOUT_MS" },
    { label: "Maximum redirects per URL", value: String(s.maxRedirects), env: "SCAN_MAX_REDIRECTS" },
    { label: "Maximum downloaded HTML", value: `${(s.maxBodyBytes / (1024 * 1024)).toFixed(0)} MB`, env: "SCAN_MAX_BODY_BYTES" },
  ];
  return (
    <div className="flex flex-col gap-4">
      <Sheet label="SCANNER / LIMITS" title="Scanner configuration">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-hairline-strong">
              <th scope="col" className="micro-label px-4 py-2 sm:px-5">LIMIT</th>
              <th scope="col" className="micro-label px-3 py-2 text-right">VALUE</th>
              <th scope="col" className="micro-label px-4 py-2 sm:px-5">ENVIRONMENT VARIABLE</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.env} className="border-b border-hairline last:border-b-0">
                <td className="px-4 py-2.5 text-[13px] text-ink sm:px-5">{r.label}</td>
                <td className="num px-3 py-2.5 text-right font-mono text-[13px] font-semibold">{r.value}</td>
                <td className="px-4 py-2.5 font-mono text-[11.5px] text-ink-2 sm:px-5">{r.env}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Sheet>
      <Sheet label="SCANNER / BEHAVIOUR" title="How the scanner treats destinations">
        <div className="space-y-2.5 px-4 py-4 text-[13px] leading-relaxed text-ink-2 sm:px-5">
          <p>• Only <span className="font-mono text-[12px]">http</span> and <span className="font-mono text-[12px]">https</span> destinations are requested. URLs with embedded credentials are rejected.</p>
          <p>• Hostnames resolving to loopback, private, link-local, multicast or cloud-metadata ranges are never requested (SSRF protection).</p>
          <p>• Redirects are followed manually with re-validation at every hop; loops stop the scan of that destination safely.</p>
          <p>• One conservative retry is made for transient connection failures. Blocked URLs, 404s and invalid URLs are never retried.</p>
          <p>• Non-HTML responses are reported clearly and skipped for page-level checks.</p>
        </div>
      </Sheet>
    </div>
  );
}

function SystemTab() {
  const { data, isLoading, refetch, isFetching } = useSystem();
  const [checks, setChecks] = useState<{ name: string; status: string; detail: string }[] | null>(null);
  const [running, setRunning] = useState(false);

  const runCheck = async () => {
    setRunning(true);
    try {
      const result = await api<{ checks: { name: string; status: string; detail: string }[]; healthy: boolean }>("/api/system", { method: "POST" });
      setChecks(result.checks);
      toast({
        title: result.healthy ? "System check passed" : "System check found problems",
        description: result.healthy ? "All subsystems responded." : "See the diagnostics below.",
      });
    } finally {
      setRunning(false);
    }
  };

  if (isLoading || !data) return <Skeleton className="h-64 rounded-[2px] bg-paper-deep" />;

  const display = checks ?? data.checks;

  return (
    <div className="flex flex-col gap-4">
      <Sheet
        label="SYSTEM / DIAGNOSTICS"
        title="Deployment diagnostics"
        labelAside={
          <Button size="sm" variant="outline" onClick={runCheck} disabled={running} className="gap-2">
            <RefreshCw size={13} aria-hidden="true" className={running ? "animate-spin" : undefined} />
            {running ? "Checking…" : "Run system check"}
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-px bg-hairline sm:grid-cols-4">
          <DiagCell label="Application version" value={`${data.version} · ${data.releaseName}`} />
          <DiagCell label="Environment" value={data.environment} />
          <DiagCell label="Node" value={data.nodeVersion} mono />
          <DiagCell label="Demo mode" value={data.demoMode ? "Enabled" : "Disabled"} tone={data.demoMode ? "warn" : undefined} />
        </div>
        <ul className="border-t border-hairline">
          {display.map((c) => (
            <li key={c.name} className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2.5 last:border-b-0 sm:px-5">
              <span className="flex items-center gap-2.5 text-[13px] text-ink">
                {c.status === "ok" ? (
                  <Check size={14} className="text-healthy" aria-hidden="true" />
                ) : c.status === "warn" ? (
                  <TriangleAlert size={14} className="text-warning" aria-hidden="true" />
                ) : (
                  <XCircle size={14} className="text-critical" aria-hidden="true" />
                )}
                {c.name}
              </span>
              <span className="text-right font-mono text-[11.5px] text-ink-2">{c.detail}</span>
            </li>
          ))}
        </ul>
      </Sheet>
      <Sheet label="SYSTEM / SECURITY" title="Security posture">
        <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-healthy" aria-hidden="true" />
          <div className="text-[13px] leading-relaxed text-ink-2">
            <p>
              Destination scanning is server-side only. The scanner validates protocol, credentials, hostname and
              resolved IP ranges before every request, including every redirect hop.
            </p>
            <p className="mt-2">
              {data.publicScannerEnabled ? (
                <span className="text-warning">Public real-URL scanning is enabled on the demo routes — keep rate limits and authentication in place.</span>
              ) : (
                "Public real-URL scanning is disabled. The public demo uses synthetic fixtures only."
              )}
            </p>
            <p className="mt-2 text-ink-3">
              This screen never displays secrets, database URLs or API keys. See SECURITY.md for the full model.
            </p>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

function DiagCell({ label, value, mono, tone }: { label: string; value: string; mono?: boolean; tone?: "warn" }) {
  return (
    <div className="bg-paper-raised px-4 py-3 sm:px-5">
      <MicroLabel>{label.toUpperCase()}</MicroLabel>
      <span className={cn("mt-1 block text-[13.5px] font-medium", mono && "font-mono text-[12.5px]", tone === "warn" && "text-warning")}>
        {value}
      </span>
    </div>
  );
}

export { DossierLine };
