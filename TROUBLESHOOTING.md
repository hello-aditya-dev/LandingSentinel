# Troubleshooting

This document covers the operational failures buyers actually hit, in the
order they usually hit them. Each entry follows the same shape — Symptom /
Likely cause / Fix — and quotes the exact message the product shows, so you
can match what you are seeing. For setup, see QUICKSTART.md; for full
deployment procedures, DEPLOYMENT.md; for every environment variable,
CONFIGURATION.md.

## 1. Database not reachable

**Symptom:** The app or API shows "The deployment database is not
reachable — set DATABASE_URL and redeploy (see DEPLOYMENT.md). The demo
needs the database to create its synthetic workspace." `GET /api/system`
reports `Database: fail` with the detail "Not reachable — check
DATABASE_URL". Logs may show a Prisma `P1001` or `P1002` error code, or an
initialization error naming `DATABASE_URL`.

**Likely cause:** `DATABASE_URL` is unset, empty, or points at the wrong
host/credentials, so the server cannot open a PostgreSQL connection. This
is a deployment configuration state, not a product failure — the backend
knows exactly why the request failed and says so.

**Fix:** Set `DATABASE_URL` to a working PostgreSQL connection string in
`.env.local` (development), `.env` (self-hosted production) or your host's
dashboard (Vercel: Project → Settings → Environment Variables). Restart
the server (self-hosted) or redeploy (Vercel). Then re-check `/api/system`.
Also useful from a terminal: `npm run doctor`.

## 2. Database schema missing

**Symptom:** The database connects, but requests fail with "The database
schema is not initialized — run the migration (npm run db:migrate, see
DEPLOYMENT.md)." `GET /api/system` reports `Database schema: fail` with the
detail "Schema missing — run the migration". Logs may show a Prisma `P2021`
(table does not exist) or `P2022` (column does not exist) error code.

**Likely cause:** The database is reachable but no migrations have been
applied to it — a fresh database, or `DATABASE_URL` was changed to point at
a new/empty one after an earlier deployment.

**Fix:** Run `npm run db:migrate` against that database (on Vercel, from
any machine with network access to it:
`DATABASE_URL="postgres://…" npm run db:migrate`). It runs
`prisma migrate deploy` — additive and idempotent: it applies only the
committed migrations that are missing and never resets or drops data. Then
redeploy if the app runs on Vercel.

## 3. ADMIN_PASSWORD_HASH missing (login locked)

**Symptom:** The sign-in view refuses to log anyone in. The API returns
`AUTH_CONFIG_MISSING` (503): "Administrator access is not configured. Set
ADMIN_PASSWORD_HASH (generate one with: npm run hash-password) and restart
the server." `GET /api/system` reports `Access control: fail` with the
detail "APP_ACCESS_MODE=auth but ADMIN_PASSWORD_HASH is not set — the real
workspace is locked. Generate a hash with: npm run hash-password".

**Likely cause:** The default `APP_ACCESS_MODE=auth` is active but no
administrator password hash was configured — the most commonly forgotten
step of a fresh deployment. The real workspace is locked on purpose: no
password configured means no way in.

**Fix:** Run `npm run hash-password` (interactive prompt, minimum 10
characters, or `npm run hash-password -- "my passphrase"`), copy the
printed `ADMIN_PASSWORD_HASH=…` line into `.env.local` / `.env` / your
host's dashboard, and restart the server (redeploy on Vercel).

## 4. Password rejected at sign-in

**Symptom:** Sign-in answers "That password is not correct." (`AUTH_INVALID_CREDENTIALS`,
401) even though you believe the password is right. After five failed
attempts you are additionally locked out for 15 minutes ("Too many failed
sign-in attempts. Wait a few minutes before trying again." — `RATE_LIMITED`,
429).

**Likely cause:** The running server is verifying against a different hash
than the one you think you set. Common variants: the hash was edited after
the server started (`ADMIN_PASSWORD_HASH` is read once at startup — a
running process never sees a later-set value); a stale value exported in
your shell or container overrides the `.env` file (precedence everywhere in
this app is real environment variables → `.env.local` → `.env`); or a
hand-made hash does not match the required format
`scrypt:N:r:p:<salt hex>:<hash hex>` — colon-separated on purpose, because
`$` separators get silently expanded away by dotenv-based loaders, so a
`$`-separated hash always fails verification.

**Fix:** Generate the hash with `npm run hash-password` (its output format
is exactly what the authentication code expects — the plaintext password is
never stored). Put the printed line in `.env.local` or your host's
dashboard, make sure no contradictory `ADMIN_PASSWORD_HASH` is exported in
the shell/container environment, and restart the server after changing any
environment variable. If you tripped the login limiter, wait out the
15-minute window.

## 5. Public scanner disabled

**Symptom:** Scans launched from the public demo routes never make real
network requests — results come back as synthetic fixtures, always the
same. `GET /api/system` shows the `Public scanner` check as
"Disabled (recommended)".

**Likely cause:** `PUBLIC_SCANNER_ENABLED` is `false` — the shipped
default, by design (see SECURITY.md). It gates real-URL scanning on the
public demo routes (`scope=demo`); with it off, those routes always serve
synthetic fixtures so an anonymous visitor can never point your server at
arbitrary URLs. This is a security posture, not a malfunction. (Do not
confuse it with `NEXT_PUBLIC_PAGE_CHECK_ENABLED`, which separately gates
the one-page public checker at `/scan` and defaults to true.)

**Fix:** None needed for normal use: the real scanner is available, for
your real campaign data, in the authenticated workspace at `/app` — no
flag required. To let public demo routes scan real URLs, set
`PUBLIC_SCANNER_ENABLED=true` only after reading SECURITY.md's "Public
scanning warning" (authenticate and rate-limit those routes at the platform
layer first).

## 6. Scanner target returns 403 or 429

**Symptom:** A scanned destination produces the finding "The scanner
received HTTP 403" or "The scanner received HTTP 429" (severity: warning)
with the HTTP status in the evidence.

**Likely cause:** The destination's anti-bot system (WAF, bot protection,
rate limiter) legitimately rejected the scanner's request. The finding's
own text is the honest position: "The site can block automated requests.
This result does not show that normal visitors cannot access the page." A
403/429 to the scanner does NOT mean the target site is broken or that
paid traffic is failing.

**Fix:** Open the destination in a normal browser. If it loads, treat the
finding as scanner access only — the finding carries the response status
precisely so you can make that call. If the site is yours (or the client's),
you can allow the scanner's user agent — the scanner identifies itself as
`LandingSentinel/0.1 (+landing-page-integrity-check)`.

## 7. Scan timeout on a destination

**Symptom:** A destination yields the critical finding "The scanner stopped
this request after the timeout", stating the request did not complete
within the per-request limit (default 10 seconds).

**Likely cause:** The destination accepted the connection but did not
respond within `SCAN_TIMEOUT_MS` (default 10000 ms, enforced with an abort
signal; one conservative retry is made for timeouts and transient
connection failures only). The whole scan is separately bounded by
`SCAN_MAX_DURATION_MS` (default 55000 ms).

**Fix:** First verify the destination's response time in a normal browser
and your monitoring — the finding notes a normal browser may behave
differently if the slowness is intermittent, and a destination that
regularly exceeds the limit will lose paid clicks, which is a real launch
risk worth fixing at the origin. If the destinations are legitimately slow
and you accept that, raise `SCAN_TIMEOUT_MS` (see CONFIGURATION.md) — and
if you scan many slow destinations, raise `SCAN_MAX_DURATION_MS` together
with your host's function timeout so the whole scan still fits (see entry 8).

## 8. Scan cut short on Vercel (60-second function limit)

**Symptom:** A scan finishes as `partial`: some destinations are marked
failed with the code `SCAN_WINDOW_EXCEEDED` — "The scan window
(SCAN_MAX_DURATION_MS=…) closed before this destination was reached. Raise
the limit together with your host's function timeout, or lower
SCAN_MAX_TARGETS."

**Likely cause:** Scans run entirely inside the API request, and the scan
route declares Vercel's `maxDuration = 60` (the maximum available on every
plan, including Hobby). The whole-scan deadline `SCAN_MAX_DURATION_MS`
(default 55000 ms) deliberately bounds the run below that limit;
destinations not reached in time are failed with `SCAN_WINDOW_EXCEEDED`
instead of the function being killed silently.

**Fix:** This is bounded behavior, not data loss — the scan completes as
`partial` and every finding gathered before the window closed is kept. On
Pro/Enterprise you may raise the route's `maxDuration` and
`SCAN_MAX_DURATION_MS` **together** for slower destination sets; on Hobby,
lower `SCAN_MAX_TARGETS` (default 25) or accept partial results for very
large, slow scans. For predictable heavy scanning, a persistent Node host
(VPS, container platform) is the simpler choice (DEPLOYMENT.md §8).

## 9. Tracking tool not detected on a page you know has it

**Symptom:** A finding says tracking "was not detected" for a platform tag
you are confident is installed — often with wording like "Google Tag
Manager is detected… a tag can load at runtime. This static scan cannot
confirm that behavior."

**Likely cause:** The scanner is a static HTML engine: it inspects the
served HTML, and GTM-hosted or JavaScript-injected tags may load
client-side only, leaving no static signature. This honest uncertainty is
intentional, not a bug — check the finding's **confidence** field: when GTM
is present, the absence finding is a *warning* with confidence
`needs_verification`; when neither the tag nor any tag manager is present,
it is *critical* with confidence `high`.

**Fix:** Read the confidence field before acting. For `needs_verification`
findings, open the rendered page with a tag debugger (for example Meta
Pixel Helper, or the platform's own tag diagnostics) and confirm whether
the tag actually fires — the recommendation on each finding names the
right tool. Only treat the absence as a confirmed failure when the tag
cannot be made to fire at runtime either.

## 10. Import rejected: mixed currencies

**Symptom:** An import fails with error code `MIXED_CURRENCY`: "This file
contains more than one currency. Choose one currency or split the analysis
by currency." The error details list the currencies found.

**Likely cause:** The CSV contains spend values in more than one currency.
LandingSentinel stores money as integer minor units with a single ISO
currency code per import and refuses to aggregate different currencies —
adding pounds to dollars would produce a meaningless Money Map, so it
declines rather than guessing.

**Fix:** Import per currency: split the file so each import contains spend
in exactly one currency, then run one analysis per currency. The sample
files in `sample-data/` (all GBP) show the expected shape.

## 11. CSV mapping fails or rows are rejected

**Symptom:** The import wizard cannot map your file, or the preview shows
rows rejected with reasons like "No destination URL" or "Spend is not a
valid amount".

**Likely cause:** Two mapping roles are required — a **destination URL**
column and a **spend** column. Headers are matched against a field-alias
table (exact and fuzzy matching, e.g. "cost", "amount spent" for spend),
and you confirm the mapping before anything is stored; if either required
column cannot be mapped, the import cannot proceed. Individual rows are
rejected individually — a bad row never destroys the import. Also note the
hard limits: at most 5,000 rows per file, and per-row spend above
2,147,483,647 minor units is rejected as `SPEND_TOO_LARGE`.

**Fix:** Open the CSV and confirm it has a full destination URL column
(http/https) and a spend column; map them explicitly in the wizard if the
suggestion missed them (the wizard shows a confidence per suggestion).
Check the rejected-row reasons in the preview — each names its own fix.
Working examples of the expected layouts (Google Ads, Meta, mixed) are in
`sample-data/`; the full import pipeline is documented in ARCHITECTURE.md →
"The import pipeline".

## 12. Report PDF looks wrong

**Symptom:** A saved or printed client report comes out with navigation
chrome, broken pagination or off-scale layout.

**Likely cause:** The report was captured by screenshotting or by a
third-party "print to PDF" tool that ignores the print stylesheet. Client
reports are designed for the browser's native print engine — the print
styles strip all navigation and controls and lay the report out for A4.
There is deliberately no server-side PDF backend.

**Fix:** Open the report in the app and use its **Print / Save PDF**
button (or the browser's Print dialog), then choose "Save as PDF" as the
destination. In the browser's print dialog keep A4 paper and let the print
styles control margins and page breaks — that is the designed workflow.

## 13. Demo does not initialize

**Symptom:** The public campaign demo fails to load its data, or shows a
configuration error instead of the synthetic workspace.

**Likely cause:** The demo needs the same three things as the rest of the
app: a reachable database (`DATABASE_URL`), the migrated schema, and a
session cookie — middleware stamps an `ls_demo_sid` cookie on the first
document load and each anonymous visitor gets their own synthetic
workspace seeded in the database. The failure message names the step: "The
deployment database is not reachable — set DATABASE_URL and redeploy (see
DEPLOYMENT.md). The demo needs the database to create its synthetic
workspace."

**Fix:** Check `GET /api/system` and fix whatever it reports (entries 1–3
above cover `Database: fail`, `Database schema: fail`, and the access
control check). Ensure cookies are enabled in the browser (the demo
session cookie is HttpOnly and set automatically — no login required).
Optional: `npm run db:seed` pre-seeds the shared demo workspace, and on
Vercel a redeploy after the database step completes the same fix.

## 14. Environment variables changed, but production still shows old values

**Symptom:** You edited an environment variable in the Vercel dashboard
(or in `.env`), but the deployed app still behaves according to the old
value — old branding, old checkout URL, old limits.

**Likely cause:** Vercel applies environment variables to functions at
deployment time; changing them in the dashboard does nothing until you
redeploy. Additionally, `NEXT_PUBLIC_*` variables (branding fallbacks,
checkout/portfolio URLs, the public-checker switch) are **inlined into the
client JavaScript at build time**, so they require a rebuild — which on
Vercel also means a redeploy.

**Fix:** After changing any variable in the dashboard, redeploy the
project (Deployments → … → Redeploy, or push a commit). For
`NEXT_PUBLIC_*` values a rebuild is inherent to the redeploy. On a
self-hosted deployment the equivalent rule is: server-only variables need
a server restart, `NEXT_PUBLIC_*` values need `npm run build` again.

## 15. Public checker says you are rate limited

**Symptom:** The one-page public checker (`/scan`, "Scan one landing page")
answers `429 RATE_LIMITED`: "The free one-page check is limited to 3 per
hour. Try again in about N minutes."

**Likely cause:** You ran more than 3 evaluations from the same IP within
an hour. The limit (3 per IP per hour, plus a global per-instance ceiling)
is the intended anti-abuse control on an anonymous public route — see
SECURITY.md. It is not a malfunction and it does not affect the
authenticated workspace's scanner in any way.

**Fix:** Wait out the window (the message tells you how long) or use the
full product at `/app`, which has no such limit. If you administer a busy
deployment, note that the limiter is in memory per instance — on
serverless it is not a hard distributed guarantee, which is why
DEPLOYMENT.md §8 recommends an additional platform-level rate rule
(Vercel Firewall scoped to `POST /api/public/scan`) on plans that offer it.
