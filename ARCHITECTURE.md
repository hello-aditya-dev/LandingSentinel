# Architecture

How LandingSentinel is put together, from CSV text to a printed client report.

## Application layers

| Layer | Location | Responsibility |
| --- | --- | --- |
| Presentation | `src/components/*` (`app/`, `paper/`, `marketing/`, `ui/`) | The app UI (dashboard, import wizard, scan detail, Money Map, finding detail, reports, settings), the marketing site, the demo playground, and the paper-dossier design system. A hash router in `src/store/router` drives views; TanStack Query manages server state. |
| Domain libs | `src/lib/money`, `src/lib/csv`, `src/lib/urls`, `src/lib/api`, `src/lib/branding` | Pure logic: money parsing and arithmetic, CSV parsing and row validation, URL normalization and attribution diffing, the API envelope, branding resolution. No database access. |
| Scanner subsystem | `src/lib/scanner/*` | The destination scanner: URL safety, page fetching, tracking detection, content inspection, the check engine that produces findings, and the runner that orchestrates scans. Pure and injectable — the check engine accepts a page-fetcher so it can run on fixtures in tests and demo mode. |
| Services | `src/lib/services/*` | Workspace/scope resolution, branding precedence, the import persistence pipeline, read queries and report generation, the demo seed. |
| Persistence | `prisma/schema.prisma`, `src/lib/db` | Prisma models: Workspace, Client, Branding, ImportBatch, CampaignRow, Destination, DestinationCampaign, Scan, ScanTarget, RedirectHop, Finding, Report, ScanExpectation. SQLite by default; provider-portable to PostgreSQL. |

Configuration constants (env parsing, scanner defaults, product identity)
live in `src/config/product.ts`.

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
   http/https, spend parses as money, currency is a 3-letter code, no exact
   duplicate of an earlier row (same URL + campaign + platform). A bad row is
   rejected with a reason and code; the rest of the import proceeds. The
   server always re-validates — client-side preview is a convenience only.
4. **Persistence.** Valid rows become `CampaignRow` records (original URL and
   the full raw row are stored verbatim). Each URL is normalized into a
   `Destination` grouping key; spend links rows to destinations through
   `DestinationCampaign`.

**Money** is stored as integer minor units (pence/cents) with a separate
ISO 4217 alpha-3 code — never floating point. The parser accepts common
export formats (`1,234.56`, `£1,234.56`, `1.234,56`, `1 234.56`) with
deterministic separator rules, rejects more than two decimal places, and
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
Targets run with bounded concurrency (`SCAN_CONCURRENCY`; the fixture engine
uses 3) and progress is persisted incrementally — each target moves through
the stages `dns → request → redirects → inspect → persist`, observable by
polling.

### URL safety (SSRF model)

Before any request, and again at **every** redirect hop:

- Only `http:` and `https:` protocols.
- URLs with embedded credentials (`https://user:pass@host/`) are rejected.
- A hostname blocklist catches always-internal names: `localhost`,
  `*.localhost`, `*.local`, `*.internal`, `*.home.arpa`, cloud metadata
  hostnames (`metadata.google.internal`, `metadata`, `instance-data`,
  `ip6-localhost`), and single-label hostnames.
- The hostname is resolved via DNS and **every** returned address is
  classified against unsafe IP ranges — by IP classification, not string
  matching. IPv4 ranges blocked: `0.0.0.0/8`, `10.0.0.0/8`,
  `100.64.0.0/10` (CGNAT), `127.0.0.0/8`, `169.254.0.0/16` (link-local,
  including the cloud metadata address), `172.16.0.0/12`,
  `192.0.0.0/24`, `192.0.2.0/24` (TEST-NET-1), `192.168.0.0/16`,
  `198.18.0.0/15`, `198.51.100.0/24`, `203.0.113.0/24`, `224.0.0.0/4`
  (multicast), `240.0.0.0/4` (reserved, incl. broadcast). IPv6 ranges
  blocked: `::/128`, `::1/128`, `::ffff:0:0/96` (IPv4-mapped — the inner
  IPv4 address is classified too), `64:ff9b::/96` (NAT64 — inner IPv4
  classified too), `fc00::/7`, `fe80::/10`, `ff00::/8`, `2001:db8::/32`.
- A blocked destination produces an info finding ("blocked by scanner safety
  rules") — never a request.

### Page fetching

- Redirects are followed **manually**: the HTTP client never auto-follows.
  Each `Location` header is resolved relative to the current URL, re-validated
  through the full safety check above, and only then requested. Redirect
  loops (a URL repeating) and the `SCAN_MAX_REDIRECTS` limit are detected and
  reported.
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
return the standard envelope below.

| Route | Methods | Purpose |
| --- | --- | --- |
| `/api/dashboard` | GET | Workspace summary: scans, exposure, recent findings. |
| `/api/import/preview` | POST | Parse + map a CSV, return validation summary without persisting. |
| `/api/import` | POST | Commit an import (rows, destinations, spend links). |
| `/api/scans` | GET, POST | List scans; start a scan (returns the scan id immediately). |
| `/api/scans/[id]` | GET | Scan detail: state, targets, progress, findings, stats. |
| `/api/findings/[id]` | GET | Finding detail with full evidence and history. |
| `/api/reports` | GET, POST | List reports; generate a report (branding snapshotted). |
| `/api/reports/[id]` | GET | Report payload for the print view. |
| `/api/branding` | GET, PUT | Read / update white-label branding. |
| `/api/system` | GET, POST | Deployment diagnostics and system check. |
| `/api/demo/reset` | POST | Rebuild the synthetic demo workspace. |

Most routes accept `?scope=demo|app` to select the demo or app workspace
context.

## Error envelope

Every API response uses one shape:

```
success:  { "ok": true,  "data": ... }
failure:  { "ok": false, "error": { "code": "...", "message": "...", "details": ... } }
```

Error codes: `INVALID_INPUT`, `INVALID_IMPORT`, `INVALID_URL`,
`BLOCKED_URL`, `MIXED_CURRENCY`, `NETWORK_FAILURE`, `SCAN_TIMEOUT`,
`SCANNER_BLOCKED`, `UNSUPPORTED_CONTENT`, `NOT_FOUND`, `RATE_LIMITED`,
`PERSISTENCE_FAILURE`, `SERVER_FAILURE`. Stack traces never reach the
client; unexpected errors are logged server-side with scan/target context
where available.
