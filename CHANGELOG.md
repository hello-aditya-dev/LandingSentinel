# Changelog

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
