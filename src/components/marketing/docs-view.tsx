"use client";

/**
 * Documentation preview view — summarises the documentation set that ships
 * with the source package. The full documents live in the repository root
 * and docs/ folder.
 */

import { useRouter } from "@/store/router";
import { Sheet, MicroLabel, MarginNote } from "@/components/paper/paper";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BookOpen } from "lucide-react";

const DOCS: { file: string; title: string; text: string }[] = [
  {
    file: "README.md",
    title: "Read me first",
    text: "Purpose, capabilities, requirements, quick start, demo mode, production mode, architecture summary and links to every deeper document.",
  },
  {
    file: "DEPLOYMENT.md",
    title: "Deployment",
    text: "From zero to deployed: dependencies, environment variables, PostgreSQL provisioning, migrations, seed, Vercel deployment, post-deployment health checks.",
  },
  {
    file: "BRANDING.md",
    title: "White-label branding",
    text: "Every branding option, the precedence rules (database over environment), and the quickest rebrand path — one settings page, no code edits.",
  },
  {
    file: "CONFIGURATION.md",
    title: "Configuration",
    text: "Every environment variable: required or optional, example values without secrets, scanner limits, mode switches.",
  },
  {
    file: "ARCHITECTURE.md",
    title: "Architecture",
    text: "Application structure, import pipeline, destination normalization, scan engine, URL safety model, findings and severity rules, scoring, reporting.",
  },
  {
    file: "SECURITY.md",
    title: "Security",
    text: "Scanner SSRF protection, redirect handling, secrets handling, authentication posture, data handling, public-scan warnings, production recommendations.",
  },
  {
    file: "DATA-HANDLING.md",
    title: "Data handling",
    text: "Exactly what campaign data is stored, what is requested from destination websites, what is logged, and what never leaves the deployment.",
  },
  {
    file: "CHANGELOG.md",
    title: "Changelog",
    text: "Release history, starting at 0.1.0 — Founding Release.",
  },
];

export function DocsView() {
  const navigate = useRouter((s) => s.navigate);
  return (
    <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-10 sm:px-6">
      <Button variant="ghost" size="sm" onClick={() => navigate({ view: "home" })} className="w-fit gap-2 px-0 text-ink-2">
        <ArrowLeft size={14} aria-hidden="true" /> Back
      </Button>
      <div className="mt-4 flex items-center gap-3">
        <BookOpen size={22} aria-hidden="true" />
        <h1 className="font-display text-3xl font-bold tracking-tight">Documentation</h1>
      </div>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-2">
        The source package ships with a complete documentation set. This page previews what each document covers;
        the full texts live in the repository.
      </p>

      <div className="mt-8 flex flex-col gap-3">
        {DOCS.map((doc) => (
          <Sheet key={doc.file} label={doc.file.toUpperCase()} title={doc.title}>
            <p className="px-4 py-3 text-[13.5px] leading-relaxed text-ink-2 sm:px-5">{doc.text}</p>
          </Sheet>
        ))}
      </div>

      <MarginNote className="mt-6">
        Also included: <span className="font-mono text-[12px]">LICENSE.md</span> (the commercial licence text),{" "}
        <span className="font-mono text-[12px]">.env.example</span> (every variable, no real secrets),{" "}
        <span className="font-mono text-[12px]">sample-data/</span> (synthetic CSV fixtures) and{" "}
        <span className="font-mono text-[12px]">scripts/doctor.mjs</span> (installation health check via{" "}
        <span className="font-mono text-[12px]">npm run doctor</span>).
      </MarginNote>
    </div>
  );
}
