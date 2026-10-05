# Data handling

Exactly what LandingSentinel stores, what it requests over the network, what
it writes to logs — and what it never does. Written so you can answer a
client's data-protection questions without guessing.

## What is stored

Everything lives in your own database (SQLite file or your PostgreSQL
instance). Nothing is stored anywhere else.

| Data | Detail |
| --- | --- |
| Import batches | The CSV filename, dominant detected platform, currency, row counts (original / valid / rejected), and whether the batch is synthetic demo data. |
| Campaign rows | Per imported row: platform, campaign name, ad group name, ad name, **the original destination URL exactly as imported**, spend as integer minor units, currency code, and the **full raw row as JSON** — so evidence always reflects what the file actually contained. |
| Destinations | The normalization grouping key, a representative URL, hostname and path. |
| Spend links | Campaign-row-to-destination links with the spend attributed to each. |
| Scan targets | Per destination per scan: the requested URL, the final URL after redirects, HTTP status, response time, content type, bytes inspected, redirect count, detected tracker summary, per-stage state, and a structured error when one occurred. |
| Redirect hops | Every hop: from URL, to URL, status code, duration. |
| Findings | Title, summary, explanation, recommendation, severity, confidence, associated spend, and the **structured evidence** (status codes, parameter diffs, tracker signature excerpts, DNS/TLS/timeout details). Plus incident history: first seen, last seen, resolved. |
| Reports | Title, generation timestamp, and a snapshot of the branding at generation time. |
| Branding | The white-label fields you save in Settings. |

The scanner does not keep page HTML. It reads the response body in memory,
inspects it, stores findings and evidence excerpts, and discards the rest.

## What is requested over the network

In production mode (`DEMO_MODE=false`), for each scanned destination the
server makes one GET request — plus one per redirect hop, up to five:

- To the imported URL (re-validated for safety at every hop — see
  SECURITY.md).
- With the user agent
  `LandingSentinel/0.1 (+landing-page-integrity-check)` — destination sites
  can identify and allow-list the scanner.
- Accepting HTML; reading at most 2 MB of the body; timing out after 10
  seconds.
- Redirects are followed manually with per-hop safety validation.

That is the entirety of the outbound traffic the scanner generates. In demo
mode and on the public demo routes (with `PUBLIC_SCANNER_ENABLED=false`, the
default), no real URLs are requested at all — scans replay synthetic
fixtures.

## What is logged

Server logs are structured JSON lines with a timestamp, level and event name.
They contain:

- Route completions: path, HTTP status, duration.
- API errors: the error code and message. Stack traces are logged
  server-side only and never returned to clients.
- Scan lifecycle: scan ID, state, preflight status, readiness score, finding
  counts, destination count; failures additionally carry the target ID and
  error message.
- System checks: check names and outcomes.

Per-target stage and timing detail (dns → request → redirects → inspect →
persist) is persisted in the database as scan-target state, which is what the
scan progress panel shows.

Logs never contain cookies, secrets, request bodies or full imported rows.

## What never happens

- **No analytics vendors.** No Google Analytics, no tag on the marketing
  pages, no product telemetry of any kind.
- **No AI services.** Findings are produced by deterministic checks, not by
  a model API. No imported data is sent to any AI provider.
- **No enrichment.** Nothing looks up whois, traffic estimates, or third-party
  data about your destinations or campaigns.
- **No telemetry, no crash reporting, no phone-home.** The application makes
  no calls to the original author's infrastructure, ever.

## An honest note about "your data never leaves your infrastructure"

That phrase is **not** claimed here, because it would not be true in the
strict sense. Two real network activities exist:

1. **Destination requests.** Scanning your campaign URLs necessarily sends
   requests to your (or your client's) web hosting — that is the product's
   purpose. The requests carry the scanner user agent, follow redirects, and
   fetch up to 2 MB of HTML. If a destination is hosted by a third party,
   that third party sees the request in its logs.
2. **Wherever you deploy it.** The application and its database run wherever
   you choose to run them (your server, your Vercel/Neon/Supabase accounts).
   The data lives in infrastructure you control — which is the honest form of
   the claim: nothing is sent to any service operated by the product's
   author, and no account with any vendor is required to run the scanner.

Demo data, for completeness: the seeded workspace is entirely fictional
(Northstar Outfitters, `.test` domains) and can be deleted or rebuilt at any
time.
