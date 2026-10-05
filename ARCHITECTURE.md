# Architecture

How LandingSentinel is put together, from CSV text to a printed client report.

## Application layers

| Layer | Location | Responsibility |
| --- | --- | --- |
| Presentation | `src/components/*` (`app/`, `paper/`, `marketing/`, `ui/`) | The app UI (dashboard, import wizard, scan detail, Money Map, finding detail, reports, settings, administrator sign-in), the marketing site, the demo playground, and the paper-dossier design system. A hash router in `src/store/router` drives views; TanStack Query manages server state. |
| Access control | `src/lib/auth.ts`, `src/app/api/auth/*` | Single-admin authentication: scrypt password verification against `ADMIN_PASSWORD_HASH`, server-side sessions (opaque token cookie; only its SHA-256 hash stored in `AdminSession`), the route guard `requireAdminFor`, and in-memory login rate limiting. See SECURITY.md. |
| Domain libs | `src/lib/money`, `src/lib/csv`, `src/lib/urls`, `src/lib/api`, `src/lib/branding` | Pure logic: money parsing and arithmetic, CSV parsing and row validation, URL normalization and attribution diffing, the API envelope, branding resolution. No database access. |
| Scanner subsystem | `src/lib/scanner/*` | The destination scanner: URL safety, page fetching, tracking detection, content inspection, the check engine that produces findings, and the runner that orchestrates scans. Pure and injectable — the check engine accepts a page-fetcher so it can run on fixtures in tests and demo mode. |
| Services | `src/lib/services/*` | Workspace/scope resolution, branding precedence, the import persistence pipeline, read queries and report generation, the demo seed. |
| Persistence | `prisma/schema.prisma`, `src/lib/db` | Prisma models: Workspace, Client, Branding, ImportBatch, CampaignRow, Destination, DestinationCampaign, Scan, ScanTarget, RedirectHop, Finding, Report, ScanExpectation, AdminSession. **PostgreSQL is the canonical database** — the schema declares the `postgresql` provider and the migrations are committed under `prisma/migrations/` (applied with `npm run db:migrate`, i.e. `prisma migrate deploy`). SQLite is not supported in the commercial package. |

Configuration constants (env parsing, scanner defaults, product identity)
live in `src/config/product.ts`.

## Access-control layer

`APP_ACCESS_MODE` (default `auth`) decides whether the guard is active. The
guard `requireAdminFor(ctx, req)` runs at the top of every workspace-scoped
API route (dashboard, import, import/preview, scans, scans/[id],
findings/[id], reports, reports/[id], branding):

- The **demo workspace** (synthetic data) is always public.
- `APP_ACCESS_MODE=open` makes every route public (escape hatch — warned
  about in SECURITY.md and Settings).
- Otherwise the request must carry a valid session cookie (`ls_admin_session`);
  failures return `401 AUTH_REQUIRED`.

Sessions: `POST /api/auth/login` verifies the scrypt hash from
`ADMIN_PASSWORD_HASH` (rate-limited: 5 failures/IP/15 min, in-memory per
instance) and creates an `AdminSession` row holding only the SHA-256 hash of
a random 48-byte token, plus expiry (`ADMIN_SESSION_TTL_HOURS`, default 7
days) and `lastSeenAt`. The cookie is HttpOnly, SameSite=Lax, `Secure` in
production. `POST /api/auth/logout` destroys the row;
`GET /api/auth/session?scope=…` reports whether the current scope requires
auth and whether the caller is authenticated — the app shell uses it to show
the sign-in view. Full detail in SECURITY.md.

## The import pipeline

```
CSV text
  → papaparse (header mode, empty lines skipped)
  → header detection via the field-alias table
  → mapping (confirmed by the user; fuzzy guesses are offered, never silently applied)
  → row validation — safe partial processing
  → CampaignRow / Destination / DestinationCampaign persistence
```

1. **Parsing.** `parseCsvText` runs papaparse in header mode. Structural
   errors (undetectable delimiter, no header row, no data rows) reject the
   file. Tolerable per-row field-count mismatches do not — they surface in
   row validation instead.
2. **Header detection.** Each column header is cleaned (trimmed,
   lower-cased, underscores to spaces) and matched against a per-field alias
   table — for example `Final URL` / `final_url` / `landing page url` for the
   URL field, `Cost` / `Amount spent` / `Spend` for spend. Exact alias
   matches are proposed with high confidence; substring matches are proposed
   as fuzzy and need confirmation. Uncertain guesses are not made silently.
3. **Row validation.** Each row is checked independently: URL present and
   http/https, spend parses as money, currency is a 3-letter code, spend
   within the per-row cap (2,147,483,647 minor units — the int4 boundary —
   else `SPEND_TOO_LARGE`), no exact duplicate of an earlier row (same URL +
   campaign + platform). A bad row is rejected with a reason and code; the
   rest of the import proceeds. The server always re-validates —
   client-side preview is a convenience only.
4. **Persistence.** Valid rows become `CampaignRow` records (original URL and
   the full raw row are stored verbatim). Each URL is normalized into a
   `Destination` grouping key; spend links rows to destinations through
   `DestinationCampaign`.

**Money** is stored as integer minor units (pence/cents) with a separate
ISO 4217 alpha-3 code — never floating point. The parser accepts common
export formats (`1,234.56`, `£1,234.56`, `1.234,56`, `1 234.56`, `1,700`)
with deterministic separator rules, rejects more than two decimal places, and
`sumMinor` refuses to combine different currencies rather than summing them
silently.

## Destination normalization

Grouping URLs must aggregate the same landing page without hiding meaningful
differences. Two concepts are kept strictly separate:

- `originalUrl` — exactly what the campaign CSV contained. Never modified;
  always the evidence source.
- `normalizedKey` — the grouping key for the Money Map.

The normalization rules:

- Lowercased hostname; default ports (`:80`/`:443`) stripped, others kept.
- A single redundant trailing slash on the path is collapsed (root `/` kept).
- **Marketing attribution parameters are removed** for grouping only:
  `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`,
  `gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, `ttclid`, `li_fat_id`,
  `twclid`, `igshid`, `mc_cid`, `mc_eid`, `yclid`. Three campaigns pointing
  at the same page with different UTMs aggregate to one destination.
- **All other query parameters are kept**, because they can materially change
  the page. They are sorted deterministically so key ordering does not split
  identical destinations.
- The result is `hostname[+port] + path + sorted-kept-query`.

## The scan engine

One scan covers up to `SCAN_MAX_TARGETS` destinations, selected spend-first.

### Execution model — the scan runs inside the API request

`POST /api/scans` calls `executeScan`, which runs the **whole scan to
completion before the HTTP response is sent**. There is no detached promise
and no background worker: on a serverless host the scan lives and dies with
the request. The route declares `maxDuration = 60` (the maximum function
duration available on every Vercel plan), and the whole-scan deadline
`SCAN_MAX_DURATION_MS` (default 55 000 ms) bounds the run below it.

Consequences, by design:

- **Progress is observable during the request.** Each target's state
  (`queued → running → complete | failed`) and stage
  (`dns → request → redirects → inspect → persist`) is persisted as it
  completes, so polling `GET /api/scans/[id]` shows real progress while the
  start request is still in flight.
- **The deadline fails safe.** Targets not reached before the deadline are
  marked failed with the `SCAN_WINDOW_EXCEEDED` target-level error (the
  message tells you to raise the limit together with your host's function
  timeout, or lower `SCAN_MAX_TARGETS`), and the scan completes as
  `partial` — never silently incomplete.
- **One target's failure never sinks the run.** A failed target fails safely;
  the scan ends `complete` (no failures), `partial` (some failures) or
  `failed` (the runner itself could not persist). One conservative retry is
  made for transient network conditions only (connection failures and
  timeouts — never for blocked URLs, 404s or invalid URLs).
- On hosts with longer function limits (Vercel Pro/Enterprise, self-hosted),
  raise the route's `maxDuration` and `SCAN_MAX_DURATION_MS` together.

Targets run with bounded concurrency (`SCAN_CONCURRENCY`; the fixture engine
uses 3). Scan-level aggregates (readiness score, preflight stamp, exposure
totals) are computed by the pure function `aggregateScanStats` from the
persisted target rows — the same function the test suite verifies
deterministically.

### URL safety (SSRF model)

Before any request, and again at **every** redirect hop:

- Only `http:` and `https:` protocols.
- URLs with embedded credentials (`https://user:pass@host/`) are rejected.
- A hostname blocklist catches always-internal names: `localhost`,
  `*.localhost`, `*.local`, `*.internal`, `*.home.arpa`, cloud metadata
  hostnames (`metadata.google.internal`, `metadata`, `instance-data`,
  `ip6-localhost`), and single-label hostnames. IP literals — including
  bracketed IPv6 hosts — are exempt from the single-label rule and
  classified by range instead.
- The hostname is resolved via DNS and **every** returned address is
  classified against unsafe IP ranges — by IP classification, not string
  matching. The CIDR rules are parsed into `ipaddr.js` network objects **at
  module load**; a malformed rule fails loudly at startup (historically the
  table was passed as strings, which silently disabled it — fixed in 0.1.1).
  IPv4 ranges blocked: `0.0.0.0/8`, `10.0.0.0/8`, `100.64.0.0/10` (CGNAT),
  `127.0.0.0/8`, `169.254.0.0/16` (link-local, including the cloud metadata
  address), `172.16.0.0/12`, `192.0.0.0/24`, `192.0.2.0/24` (TEST-NET-1),
  `192.168.0.0/16`, `198.18.0.0/15`, `198.51.100.0/24`, `203.0.113.0/24`,
  `224.0.0.0/4` (multicast), `240.0.0.0/4` (reserved, incl. broadcast).
  IPv6 ranges blocked: `::/128`, `::1/128`, `::ffff:0:0/96` (IPv4-mapped —
  the inner IPv4 address is classified too), `64:ff9b::/96` (NAT64 — inner
  IPv4 classified too), `fc00::/7`, `fe80::/10`, `ff00::/8`, `2001:db8::/32`.
- `SCANNER_ALLOW_LOOPBACK_TARGETS` (default false) is a **test/development
  only** flag that relaxes exactly the loopback rules — the `localhost`
  hostname, `127.0.0.0/8`, `::1` — so the scanner can reach local fixture
  servers. Every other rule (cloud metadata, private ranges, link-local,
  CGNAT, …) stays enforced. It is read from the environment at call time and
  must never be enabled in production (SECURITY.md).
- A blocked destination produces an info finding ("blocked by scanner safety
  rules") — never a request.

### Page fetching

- Redirects are followed **manually**: the HTTP client never auto-follows.
  Each `Location` header is resolved relative to the current URL, re-validated
  through the full safety check above, and only then requested. Redirect
  loops (a URL repeating) and the `SCAN_MAX_REDIRECTS` limit are detected and
  reported. The boundary is exact: a chain of exactly `maxRedirects`
  redirects that ends in a normal response is a **success** (the client
  allows `maxRedirects + 1` requests); `TOO_MANY_REDIRECTS` is reported only
  when the chain is still redirecting after the budget is spent.
- Each request has a hard timeout (`SCAN_TIMEOUT_MS`) enforced with an abort
  signal.
- The response body is capped at `SCAN_MAX_BODY_BYTES` (2 MB); the stream is
  cancelled at the cap.
- Non-HTML content types are recorded but not parsed; page-level checks only
  run on an inspectable 2xx HTML response, so error pages never produce
  "tracking not detected" findings.
- Requests identify themselves as
  `LandingSentinel/0.1 (+landing-page-integrity-check)`.

### Tracking signature catalogue

Static HTML signatures (with excerpt evidence) for: Google Analytics (GA4
gtag.js loader), Google Tag Manager (container loader, noscript iframe,
inline bootstrap), the Google Ads tag, the Meta Pixel, the TikTok Pixel and
the LinkedIn Insight Tag. Detection is platform-relevant: for a destination
receiving Meta spend, the Meta Pixel (or GTM, which can load it at runtime)
is what matters.

### Content heuristics

Cheerio-based inspection: title and meta description presence, noindex
(meta robots and `X-Robots-Tag`), soft-404 signals ("page not found" style
wording on a 200 response), sold-out wording, maintenance/unavailable
wording, CTA presence (button/link vocabulary plus form detection including
embedded form providers), and thin-content measurement. Language heuristics
focus on English.

### Attribution diff

For redirected destinations, the imported URL and the final URL are compared
parameter by parameter across the attribution set (UTMs plus click IDs).
Outcomes: preserved / removed / changed / added, each with both values.

## The finding model

Every finding is a structured record: title, summary (with the associated
spend figure), explanation, recommendation, severity, confidence
(`confirmed`, `high`, `heuristic`, `needs_verification`), and a typed
evidence list (HTTP status, redirect hops, parameter diffs, tracker
signatures with excerpts, DNS/TLS/timeout errors, and so on).

**Stable keys.** A finding's identity is
`normalizedKey::findingKey` — the destination's grouping key plus the check's
own key (e.g. `status_404`, `param_removed_primary`, `tracking_absent_meta`).
The same problem keeps its identity across scans, which is what incident
history is built from: `firstSeenAt` carries forward from the previous
unresolved occurrence, `lastSeenAt` updates every scan, and a finding that
disappears from a later scan is marked `resolvedAt`. Synthetic "after fixes"
scans never mark live findings resolved.

**Claim discipline.** Wording follows what was actually observed: "not
detected", never "missing", unless a runtime check confirmed it. Spend is
described as spend associated with affected destinations — never as proven
revenue loss.

### Severity model

| Severity | Produced by |
| --- | --- |
| **critical** | Confirmed HTTP 404/410/5xx; DNS resolution failure; TLS failure; connection failure; timeout; redirect loop; redirect limit exceeded; removal of a primary UTM parameter (`utm_campaign`, `utm_source`, `utm_medium`) after redirect; platform-relevant tracking absent **with no tag manager** present. |
| **warning** | HTTP 403/429 (scanner access — explicitly framed as possibly scanner-only); other 4xx; non-HTML response; cross-domain hostname change after redirect; removal of secondary UTMs or click IDs; tracking not detected directly but GTM present (needs verification); sold-out, soft-404 and maintenance heuristics; thin content; noindex; missing title; slow response; unmet expectations (expected tracker, text, form or hostname). |
| **info** | Blocked-by-safety destinations; detected tracker signatures; preserved attribution after redirect; same-site hostname change; CTA absence; missing meta description. |

## Scoring

- **Destination score:** starts at 100, minus 40 per critical finding and 12
  per warning; info findings cost nothing. Floored at 0.
- **Scan readiness score:** the spend-weighted average of destination scores
  (Σ score × spend ÷ Σ spend). When there is no spend at all, destinations
  are weighted equally.
- **Preflight stamp — DO_NOT_LAUNCH / REVIEW_BEFORE_LAUNCH / LAUNCH_READY —
  takes precedence over the score.** It is derived from severities alone: any
  critical finding ⇒ DO_NOT_LAUNCH; otherwise any warning ⇒
  REVIEW_BEFORE_LAUNCH; otherwise LAUNCH_READY. A scan can score 88 and still
  be stamped DO_NOT_LAUNCH, and the stamp is the verdict.

## Spend exposure

Exposure is computed at **unique destination** level (after normalization, so
three campaigns at the same page count once, with their spend combined). Each
destination lands in exactly one bucket, in this order of precedence:

1. **Critical** — at least one critical finding.
2. **Warning** — no critical, at least one warning.
3. **Healthy** — no findings of either severity.

No double counting: a destination's spend contributes to one bucket only, so
critical + warning + healthy exposure always sums to total scanned spend.

## API routes

All routes run on the Node runtime (`export const runtime = "nodejs"`) and
return the standard envelope below. Workspace-scoped routes accept
`?scope=demo|app` to select the demo or app workspace context, and are
guarded by `requireAdminFor` when the resolved workspace is the primary
(real) one and `APP_ACCESS_MODE=auth` (the default).

| Route | Methods | Purpose |
| --- | --- | --- |
| `/api/auth/login` | POST | Verify the administrator password (rate-limited) and set the session cookie. |
| `/api/auth/logout` | POST | Destroy the server-side session and clear the cookie. |
| `/api/auth/session` | GET | Session state for the app shell: `authRequired`, `authenticated`, `passwordConfigured`, mode. |
| `/api/dashboard` | GET | Workspace summary: scans, exposure, recent findings. |
| `/api/import/preview` | POST | Parse + map a CSV, return validation summary without persisting. |
| `/api/import` | POST | Commit an import (rows, destinations, spend links). |
| `/api/scans` | GET, POST | List scans; start a scan — the scan **runs inside this request** (route `maxDuration = 60`, bounded by `SCAN_MAX_DURATION_MS`) and the response returns the final state when every target is done. |
| `/api/scans/[id]` | GET | Scan detail: state, targets, progress, findings, stats — polled during a running scan. |
| `/api/findings/[id]` | GET | Finding detail with full evidence and history. |
| `/api/reports` | GET, POST | List reports; generate a report (branding snapshotted). |
| `/api/reports/[id]` | GET | Report payload for the print view. |
| `/api/branding` | GET, PUT | Read / update white-label branding. |
| `/api/system` | GET, POST | Deployment diagnostics and system check (includes the access-control check). |
| `/api/demo/reset` | POST | Rebuild the synthetic demo workspace. |

## Error envelope

Every API response uses one shape:

```
success:  { "ok": true,  "data": ... }
failure:  { "ok": false, "error": { "code": "...", "message": "...", "details": ... } }
```

Error codes: `INVALID_INPUT`, `INVALID_IMPORT`, `INVALID_URL`,
`BLOCKED_URL`, `MIXED_CURRENCY`, `NETWORK_FAILURE`, `SCAN_TIMEOUT`,
`SCANNER_BLOCKED`, `UNSUPPORTED_CONTENT`, `NOT_FOUND`, `RATE_LIMITED`,
`PERSISTENCE_FAILURE`, `AUTH_REQUIRED`, `AUTH_CONFIG_MISSING`,
`AUTH_INVALID_CREDENTIALS`, `SERVER_FAILURE`. Stack traces never reach the
client; unexpected errors are logged server-side with scan/target context
where available. Target-level failures (including `SCAN_WINDOW_EXCEEDED`)
are stored on the `ScanTarget` row as structured error JSON rather than
failing the API request.

## Testing architecture

The quality gate is `npm run qa` — ESLint, `tsc --noEmit`, and the vitest
suite: **175 tests across 9 files** (`tests/*.test.ts`).

- **Runner.** Vitest with the forks pool, one worker and no file parallelism
  (`vitest.config.ts`): every file runs in a fresh child process in
  deterministic order, so environment changes and module-level config can
  never leak between suites. `tests/setup/env.ts` loads the developer's env
  files and applies deterministic overrides (buyer-mode defaults, strict
  SSRF, a short scan timeout).
- **Unit suites** (money, url-normalization, url-safety, redirect-security,
  tracking, content-findings, severity-readiness, spend-exposure) cover the
  pure domain logic: the money parser's separator rules, normalization keys,
  the full SSRF CIDR tables and the loopback flag's exact semantics, the
  manual redirect engine (including the boundary case), tracker
  signatures, content heuristics, the severity/scoring model and exposure
  precedence.
- **Scanner integration suite** (`tests/scanner-integration.test.ts`) runs
  the complete pipeline against the **real** engine and a real HTTP server:
  `tests/helpers/fixture-server.ts` serves deterministic endpoints
  (healthy, redirects that preserve/drop parameters, 404, 500, slow, loop,
  tracker-rich/absent, soft-404, noindex, and a redirect to the cloud
  metadata endpoint that must stay blocked). It requires a PostgreSQL
  `DATABASE_URL`, derives a `<database>_test` connection URL, creates that
  database on the same server via the `postgres` maintenance database,
  runs `prisma migrate deploy` against it, and enables the test-only
  `SCANNER_ALLOW_LOOPBACK_TARGETS` flag (restored afterwards). The
  configured data database is never touched.
- The same fixture endpoints are available by hand through
  `npm run fixtures` (scripts/dev-fixtures.mjs on `127.0.0.1:4010`) with
  `sample-data/fixture-targets.csv` — see DEPLOYMENT.md.
