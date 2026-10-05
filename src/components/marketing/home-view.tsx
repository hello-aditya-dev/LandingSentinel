"use client";

/**
 * Marketing homepage — part of the product, not a template.
 * Every number shown is drawn from the synthetic demo dataset; every claim
 * maps to real functionality. Sections answer buying objections in order.
 */

import { useRouter } from "@/store/router";
import { PRODUCT } from "@/config/product";
import { MicroLabel, Sheet, DossierLine, MarginNote, RegMark } from "@/components/paper/paper";
import { StatusStamp, SeverityBadge } from "@/components/paper/stamp";
import { Money, EvidenceRow } from "@/components/paper/evidence";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  FileSearch,
  Radar,
  FileUp,
  FileText,
  Check,
  ShieldCheck,
  ServerCog,
  Printer,
  Boxes,
  TriangleAlert,
  OctagonX,
} from "lucide-react";
import { DEMO_DESTINATIONS } from "@/lib/scanner/demo-fixtures";
import { SentinelMark } from "@/components/paper/sentinel-mark";
import { cn } from "@/lib/utils";

const totalSpend = 84_260_00;
const criticalSpend = 11_840_00;

export function HomeView() {
  const navigate = useRouter((s) => s.navigate);

  const heroFindings = [
    {
      url: "shop.northstar-outfitters.test/summer-sale",
      spend: 4800_00,
      title: "Meta tracking was not detected",
      severity: "critical" as const,
    },
    {
      url: "shop.northstar-outfitters.test/products/shoes",
      spend: 3250_00,
      title: "Campaign parameter removed after redirect",
      severity: "critical" as const,
    },
    {
      url: "northstar-outfitters.test/old-offer",
      spend: 2190_00,
      title: "Destination returned HTTP 404",
      severity: "critical" as const,
    },
  ];

  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-hairline bg-paper/95 backdrop-blur-[2px]">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <SentinelMark size={22} />
            <span className="font-display text-[17px] font-bold leading-none tracking-tight">{PRODUCT.name}</span>
          </div>
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Site">
            <button type="button" onClick={() => navigate({ view: "docs" })} className="hidden px-3 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink sm:block">
              Docs
            </button>
            <button type="button" onClick={() => navigate({ view: "license" })} className="hidden px-3 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink sm:block">
              Licence
            </button>
            <Button size="sm" variant="outline" onClick={() => navigate({ view: "demo" })} className="gap-2">
              Try LandingSentinel
              <ArrowRight size={14} aria-hidden="true" />
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* ---------------- HERO ---------------- */}
        <section className="border-b border-hairline">
          <div className="paper-rules mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:gap-14 lg:py-20">
            <div className="flex flex-col items-start gap-5">
              <MicroLabel>WHITE-LABEL PAID-MEDIA PREFLIGHT</MicroLabel>
              <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
                Catch expensive landing-page failures before the client does.
              </h1>
              <p className="max-w-xl text-[15px] leading-relaxed text-ink-2">
                Import campaign spend. Scan every destination. Find tracking, redirect, availability and
                attribution issues — with evidence. Fix the expensive problems first.
              </p>
              <p className="text-[13px] text-ink-3">Own the source. Rebrand it. Deploy it yourself.</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Button size="lg" onClick={() => navigate({ view: "demo" })} className="gap-2 rounded-[2px] px-6 py-3 text-[15px]">
                  Try LandingSentinel <ArrowRight size={16} aria-hidden="true" />
                </Button>
                {PRODUCT.pageCheckEnabled ? (
                  <Button size="lg" variant="outline" onClick={() => navigate({ view: "scanOne" })} className="rounded-[2px] px-6 py-3 text-[15px]">
                    Scan one landing page
                  </Button>
                ) : null}
              </div>
              <p className="text-[12px] text-ink-3">
                No account required · Synthetic campaign data
                {PRODUCT.pageCheckEnabled ? " · Or check one real page above" : ""}
              </p>
              <button
                type="button"
                onClick={() => navigate({ view: "docs" })}
                className="micro-label mt-1 inline-flex items-center gap-1.5 text-ink-2 underline decoration-hairline-strong underline-offset-4 transition-colors hover:text-ink"
              >
                View source package <ArrowRight size={11} aria-hidden="true" />
              </button>
            </div>

            {/* Hero visual: the actual product control sheet */}
            <Sheet label="CAMPAIGN CONTROL SHEET" labelAside={<span className="micro-label !text-warning">SYNTHETIC DEMO DATA</span>} className="relative">
              <RegMark className="absolute -left-3 -top-3" />
              <RegMark className="absolute -right-3 -top-3" />
              <div className="grid grid-cols-2 gap-px border-b border-hairline bg-hairline sm:grid-cols-4">
                <HeroMetric label="Monthly campaign spend represented" minor={totalSpend} />
                <HeroMetric label="Associated with critical destinations" minor={criticalSpend} tone="critical" />
                <HeroMetric label="Critical destinations" value="4" tone="critical" />
                <HeroMetric label="Warnings" value="9" tone="warning" />
              </div>
              <div className="border-b border-hairline px-4 py-3">
                <MicroLabel>MONEY MAP / TOP OF 22 DESTINATIONS</MicroLabel>
                <ul className="mt-2">
                  {heroFindings.map((f, i) => (
                    <li key={f.url} className="ledger-row flex items-center gap-3 py-2">
                      <span className="num w-6 font-mono text-[11px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                      <span className="url-wrap min-w-0 flex-1 font-mono text-[12px] text-ink">{f.url}</span>
                      <Money minor={f.spend} currency="GBP" exact className="shrink-0 text-[12.5px] font-semibold" />
                      <span className="hidden max-w-[150px] shrink-0 truncate text-[11.5px] text-ink-2 sm:block" title={f.title}>
                        {f.title}
                      </span>
                      <SeverityBadge severity={f.severity} className="shrink-0" />
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex items-center justify-between gap-4 px-4 py-4">
                <div>
                  <MicroLabel>PREFLIGHT DECISION</MicroLabel>
                  <p className="mt-1.5 max-w-[240px] text-[12px] leading-snug text-ink-3">
                    One confirmed critical finding is enough. The stamp takes precedence over the score.
                  </p>
                </div>
                <StatusStamp status="DO_NOT_LAUNCH" size="lg" rotation={-4} />
              </div>
            </Sheet>
          </div>
        </section>
        {/* ---------------- NOT A SCREENSHOT DEMO ---------------- */}
        <section className="border-b border-hairline bg-paper-raised">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_1fr] lg:py-12">
            <div>
              <MicroLabel>PRODUCT PROOF</MicroLabel>
              <h2 className="font-display mt-2 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                Not a screenshot demo.
              </h2>
              <div className="mt-4 space-y-2 border-l-2 border-hairline-strong pl-4 text-[14px] leading-relaxed text-ink-2">
                <p>The public campaign demo uses synthetic data so anyone can explore it safely.</p>
                <p>The one-page checker uses the real scanning engine against the public URL you provide.</p>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button size="sm" onClick={() => navigate({ view: "demo" })} className="gap-2">
                  Try LandingSentinel <ArrowRight size={13} aria-hidden="true" />
                </Button>
                {PRODUCT.pageCheckEnabled ? (
                  <Button size="sm" variant="outline" onClick={() => navigate({ view: "scanOne" })} className="gap-2">
                    Scan one landing page
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="flex flex-col justify-center gap-3 border border-hairline bg-paper px-5 py-5">
              <MicroLabel>TRUST BAR</MicroLabel>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                {[
                  "Real scanner",
                  "175 automated tests",
                  "PostgreSQL",
                  "No paid scanning API required",
                  "White-label",
                  "Complete source",
                  "Self-hosted",
                ].map((fact) => (
                  <li key={fact} className="flex items-start gap-2 text-[13px] text-ink-2">
                    <ShieldCheck size={13} className="mt-0.5 shrink-0 text-healthy" aria-hidden="true" />
                    {fact}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ---------------- WHAT GETS CHECKED ---------------- */}
        <section className="border-b border-hairline">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
            <MicroLabel>WHAT GETS CHECKED</MicroLabel>
            <h2 className="font-display mt-2 max-w-2xl text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
              Six checks per destination, each producing machine-readable evidence.
            </h2>
            <div className="mt-8 grid gap-px border border-hairline bg-hairline md:grid-cols-3">
              {[
                {
                  icon: ServerCog,
                  title: "Network & HTTP",
                  items: ["DNS failures, connection failures, TLS errors", "Timeouts, 404s, 410s, 5xx status codes", "Scanner-access findings for 403 / 429"],
                },
                {
                  icon: Radar,
                  title: "Redirects & attribution",
                  items: ["Every hop recorded with status and duration", "UTM and click-ID survival across redirects", "Hostname changes and redirect loops"],
                },
                {
                  icon: FileSearch,
                  title: "Tracking signatures",
                  items: ["GA4, GTM, Google Ads, Meta, TikTok, LinkedIn", "Platform-aware: Meta spend needs Meta evidence", "“Not detected” language — no false certainty"],
                },
                {
                  icon: FileText,
                  title: "Content integrity",
                  items: ["Soft 404s, sold-out and maintenance wording", "Missing titles, noindex, thin content", "CTA and form presence (conservative)"],
                },
                {
                  icon: ShieldCheck,
                  title: "Safety & limits",
                  items: ["Server-side scanning with SSRF protection", "Loopback, private and metadata ranges blocked", "Bounded concurrency, timeouts and body caps"],
                },
                {
                  icon: Printer,
                  title: "Client-ready reporting",
                  items: ["Spend-weighted Money Map ranking", "Branded print/PDF dossier with evidence appendix", "Method notes and limitations stated up front"],
                },
              ].map((c) => (
                <div key={c.title} className="bg-paper-raised px-5 py-5">
                  <div className="flex items-center gap-2.5">
                    <c.icon size={17} className="text-ink" aria-hidden="true" />
                    <h3 className="font-display text-[15.5px] font-semibold">{c.title}</h3>
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    {c.items.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-2">
                        <Check size={13} className="mt-1 shrink-0 text-healthy" aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- WORKFLOW ---------------- */}
        <section className="border-b border-hairline bg-paper-raised">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
            <MicroLabel>PREFLIGHT WORKFLOW</MicroLabel>
            <h2 className="font-display mt-2 max-w-2xl text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
              From campaign export to launch decision in one pass.
            </h2>
            <ol className="mt-8 grid gap-4 md:grid-cols-4">
              {[
                { icon: FileUp, step: "01", title: "Import", text: "Drop a Google, Meta, TikTok or LinkedIn CSV export. Fields are detected; rows are validated; bad rows never destroy the import." },
                { icon: Radar, step: "02", title: "Scan", text: "Every destination is requested server-side. Redirects are followed manually. Six checks produce structured evidence." },
                { icon: FileSearch, step: "03", title: "Weigh", text: "Findings rank by severity and the campaign spend that reaches each destination. The Money Map shows what deserves attention first." },
                { icon: FileText, step: "04", title: "Report", text: "A branded dossier with the preflight stamp, evidence appendix and method notes — printable to PDF in one click." },
              ].map((s) => (
                <li key={s.step} className="border border-hairline bg-paper px-4 py-5">
                  <div className="flex items-center justify-between">
                    <s.icon size={18} aria-hidden="true" />
                    <MicroLabel>{s.step}</MicroLabel>
                  </div>
                  <h3 className="font-display mt-3 text-[16px] font-semibold">{s.title}</h3>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------------- EVIDENCE VIEW ---------------- */}
        <section className="border-b border-hairline">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_1.2fr] lg:py-16">
            <div>
              <MicroLabel>EVIDENCE FIRST</MicroLabel>
              <h2 className="font-display mt-2 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                Every finding shows its technical proof.
              </h2>
              <p className="mt-4 max-w-md text-[14px] leading-relaxed text-ink-2">
                Findings never hide behind vague interpretation. HTTP statuses, redirect hops, parameter diffs and
                matched signatures are stored as machine-readable evidence — and rendered as text, exactly as recorded.
              </p>
              <MarginNote className="mt-5 max-w-md">
                Claim discipline is built in: the product says <em>“Meta Pixel was not detected”</em> — never
                <em>“tracking is broken”</em> — because static HTML scanning cannot prove runtime behaviour.
              </MarginNote>
            </div>
            <Sheet label="FINDING / SAMPLE" labelAside={<span className="micro-label !text-warning">SYNTHETIC DEMO DATA</span>}>
              <div className="border-b border-hairline px-4 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <SeverityBadge severity="critical" confidence="confirmed" />
                  <h3 className="font-display text-[15.5px] font-semibold">Campaign parameter removed after redirect</h3>
                </div>
                <p className="url-wrap mt-2 font-mono text-[12px] text-ink-2">shop.northstar-outfitters.test/products/shoes</p>
                <div className="mt-3 flex items-center gap-6">
                  <div>
                    <MicroLabel>ASSOCIATED SPEND</MicroLabel>
                    <Money minor={3250_00} currency="GBP" className="mt-0.5 block text-lg font-semibold" exact />
                  </div>
                  <div>
                    <MicroLabel>CAMPAIGNS</MicroLabel>
                    <p className="mt-0.5 font-mono text-[12px]">Meta · Spring Prospecting · £1,750</p>
                    <p className="font-mono text-[12px]">Meta · Spring Retargeting · £1,500</p>
                  </div>
                </div>
              </div>
              <div className="border-b border-hairline">
                <EvidenceRow
                  item={{
                    type: "PARAMETER_REMOVED",
                    label: "Removed parameter: utm_campaign",
                    value: "utm_campaign=spring-sale",
                    meta: { redirects: 1, finalUrl: "https://shop.northstar-outfitters.test/collections/shoes" },
                  }}
                />
                <EvidenceRow
                  item={{
                    type: "REDIRECT_HOP",
                    label: "Redirect 1",
                    value: "https://shop.northstar-outfitters.test/products/shoes?utm_source=meta&utm_campaign=spring-sale → https://shop.northstar-outfitters.test/collections/shoes",
                    meta: { statusCode: 301 },
                  }}
                />
              </div>
              <div className="px-4 py-3">
                <p className="border-l-2 border-ink pl-3 text-[12.5px] leading-relaxed text-ink">
                  <span className="micro-label mr-2">NEXT ACTION</span>
                  Verify whether attribution is preserved through another mechanism. If it is not, update the redirect
                  or campaign destination before launch.
                </p>
              </div>
            </Sheet>
          </div>
        </section>

        {/* ---------------- SOURCE OWNERSHIP ---------------- */}
        <section className="border-b border-hairline bg-paper-raised">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
            <MicroLabel>COMMERCIAL TERMS</MicroLabel>
            <div className="mt-2 grid gap-10 lg:grid-cols-2">
              <div>
                <h2 className="font-display text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                  Deploy it under your agency.
                </h2>
                <ul className="mt-5 space-y-2.5">
                  {[
                    "Use your product name, your logo, your domain.",
                    "Keep campaign data inside your own deployment.",
                    "Complete source code — no recurring software licence fee to us for the commercial source licence.",
                    "Use it across your own client engagements, and charge clients for services that use it.",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-[13.5px] leading-relaxed text-ink-2">
                      <Check size={14} className="mt-1 shrink-0 text-healthy" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
                <MarginNote className="mt-5 max-w-md">
                  Third-party hosting and database costs are outside the software licence — the buyer runs the
                  deployment they choose. See the licence page for the full terms.
                </MarginNote>
              </div>

              {/* Offer */}
              <div className="relative flex flex-col gap-4">
                <Sheet label="VALUE / BUILD-VS-BUY" className="h-full">
                  <div className="px-5 py-5">
                    <h3 className="font-display text-lg font-bold">What £349 buys</h3>
                    <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-ink-2">
                      The same capability built internally — feature by feature — is engineering work you own forever.
                    </p>
                    <table className="mt-4 w-full border-collapse text-left">
                      <thead>
                        <tr className="border-b border-hairline-strong">
                          <th scope="col" className="micro-label px-2 py-2">CAPABILITY</th>
                          <th scope="col" className="micro-label px-2 py-2 text-right">LANDINGSENTINEL</th>
                          <th scope="col" className="micro-label px-2 py-2 text-right">BUILD INTERNALLY</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ["Campaign CSV import", "Included", "Build"],
                          ["Spend aggregation", "Included", "Build"],
                          ["SSRF-hardened scanner", "Included", "Build / test"],
                          ["Redirect evidence", "Included", "Build"],
                          ["Tracking checks", "Included", "Build"],
                          ["Spend-weighted priority", "Included", "Build"],
                          ["Client report", "Included", "Build"],
                          ["White-label settings", "Included", "Build"],
                          ["Source ownership", "Included", "Your own"],
                          ["Initial deployment", "Ready", "Engineering work"],
                        ].map(([cap, ours, theirs]) => (
                          <tr key={cap} className="border-b border-hairline last:border-b-0">
                            <td className="px-2 py-1.5 text-[12.5px] text-ink">{cap}</td>
                            <td className="px-2 py-1.5 text-right text-[12px] font-medium text-healthy">{ours}</td>
                            <td className="px-2 py-1.5 text-right text-[12px] text-ink-3">{theirs}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Sheet>

                <Sheet label="PRICE" className="h-full">
                  <div className="flex flex-wrap items-end justify-between gap-4 px-5 py-5">
                    <div>
                      <h3 className="font-display text-lg font-bold">Founding agency licence</h3>
                      <p className="mt-1 text-[13px] text-ink-2">£349 once — no recurring LandingSentinel licence fee.</p>
                    </div>
                    <p className="num font-mono text-4xl font-bold tabular-nums">{PRODUCT.price}</p>
                  </div>
                  <div className="border-t border-hairline px-5 py-4">
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {[
                        "Complete source code",
                        "Commercial agency use",
                        "White-label configuration",
                        "Use across your client work",
                        "Deploy it yourself",
                        "No paid API required for core scanning",
                      ].map((item) => (
                        <li key={item} className="flex items-start gap-2 text-[12.5px] text-ink-2">
                          <Check size={13} className="mt-0.5 shrink-0 text-healthy" aria-hidden="true" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="border-t border-hairline px-5 py-4">
                    {PRODUCT.checkoutUrl ? (
                      <a
                        href={PRODUCT.checkoutUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 border border-ink bg-ink px-5 py-2.5 text-[14px] font-medium text-paper transition-opacity hover:opacity-90"
                      >
                        Buy commercial licence <ArrowRight size={14} aria-hidden="true" />
                      </a>
                    ) : process.env.NODE_ENV === "development" ? (
                      <div>
                        <p className="text-[12.5px] text-ink-2">
                          Checkout is not configured on this deployment. Sellers connect their own payment link via{" "}
                          <span className="font-mono text-[11.5px]">NEXT_PUBLIC_CHECKOUT_URL</span> — the product ships
                          with no payment provider hard-wired.
                        </p>
                        <Button size="sm" variant="outline" className="mt-3" onClick={() => navigate({ view: "license" })}>
                          Read the licence terms
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => navigate({ view: "license" })}>
                        Read the licence terms
                      </Button>
                    )}
                  </div>
                </Sheet>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- PACKAGE / STACK ---------------- */}
        <section className="border-b border-hairline">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_1fr] lg:py-16">
            <div>
              <MicroLabel>PACKAGE</MicroLabel>
              <h2 className="font-display mt-2 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                What purchasers receive.
              </h2>
              <dl className="mt-6 divide-y divide-hairline border border-hairline">
                {[
                  ["Version", `${PRODUCT.version} · ${PRODUCT.releaseName}`],
                  ["Stack", "Next.js · TypeScript · Tailwind · shadcn/ui"],
                  ["Database", "PostgreSQL (SQLite for the bundled demo)"],
                  ["Deployment", "Vercel-compatible · Node runtime scanner"],
                  ["Source", "Included"],
                  ["White-label", "Included"],
                  ["CSV import", "Included"],
                  ["External paid API required", "None for core scanning"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                    <dt className="text-[13px] text-ink-2">{k}</dt>
                    <dd className="font-mono text-[12px] font-medium text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-5 border border-hairline bg-paper-raised px-4 py-4">
                <MicroLabel>SOURCE PACKAGE LAYOUT</MicroLabel>
                <pre className="mt-2 overflow-x-auto font-mono text-[11.5px] leading-relaxed text-ink-2">{`LandingSentinel/
├── src/            app, components, lib, scanner
├── prisma/         schema + migrations
├── sample-data/    synthetic CSV fixtures
├── scripts/        seed + doctor
├── docs/           deep documentation
├── README.md  DEPLOYMENT.md  BRANDING.md
├── CONFIGURATION.md  ARCHITECTURE.md
├── SECURITY.md  DATA-HANDLING.md
├── LICENSE.md  CHANGELOG.md
├── .env.example
└── package.json`}</pre>
              </div>
            </div>

            <div>
              <MicroLabel>DEPLOYMENT</MicroLabel>
              <h2 className="font-display mt-2 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                From zero to deployed.
              </h2>
              <ol className="mt-6 space-y-0 border border-hairline">
                {[
                  ["01", "Install dependencies", "npm install"],
                  ["02", "Configure environment", "cp .env.example .env.local"],
                  ["03", "Provision PostgreSQL + migrate", "npm run db:migrate"],
                  ["04", "Seed the synthetic demo (optional)", "npm run db:seed"],
                  ["05", "Start the development server", "npm run dev"],
                ].map(([n, title, cmd]) => (
                  <li key={n} className="flex items-center gap-4 border-b border-hairline bg-paper-raised px-4 py-3.5 last:border-b-0">
                    <span className="micro-label">{n}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium text-ink">{title}</p>
                      <p className="mt-0.5 font-mono text-[11.5px] text-ink-2">{cmd}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <MarginNote className="mt-5">
                Vercel-compatible, standard PostgreSQL (Neon, Supabase, or any hosted Postgres via{" "}
                <span className="font-mono text-[12px]">DATABASE_URL</span>). The scanner runs on the Node runtime
                with bounded concurrency — see DEPLOYMENT.md for function-duration considerations.
              </MarginNote>
              <div className="mt-5 flex items-center gap-2">
                <Boxes size={16} className="text-ink-3" aria-hidden="true" />
                <button type="button" onClick={() => navigate({ view: "docs" })} className="text-[13px] font-medium text-ink underline decoration-hairline-strong underline-offset-4 transition-colors hover:decoration-ink">
                  Read the full documentation set
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- FAQ ---------------- */}
        <section className="border-b border-hairline bg-paper-raised">
          <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
            <MicroLabel>QUESTIONS AGENCIES ASK</MicroLabel>
            <h2 className="font-display mt-2 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">FAQ</h2>
            <div className="mt-6 divide-y divide-hairline border border-hairline bg-paper">
              {[
                {
                  q: "Does “associated spend” mean lost revenue?",
                  a: "No. It is the campaign spend that reaches a destination with a finding. LandingSentinel never claims proven revenue loss — the report says so explicitly.",
                },
                {
                  q: "Can it prove a Meta Pixel fires at runtime?",
                  a: "No — static HTML scanning detects signatures, not execution. When Google Tag Manager is present, findings are phrased “not detected directly” and ask you to verify with a tag debugger. That honesty is the point.",
                },
                {
                  q: "Do I need paid API keys or an AI subscription?",
                  a: "No. Core scanning uses your own deployment's server-side requests. No OpenAI, no scraping proxies, no Lighthouse API.",
                },
                {
                  q: "How does the Money Map group URLs?",
                  a: "Campaign rows pointing at the same page — ignoring utm_* and click-ID parameters — aggregate into one destination with their combined spend. Original URLs stay visible as evidence.",
                },
                {
                  q: "Is scanning safe against SSRF?",
                  a: "Only http/https is requested; embedded credentials are rejected; hostnames are resolved and every address is classified — loopback, private, link-local, multicast and cloud-metadata ranges are never contacted.",
                },
                {
                  q: "How do I rebrand it?",
                  a: "Settings → White-label branding: product name, agency name, accent colour, report footer. Database values override NEXT_PUBLIC_* environment fallbacks. Reports snapshot branding at generation time.",
                },
              ].map((f) => (
                <details key={f.q} className="group border-b border-hairline last:border-b-0">
                  <summary className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3.5 text-[14px] font-medium text-ink marker:content-none">
                    {f.q}
                    <span aria-hidden="true" className="text-ink-3 transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="px-4 pb-4 text-[13px] leading-relaxed text-ink-2">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- FINAL CTA ---------------- */}
        <section className="paper-rules border-b border-hairline">
          <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-6 px-4 py-16 text-center sm:px-6 lg:py-20">
            <MicroLabel>PREFLIGHT BEFORE THE BUDGET FLIES</MicroLabel>
            <h2 className="font-display max-w-2xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              Run the demo. Read the evidence. Then decide.
            </h2>
            <p className="max-w-xl text-[14px] leading-relaxed text-ink-2">
              Two minutes in the synthetic demo shows the whole workflow: import, scan, findings, Money Map,
              evidence, and the branded client report.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" onClick={() => navigate({ view: "demo" })} className="gap-2 rounded-[2px] px-6 py-3 text-[15px]">
                Open live demo <ArrowRight size={16} aria-hidden="true" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate({ view: "license" })} className="rounded-[2px] px-6 py-3 text-[15px]">
                View agency licence
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-hairline bg-paper-raised">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <SentinelMark size={16} />
            <MicroLabel>{PRODUCT.name.toUpperCase()} · v{PRODUCT.version}</MicroLabel>
          </div>
          <nav className="flex flex-wrap items-center gap-4" aria-label="Footer">
            <button type="button" onClick={() => navigate({ view: "docs" })} className="micro-label transition-colors hover:text-ink">DOCS</button>
            <button type="button" onClick={() => navigate({ view: "license" })} className="micro-label transition-colors hover:text-ink">LICENCE</button>
            <button type="button" onClick={() => navigate({ view: "privacy" })} className="micro-label transition-colors hover:text-ink">DATA & PRIVACY</button>
            {PRODUCT.portfolioUrl ? (
              <a
                href={PRODUCT.portfolioUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="micro-label transition-colors hover:text-ink"
              >
                BUILT BY ADITYA · {new URL(PRODUCT.portfolioUrl).hostname.replace(/^www\./, "").toUpperCase()}
              </a>
            ) : null}
          </nav>
        </div>
      </footer>
    </div>
  );
}

function HeroMetric({ label, minor, value, tone }: { label: string; minor?: number; value?: string; tone?: "critical" | "warning" }) {
  return (
    <div className="bg-paper-raised px-3 py-3.5 sm:px-4">
      <MicroLabel>{label.toUpperCase()}</MicroLabel>
      <span
        className={cn(
          "num mt-1 block font-mono text-xl font-semibold tabular-nums sm:text-[22px]",
          tone === "critical" && "text-critical",
          tone === "warning" && "text-warning"
        )}
      >
        {value ?? <Money minor={minor ?? 0} currency="GBP" />}
      </span>
    </div>
  );
}

export { TriangleAlert, OctagonX, DossierLine };
