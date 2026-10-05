# Changelog

## 0.1.2 — Production Polish

Final production-identity and experience pass over the hardened release. No
architecture changes, no scanner-rule changes, no new integrations — the
working core is untouched and the test suite is unchanged at 175 tests.

### Product identity (new)

- **LandingSentinel mark:** an original inspection-sheet symbol — campaign
  paper with one folded corner, an inspection-registration cross and a
  critical-red sentinel marker. Ships as `src/app/icon.svg` (crisp vector
  favicon), `src/app/apple-icon.tsx` (180×180 Apple touch icon),
  `src/app/icon.tsx` (512×512 high-resolution icon) and a shared React
  component (`SentinelMark`) used by the marketing header, app shell,
  sign-in screen and footer. Verified legible at 16px favicon size.
- **Open Graph social card:** a 1200×630 product preview generated at the
  `src/app/opengraph-image.tsx` metadata route using the product's own
  typefaces (Source Serif 4 / Inter / IBM Plex Mono committed as TTFs under
  `src/og/fonts/`). The card shows the real product composition —
  £84,260 / £11,840 figures, a DO NOT LAUNCH stamp, three Money Map rows —
  labelled `SYNTHETIC DEMO DATA`. Verified: 200, `image/png`, no clipping.

### Metadata (new)

- Full document metadata: title `LandingSentinel — Paid-Media Landing Page
  Preflight`, product description, application name, Open Graph
  (`type: website`, title, description, image with width/height/alt) and
  Twitter `summary_large_image` card derived from the same image — one
  source, no contradictory duplicates.
- Canonical URL strategy via `NEXT_PUBLIC_SITE_URL` (Vercel `VERCEL_URL`
  supported; `http://localhost:3000` fallback in development; absolute-URL
  metadata is omitted in production when unconfigured rather than pointing
  at a domain that does not exist). Documented in CONFIGURATION.md.
- `themeColor` paper tone, `robots.txt` (`src/app/robots.ts`) and
  `sitemap.xml` (`src/app/sitemap.ts`). The sitemap lists only the homepage
  — hash-routed views are not fabricated as server URLs.

### Experience polish

- **404:** a paper-styled `not-found` view (`404 / DESTINATION NOT FOUND`)
  with Return home / Open live demo actions — no default Next.js error page.
- **Error boundaries:** `error.tsx` (APPLICATION / INTERRUPTED — retry-safe,
  saved state preserved, digest reference) and `global-error.tsx` last
  resort, both in the paper visual system.
- **Session expiry:** AUTH_REQUIRED API responses now drive a clean
  transition to the sign-in screen over the current route (preserved
  destination), with all cached protected queries dropped — no stale
  protected data, no broken API errors. Sign-out removes protected queries
  from the client cache instead of merely invalidating them.
- **Sign-in screen:** restructured to the product identity — `CONTROL
  ACCESS`, mark + product name, focused copy, exact `The password is
  incorrect.` error, loading state that blocks duplicate submissions.
- **Partial scans:** an explicit SCAN / PARTIAL panel — completed/failed
  counts, per-destination failure reasons, cause-specific guidance and a
  Start-another-scan action. Completed findings are never hidden.
- **Zero-issue scans:** a clean scan now states `0 CRITICAL · 0 WARNINGS —
  All inspected destinations passed the current preflight rules.`
- **Money Map empty filters:** specialised copy (`No critical destinations.
  This scan did not produce a confirmed critical finding.`).
- **Reports:** `View report` now opens the existing report instead of
  silently generating a duplicate; `Generate report` shows a real
  `Generating report…` state. White-label `logoUrl` (collected in Settings
  since 0.1.0 but previously unused) now renders on the report masthead.
- **Branding settings:** client-side validation with inline errors (empty
  product/agency names, non-URL logo links, non-hex accents, over-length
  values) and a live logo preview chip; invalid values can no longer be
  silently dropped by the save path.
- **Checkout CTA:** with `NEXT_PUBLIC_CHECKOUT_URL` unset, production shows
  the licence CTA only (no dead buy button); development shows the
  configuration note.
- Async controls audited: Run scan → `Starting scan…`, Import →
  `Importing…`, Branding → `Saving…`, Demo branding → `Saving…`, all with
  duplicate-submission guards.

### Zero-friction public experience (0.1.2 amendment)

- **Try LandingSentinel:** the primary homepage CTA opens the synthetic
  campaign demo immediately — no account, no setup, no onboarding. The
  demo leads with the portfolio (32 rows · 22 destinations · £84,260) and
  one dominant RUN PREFLIGHT action; the staged fixture scan completes in
  ~10–13 seconds with real per-destination progress, then the reveal —
  DO NOT LAUNCH, the headline numbers, and FIX THESE FIRST (the Money Map
  in plain language for first-time visitors).
- **Per-session demo isolation:** every anonymous visitor gets their own
  demo workspace (`demo:s:{id}`, assigned by middleware via an HttpOnly
  `ls_demo_sid` cookie). One visitor's scans, resets and rebrands can
  never affect another. Session workspaces are created + seeded inside a
  single transaction (racing first-visit requests can never observe a
  half-seeded demo) and are cleaned up after 24 hours.
- **View after fixes on demand:** the repaired state (LAUNCH READY, 0
  critical / 0 warnings / 22 healthy) is generated in the visitor's own
  session on first request — instantly, without replaying staged delays —
  and deduplicated so it is only ever created once per session.
- **One-click evidence:** Money Map rows offer "View evidence" in the
  demo; the forensic finding view carries the full redirect chain,
  tracker table and spend context. A subtle guided path (no tour, no
  tooltips) signposts the natural next beat: evidence → "Next: See the
  campaign report" → "Next: See the repaired state".
- **White-label playground, browser-local:** the demo branding playground
  (agency name, product title, accent, report footer) now edits a
  browser-local store — "These demo changes stay in your browser and are
  not saved" — applied live to the demo report via a client-side merge;
  the server-side branding of every session workspace stays untouched.
- **See campaign import:** the demo signposts the real import wizard with
  the synthetic sample CSV one click away (load → mapping → review →
  aggregation), fixed to run fully in the public demo scope.
- **One-page public checker (`/#/scan`):** a second homepage CTA runs the
  REAL scanning engine against one public URL the visitor provides, with
  optional platform / expected-tracker / associated-spend context. The
  route is deliberately constrained: exactly one http(s) URL, every
  existing SSRF control (DNS resolution, private/loopback/metadata
  rejection, per-hop redirect revalidation), scanner timeout/redirect/
  body limits, no caller headers or cookies, 3 evaluations per IP per
  hour plus a global abuse ceiling, and fully ephemeral processing —
  nothing is stored, no workspace is involved, the URL is never logged.
  The compact result shows destination status, HTTP response, redirects,
  campaign-parameter survival, tracker status (with GTM honesty note),
  content checks and findings, then bridges to the full demo and the
  £349 licence. Disable per deployment with
  `NEXT_PUBLIC_PAGE_CHECK_ENABLED=false`.
- **Homepage restructure:** Try LandingSentinel (primary) · Scan one
  landing page (secondary) · View source package (tertiary); a "Not a
  screenshot demo" proof section with trust bar directly after the hero;
  "What £349 buys" build-vs-buy comparison and the founding-agency price
  (£349 once — no recurring LandingSentinel licence fee) after value has
  been demonstrated. No superlative claims added.
- **Demo bar:** every demo-scoped application view carries a persistent
  "DEMO CONTROLS" link back to the demo sheet, alongside the standing
  SYNTHETIC DEMO DATA label.

### Validation

- Full production journey re-run after every change (see worklog): homepage,
  demo scan, findings, report, after-fixes, reset, sign-in, real CSV import,
  real scanner, Money Map, evidence, branding, refresh persistence,
  sign-out/sign-in.
- Responsive passes at 390/430/768/1280/1440/1728 with programmatic
  horizontal-overflow checks on every view; keyboard focus-visible ring
  verified; `prefers-reduced-motion` honoured by the global motion guard.

## 0.1.1 — Commercial hardening release

Hardening of the founding release for commercial distribution: PostgreSQL as
the canonical database, single-admin access control, serverless-safe scan
execution, and a real test suite. Verified as a fresh-install buyer flow
end-to-end.

### Database

- **PostgreSQL is canonical.** The Prisma schema ships with the
  `postgresql` provider and committed migrations under `prisma/migrations/`
  — the buyer flow is `DATABASE_URL=postgresql://…` → `npm install` →
  `npm run db:migrate` → `npm run db:seed` → `npm run dev`, with no provider
  editing. SQLite is no longer supported in the commercial package.
- `db:migrate` now runs `prisma migrate deploy` through a wrapper that loads
  `.env.local` then `.env` (real environment variables still win);
  `db:migrate:dev` creates new migrations. `db:seed` runs through `tsx` with
  the same env loading; `postinstall` runs `prisma generate`.
- **PostgreSQL FK cascade fix:** `ScanTarget.destinationId` is now
  `ON DELETE CASCADE` — workspace deletion and the demo reset previously
  failed on PostgreSQL.

### Access control (new)

- Single-admin authentication (`src/lib/auth.ts`): `APP_ACCESS_MODE=auth`
  (default) requires administrator sign-in for every route operating on the
  primary (real) workspace; the synthetic demo workspace stays public.
  `APP_ACCESS_MODE=open` is the documented escape hatch (warned about in the
  docs and Settings).
- Password configured via `ADMIN_PASSWORD_HASH`, generated with the new
  `npm run hash-password` script (minimum 10 characters; scrypt N=16384,
  r=8, p=1, 64-byte key). Colon-separated format
  (`scrypt:N:r:p:salt:hash`) because `$` separators get mangled by
  dotenv-expand.
- Server-side sessions: opaque random token in an HttpOnly, SameSite=Lax
  cookie (`Secure` in production); only the SHA-256 hash is stored
  (`AdminSession` table); default expiry 7 days (`ADMIN_SESSION_TTL_HOURS`).
- Login rate limiting: 5 failed attempts per IP per 15 minutes (in-memory,
  per instance — documented serverless limitation).

### Scan execution

- **Scans run inside the API request** (`POST /api/scans`): serverless-safe,
  no detached background promises. The route declares `maxDuration = 60`;
  the new `SCAN_MAX_DURATION_MS` (default 55 000 ms) bounds the run.
  Targets not reached in time are marked failed with `SCAN_WINDOW_EXCEEDED`
  and the scan completes as `partial`. Progress remains observable during
  the request by polling `GET /api/scans/[id]`.

### Security and correctness fixes

- **SSRF IP-classification fix:** `ipaddr.js` `match()` was previously
  called with string CIDR bases, which always threw and was caught — the
  entire IP-range blocklist was silently a no-op. Networks are now parsed
  at module load, and a malformed rule fails loudly at startup.
- **Redirect boundary fix:** a chain of exactly `maxRedirects` redirects
  ending in a 200 response was falsely reported as `TOO_MANY_REDIRECTS`;
  it is now a success.
- **IPv6 literal hosts** in URLs (bracketed forms) now reach the IP-range
  classifier instead of the single-label hostname rule.
- **Money parser fix:** `"1,700"` (single comma, 3-digit group) was
  rejected; it is now valid.
- **Per-row spend cap:** rows above 2,147,483,647 minor units (the int4
  boundary) are rejected gracefully as `SPEND_TOO_LARGE` instead of failing
  the import or the database write.

### Testing and tooling

- **Test suite: 175 tests across 9 files** (money, url-normalization,
  url-safety, redirect-security, tracking, content-findings,
  severity-readiness, spend-exposure, scanner-integration), run by vitest
  with deterministic single-worker isolation. The scanner integration test
  runs the real engine against a local fixture HTTP server using the
  test-only `SCANNER_ALLOW_LOOPBACK_TARGETS` flag, against an
  automatically-provisioned `*_test` PostgreSQL database (the data database
  is never touched).
- **`npm run qa`** gate (lint + typecheck + tests) and `npm run build`
  (fails on TypeScript errors — no ignore-build-errors switch) as the
  pre-deployment contract.
- New scripts: `npm run hash-password` (admin password hashing) and
  `npm run fixtures` (local fixture server on `127.0.0.1:4010` for
  verifying the real scanner), plus `npm run doctor` health checks.
- `.env.example` ships in the repository (gitignore fixed with
  `!.env.example`) and documents every variable with buyer defaults.
- `package-lock.json` committed for reproducible npm installs.
- react-hooks v7 lint fixes across the codebase.

## 0.1.0 — Founding Release

The first commercial release: the complete paid-media landing-page preflight
workflow, end to end.

### Import pipeline

- CSV import with papaparse, header detection against a field-alias table,
  and a confirmed field mapping step (fuzzy guesses offered, never silently
  applied).
- Row validation with safe partial processing — invalid rows are rejected
  individually with reasons; the rest of the import proceeds.
- Money parsed to integer minor units with deterministic separator rules;
  mixed-currency imports are refused rather than silently summed.
- Import limit of 5,000 rows per file.

### Normalization and aggregation

- Marketing parameters (`utm_*`, click IDs) stripped for grouping only —
  original URLs preserved verbatim.
- Spend aggregated per unique destination; the Money Map ranks destinations
  by severity and spend.

### Scanner

- SSRF-safe destination scanner: protocol allowlist, embedded-credential
  rejection, hostname blocklist, DNS resolution with full IPv4/IPv6 CIDR
  classification (including IPv4-mapped and NAT64 unwrapping), re-validated
  at every redirect hop.
- Manual redirect following with loop detection and a 5-hop limit; per-hop
  evidence recorded.
- Resource limits: 10 s per-request timeout, 2 MB body cap, bounded
  concurrency, 25 destinations per scan.
- Six checks per destination: network/HTTP status, redirects, attribution
  survival, tracking signatures (GA4, GTM, Google Ads, Meta Pixel, TikTok
  Pixel, LinkedIn Insight Tag), page content (title, noindex, soft-404,
  sold-out, maintenance, CTA, thin content, meta description), response
  time.

### Findings, Money Map, preflight

- Evidence-backed findings with stable keys (`normalizedKey::findingKey`) and
  incident history (first seen / last seen / resolved).
- Deterministic severity model (critical / warning / info) with claim
  discipline — "not detected", never "missing"; spend framed as associated
  spend, never proven loss.
- Spend exposure at unique-destination level: critical > warning > healthy,
  no double counting.
- Destination scoring (100 − 40 per critical, − 12 per warning) and
  spend-weighted scan readiness score; preflight stamp
  (DO_NOT_LAUNCH / REVIEW_BEFORE_LAUNCH / LAUNCH_READY) takes precedence over
  the score.

### White-label and reports

- White-label branding (product name, agency name, logo, accent colour,
  support email, website, report footer, report contact name) editable in
  Settings, with database → environment → default precedence.
- Print-ready A4 client reports with branding snapshotted at generation
  time.

### Demo and operations

- Demo mode (`DEMO_MODE`) and the public demo playground with a synthetic
  dataset (fictional client, `.test` domains), historical scans, an
  "after fixes" variant and a branding playground.
- `npm run doctor` system check (Node version, environment file, database
  connection, schema, scanner configuration).
- Documentation package: README, DEPLOYMENT, CONFIGURATION, BRANDING,
  ARCHITECTURE, SECURITY, DATA-HANDLING, CHANGELOG, LICENSE.
- Sample data: three synthetic CSV exports (Google Ads, Meta Ads, mixed
  TikTok/LinkedIn layouts) in `sample-data/`.
- Seed script rebuilding the demo workspace with a historical scan timeline.
