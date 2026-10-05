# Changelog

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
