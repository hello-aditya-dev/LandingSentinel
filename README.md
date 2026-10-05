# LandingSentinel

Paid-media landing-page preflight. Version 0.1.0 — Founding Release.

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
- **Demo mode and public demo** — a fully synthetic dataset (fictional client,
  `.test` domains) so you can evaluate or present the platform without
  touching real URLs.

## Requirements

- Node.js 20 or newer (Node 24 recommended)
- npm for installs and commands, plus Bun 1.x (`npm run db:seed` and the
  shipped `npm run start` script execute through Bun)
- PostgreSQL for production deployments
- SQLite (bundled, no server needed) for development and demo deployments

## Quick start

```
npm install
cp .env.example .env.local
npm run db:push
npm run db:seed
npm run dev
```

Then open http://localhost:3000.

Notes on the setup steps:

- `npm run db:push` is the correct command for **first setup**. It creates the
  database schema directly from `prisma/schema.prisma` without creating
  migration files.
- `npm run db:migrate` is for **creating migrations** during ongoing
  development, after you change `prisma/schema.prisma`. It runs
  `prisma migrate dev`, which generates a migration and applies it. Do not use
  it for the initial setup of a fresh database unless you intend to keep a
  migration history from day one.
- `npm run db:seed` loads the synthetic demo dataset (a fictional client,
  three imports, four historical scans and a report). It is safe to run at any
  time; it only rebuilds the demo workspace.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server on port 3000 (logs to `dev.log`). |
| `npm run lint` | Run ESLint over the project. |
| `npm run db:push` | Create/update the database schema from `prisma/schema.prisma` (first setup, no migration files). |
| `npm run db:seed` | Rebuild the demo workspace with the synthetic dataset. |
| `npm run db:migrate` | Create and apply a migration after a schema change (`prisma migrate dev`). |
| `npm run doctor` | System check: Node version, env file, database connection, schema, scanner configuration. |
| `npm run qa` | Lint plus TypeScript type checking (`tsc --noEmit`). |
| `npm run build` | Production build (Next.js standalone output). |
| `npm run start` | Run the production build (standalone server). |

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

Money is stored as integer minor units (pence/cents) with a separate ISO
currency code — never floating point. See ARCHITECTURE.md for the full
breakdown of the layers, the scanner's SSRF protections, the severity model
and the scoring rules.

## Documentation

| Document | Contents |
| --- | --- |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Zero to deployed: install, environment, database, migrations, Vercel, health checks. |
| [CONFIGURATION.md](CONFIGURATION.md) | Every environment variable, defaults, and which values are build-time. |
| [BRANDING.md](BRANDING.md) | White-label options, where to set them, precedence rules. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Application layers, import pipeline, scan engine, finding model, scoring. |
| [SECURITY.md](SECURITY.md) | SSRF protection, redirect policy, limits, authentication posture, known limitations. |
| [DATA-HANDLING.md](DATA-HANDLING.md) | Exactly what is stored, requested and logged — and what never happens. |
| [CHANGELOG.md](CHANGELOG.md) | Release history. |
| [LICENSE.md](LICENSE.md) | The commercial licence text. |

Sample campaign CSV exports live in [sample-data/](sample-data/) — all
synthetic, all on the reserved `.test` top-level domain.

## Licence

LandingSentinel is commercial software sold as deployable source code under a
one-time founding agency licence (£349). You may use, modify, rebrand and
deploy it for your own client work; you may not redistribute or resell the
source code. The full terms are in [LICENSE.md](LICENSE.md).
