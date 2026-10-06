"use client";

/**
 * Data-handling explanation. Deliberately precise: no broad compliance
 * claims — just what this deployment actually stores, requests and logs.
 */

import { useAppNavigate } from "@/lib/nav";
import { Sheet, MarginNote } from "@/components/paper/paper";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Database } from "lucide-react";

export function PrivacyView() {
  const navigate = useAppNavigate();
  return (
    <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-10 sm:px-6">
      <Button variant="ghost" size="sm" onClick={() => navigate({ view: "home" })} className="w-fit gap-2 px-0 text-ink-2">
        <ArrowLeft size={14} aria-hidden="true" /> Back
      </Button>
      <div className="mt-4 flex items-center gap-3">
        <Database size={22} aria-hidden="true" />
        <h1 className="font-display text-3xl font-bold tracking-tight">Data & privacy</h1>
      </div>

      <div className="mt-8 flex flex-col gap-4">
        <Sheet label="WHAT IS STORED" title="Campaign data in your deployment">
          <div className="space-y-3 px-4 py-4 text-[13.5px] leading-relaxed text-ink-2 sm:px-5">
            <p>
              When you import a campaign CSV, the file's filename, its rows (platform, campaign name, ad group, the
              original URL exactly as imported, spend as integer minor units, currency, and the raw row), and the
              normalized destinations derived from those URLs are stored in this deployment's database.
            </p>
            <p>
              Scan results (HTTP status, response times, redirect chains, tracking-signature evidence, findings and
              structured evidence) are stored per destination. Reports store a snapshot of your branding at
              generation time.
            </p>
          </div>
        </Sheet>

        <Sheet label="WHAT IS REQUESTED" title="Requests to destination websites">
          <div className="space-y-3 px-4 py-4 text-[13.5px] leading-relaxed text-ink-2 sm:px-5">
            <p>
              Scanning performs server-side HTTP GET requests to the imported destination URLs, with the user agent{" "}
              <span className="font-mono text-[12px]">LandingSentinel/0.1 (+landing-page-integrity-check)</span>. Redirects
              are followed manually. At most 2 MB of HTML is downloaded per destination.
            </p>
            <p>
              LandingSentinel does not impersonate a browser, does not execute page JavaScript, and does not render
              the page. Requests necessarily reveal your deployment's IP address to the destination website, as any
              server-side request would.
            </p>
            <p>
              In demo mode, no external requests are made at all — the public demo uses deterministic synthetic
              fixtures.
            </p>
          </div>
        </Sheet>

        <Sheet label="WHAT NEVER HAPPENS" title="Boundaries">
          <div className="space-y-3 px-4 py-4 text-[13.5px] leading-relaxed text-ink-2 sm:px-5">
            <p>
              Imported campaign data is not sent to analytics vendors, AI services or third-party enrichment tools.
              The V1 product operates without AI APIs and contains no telemetry, no licence "phone-home" and no
              hidden tracking from the original seller.
            </p>
            <p>
              Because the buyer deploys the software themselves, campaign data is processed by the infrastructure
              you configure (your hosting and your database). This deployment makes no claim that "data never leaves
              your infrastructure" — destination scanning and hosting are real network activity.
            </p>
          </div>
        </Sheet>

        <Sheet label="LOGS" title="Server logging">
          <div className="space-y-3 px-4 py-4 text-[13.5px] leading-relaxed text-ink-2 sm:px-5">
            <p>
              The server logs structured events (scan IDs, target IDs, stage, duration, success/failure, safe
              hostnames, error codes) to help you operate the deployment. Cookies, secrets and full imported rows
              are never logged.
            </p>
          </div>
        </Sheet>

        <MarginNote>
          Full details live in <span className="font-mono text-[12px]">DATA-HANDLING.md</span> and{" "}
          <span className="font-mono text-[12px]">SECURITY.md</span> in the source package. This page makes no
          broad compliance claims; it describes actual behaviour.
        </MarginNote>
      </div>
    </div>
  );
}
