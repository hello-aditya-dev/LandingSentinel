# LandingSentinel

Paid-media landing-page preflight. Version 0.1.2 — see [CHANGELOG.md](CHANGELOG.md).

Try the product with **no account**: the synthetic campaign demo runs the
full workflow (import → preflight → evidence → report → after-fixes), and the
one-page checker runs the **real scanner** against any public URL you give
it — rate-limited, SSRF-hardened, nothing stored.

LandingSentinel checks the landing pages your paid campaigns point at *before* the
campaign goes live. You import a campaign CSV export (Google Ads, Meta, TikTok,
LinkedIn or a mix), the platform groups every destination URL, ranks them by
spend, and scans each one server-side: reachability, redirects, attribution
parameter survival, tracking tags, page content and response time. Every
problem comes back as a finding with structured evidence and the spend
associated with the affected destinations, so the Money Map answers the
question that matters first: how much money points at broken pages.

## What it does

- **CSV import with mapping** — uploads are parsed server-side, headers are
  matched against a field-alias table, and you confirm the mapping before
  anything is stored. Invalid rows are rejected individually; a bad row never
  destroys the import.
- **Destination aggregation** — marketing parameters (`utm_*`, click IDs) are
  stripped for grouping only, so three campaigns pointing at the same page
  become one destination with combined spend. The original URLs are preserved
  untouched.
- **Six checks per destination** — network/HTTP status, redirects, attribution
  survival, tracking signatures (GA4, GTM, Google Ads, Meta Pixel, TikTok
  Pixel, LinkedIn Insight), page content (title, noindex, soft-404, sold-out,
  maintenance, CTA, thin content) and response time.
- **Findings with evidence** — every finding states what was observed, what it
  means, what to do, and the exact evidence (status codes, redirect hops,
  parameter diffs, HTML excerpts). Findings carry stable keys, so the same
  problem keeps its identity across scans and builds an incident history.
- **Money Map and spend exposure** — destinations ranked by spend with
  critical / warning / healthy exposure totals. Spend is counted once per
  destination; a destination contributes to exactly one exposure bucket.
- **Preflight verdict and scoring** — DO_NOT_LAUNCH / REVIEW_BEFORE_LAUNCH /
  LAUNCH_READY, backed by a spend-weighted readiness score.
- **Print-ready client reports** — A4 print layout, white-labelled with your
  branding snapshotted at generation time.
- **White-label branding** — product name, agency name, logo, accent colour,
  support contact, all editable in Settings.
- **Single-admin access control** — the workspace holding your real campaign
  data is protected by an administrator password; the synthetic demo workspace
  stays public. See SECURITY.md for the full model.
- **Demo mode and public demo** — a fully synthetic dataset (fictional client,
  `.test` domains) so you can evaluate or present the platform without
  touching real URLs.

## Requirements

- Node.js 20 or newer (Node 24 recommended)
- npm for installs and commands (`package-lock.json` is committed, so
  `npm install` is the supported, reproducible path)
- A PostgreSQL database — hosted (Neon, Supabase, RDS) or self-hosted.
  PostgreSQL is the canonical database: the Prisma schema ships with the
  `postgresql` provider and committed migrations under `prisma/migrations`.
  SQLite is not supported in the commercial package.

## Quick start

The verified fresh-install flow (canonical buyer path):

```
# 1. Provision a PostgreSQL database and copy its connection string, e.g.
#    postgresql://user:password@host:5432/landingsentinel
cp .env.example .env.local
#    then edit .env.local and set DATABASE_URL to that string

# 2. Install dependencies (postinstall also runs prisma generate)
npm install

# 3. Apply the committed migrations
npm run db:migrate

# 4. Seed the synthetic demo workspace (optional, recommended)
npm run db:seed

# 5. Generate your administrator password hash and add it to .env.local
npm run hash-password
#    → ADMIN_PASSWORD_HASH=scrypt:16384:8:1:…:…  (colon-separated on purpose)

# 6. Start the development server
npm run dev
```

Then open http://localhost:3000. The synthetic demo workspace is public; the
real workspace (imports, scans, reports) asks for the administrator password —
that is `APP_ACCESS_MODE=auth`, the default.

Notes on the setup steps:

- **No provider editing.** `prisma/schema.prisma` already declares
  `provider = "postgresql"`; the migrations in `prisma/migrations/` are
  committed. You never touch the schema to get running.
- `npm run db:migrate` runs `prisma migrate deploy` through a small wrapper
  that loads `.env.local` then `.env` (real environment variables still win),
  so the database commands work with either file.
- `npm run db:seed` loads the synthetic demo dataset (a fictional client,
  three imports, four historical scans and a report). It is safe to run at any
  time; it only rebuilds the demo workspace.
- Running on plain `http://localhost:3000` is fine: browsers treat localhost
  as a secure context, so the session cookie works without TLS. In production
  the cookie is marked `Secure` automatically (see DEPLOYMENT.md).

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server on port 3000 (logs also written to `dev.log`). |
| `npm run build` | Production build (`next build`). Fails on TypeScript errors — there is no ignore-build-errors switch. |
| `npm run start` | Run the production build (`next start` on port 3000). Runs with `NODE_ENV=production`, so secure cookies engage. |
| `npm run lint` | Run ESLint over the project. |
| `npm run typecheck` | TypeScript type checking (`tsc --noEmit`). |
| `npm run test` | Run the vitest suite (175 tests across 9 files). |
| `npm run qa` | The full quality gate: lint + typecheck + test. |
| `npm run db:migrate` | Apply the committed migrations (`prisma migrate deploy`, via the wrapper that reads `.env.local`/`.env`). |
| `npm run db:migrate:dev` | Create a new migration after a schema change (`prisma migrate dev`). Development use. |
| `npm run db:seed` | Rebuild the demo workspace with the synthetic dataset (`tsx scripts/seed.ts`). |
| `npm run db:push` | Sync the schema directly from `prisma/schema.prisma` without migration files (development convenience — prefer migrations). |
| `npm run db:reset` | Drop the database and replay all migrations. Development only. |
| `npm run db:generate` | Regenerate the Prisma client (also runs automatically on `npm install`). |
| `npm run doctor` | System check: Node version, env file, database connection, schema, scanner configuration. |
| `npm run hash-password` | Generate an `ADMIN_PASSWORD_HASH` value (scrypt; interactive prompt or `npm run hash-password -- "passphrase"`). |
| `npm run fixtures` | Start the local fixture HTTP server on `127.0.0.1:4010` for verifying the real scanner locally. |

## Testing

`npm run qa` runs lint + type checking + the vitest suite — **175 tests across
9 files**:

| Suite | Covers |
| --- | --- |
| `money.test.ts` | Money parsing into integer minor units: separator rules (`1,234.56`, `£1,700`, `1.234,56`, `1 234.56`), symbol stripping, rejection of >2 decimals and malformed groupings, mixed-currency refusal, formatting. |
| `url-normalization.test.ts` | Destination grouping keys: marketing-parameter stripping, kept-parameter sorting, ports, trailing slashes, attribution diffs. |
| `url-safety.test.ts` | SSRF classification: protocol allowlist, embedded credentials, hostname blocklist, the full IPv4/IPv6 CIDR tables, IPv4-mapped/NAT64 unwrapping, and the exact semantics of the loopback test flag. |
| `redirect-security.test.ts` | The manual redirect engine: relative `Location` resolution, loop detection, per-hop revalidation, and the limit boundary (a chain of exactly `maxRedirects` redirects ending in 200 is a success, not an error). |
| `tracking.test.ts` | Tracker signature detection (GA4, GTM, Google Ads, Meta Pixel, TikTok Pixel, LinkedIn Insight). |
| `content-findings.test.ts` | Content heuristics (noindex, soft-404, sold-out, maintenance, CTA, thin content) and finding generation with deterministic severities. |
| `severity-readiness.test.ts` | The severity model, destination scoring, spend-weighted readiness and preflight stamp precedence. |
| `spend-exposure.test.ts` | Exposure buckets: critical > warning > healthy precedence, no double counting. |
| `scanner-integration.test.ts` | The complete pipeline against the **real** engine: CSV → import → destinations → scan (real HTTP requests) → findings → exposure → preflight stamp → incident history across re-scans. |

The scanner integration suite requires a PostgreSQL `DATABASE_URL` (your
normal one, from `.env.local`/`.env`). It provisions a dedicated
`<database>_test` database on the same server automatically — your data
database is never touched — runs the migrations against it, and executes the
real scan engine against a local fixture HTTP server. The suite enables the
test-only `SCANNER_ALLOW_LOOPBACK_TARGETS` flag to reach that server; every
other SSRF rule stays enforced, which the suite proves by attempting a
redirect to the cloud metadata endpoint (blocked, never fetched).

To watch the same thing by hand, see DEPLOYMENT.md → "Verifying the real
scanner locally" (`npm run fixtures` + `sample-data/fixture-targets.csv`).

## Access control (overview)

- `APP_ACCESS_MODE=auth` (the **default**) requires administrator sign-in for
  every route operating on the primary — real — workspace: imports, scans,
  findings, reports, branding. The synthetic demo workspace (no real data)
  stays public, as does the marketing site.
- The password is configured via `ADMIN_PASSWORD_HASH`, generated with
  `npm run hash-password` (scrypt; minimum 10 characters; colon-separated
  format because `$` separators get mangled by dotenv-expand).
- Sessions are opaque random tokens in an HttpOnly, SameSite=Lax cookie
  (`Secure` in production); only the SHA-256 hash of the token is stored in
  the database (`AdminSession` table). Default expiry 7 days
  (`ADMIN_SESSION_TTL_HOURS`).
- Login is rate-limited: 5 failed attempts per IP per 15 minutes (in-memory,
  per instance — see the serverless caveat in SECURITY.md).
- `APP_ACCESS_MODE=open` disables auth entirely — a documented escape hatch
  for private, trusted networks, warned about in the docs and in Settings.

The full model, including cookie flags and the serverless limitation, is in
[SECURITY.md](SECURITY.md).

## Pre-deployment gate

```
npm run qa      # lint + typecheck + 175 tests
npm run build   # production build — fails on TypeScript errors
```

Both must pass before you deploy. `next.config.ts` contains no
`ignoreBuildErrors` switch, so the build is a real type gate, and `npm run qa`
is the same contract plus lint and tests.

## Demo mode vs production mode

LandingSentinel has two operating modes, controlled by `DEMO_MODE`
(default `false`):

- **Demo mode** (`DEMO_MODE=true`) — the app workspace *is* the seeded
  synthetic workspace. Imports and scans in the main app use the fixture
  scanner: no real URLs are ever requested. This is the mode the sandbox
  evaluation environment runs in.
- **Production mode** (`DEMO_MODE=false`, the shipped default) — the app
  operates on your real workspace. Imported campaign rows are stored, and
  scans make real server-side GET requests to the imported destination URLs.

Separately, the public demo routes (the marketing site's "Open live demo") are
gated by `PUBLIC_SCANNER_ENABLED` (default `false`). When disabled, demo-scope
requests always use synthetic fixtures. When enabled, the public demo can run
real scans — read SECURITY.md before turning this on.

Demo data is always synthetic: fictional campaign names, spend figures and
`.test` domains that cannot resolve on the public internet.

## Architecture summary

The pipeline from import to report:

```
CSV import → header detection → field mapping → row validation
          → destination normalization → spend aggregation
          → scan (SSRF-safe fetch, redirects, tracking, content)
          → findings with evidence → Money Map
          → preflight verdict + readiness score → client report
```

A scan runs **inside the API request that started it** (serverless-safe, no
detached background work), bounded by a whole-scan deadline
(`SCAN_MAX_DURATION_MS`, default 55 s) that fits the 60 s function limit the
scan route declares. Money is stored as integer minor units (pence/cents)
with a separate ISO currency code — never floating point. See
[ARCHITECTURE.md](ARCHITECTURE.md) for the full breakdown of the layers, the
scan execution model, the scanner's SSRF protections, the severity model and
the scoring rules.

## Documentation

| Document | Contents |
| --- | --- |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Zero to deployed: install, environment, PostgreSQL, migrations, Vercel, health checks, verifying the real scanner locally. |
| [CONFIGURATION.md](CONFIGURATION.md) | Every environment variable, defaults, and which values are build-time. |
| [BRANDING.md](BRANDING.md) | White-label options, where to set them, precedence rules. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Application layers, import pipeline, scan execution model, finding model, scoring, testing. |
| [SECURITY.md](SECURITY.md) | SSRF protection, redirect policy, limits, single-admin access control, known limitations. |
| [DATA-HANDLING.md](DATA-HANDLING.md) | Exactly what is stored, requested and logged — and what never happens. |
| [CHANGELOG.md](CHANGELOG.md) | Release history. |
| [LICENSE.md](LICENSE.md) | The commercial licence text. |

Sample campaign CSV exports live in [sample-data/](sample-data/) — three
synthetic platform exports on the reserved `.test` top-level domain, plus
`fixture-targets.csv` for verifying the real scanner against the local
fixture server (see DEPLOYMENT.md).

## Licence

LandingSentinel is commercial software sold as deployable source code under a
one-time founding agency licence (£349). You may use, modify, rebrand and
deploy it for your own client work; you may not redistribute or resell the
source code. The full terms are in [LICENSE.md](LICENSE.md).
