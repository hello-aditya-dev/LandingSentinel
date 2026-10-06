# Security

What LandingSentinel does to stay safe on the network, where its boundaries
are, and what you are expected to add yourself. This document is written to
be read end-to-end before a production deployment.

## Access control (single administrator)

LandingSentinel protects the workspace that holds real campaign data with a
deliberately small, standard single-admin model (implemented in
`src/lib/auth.ts`; the model in one line: **one password, server-side
sessions, everything real behind it, the synthetic demo public**).

- **Scope rule.** Every route operating on the primary (real) workspace —
  imports, scans, findings, reports, branding — requires a valid
  administrator session when `APP_ACCESS_MODE=auth` (the default). The
  synthetic demo workspace (no real data) and the marketing site stay public.
  Unauthenticated requests to real-workspace routes get
  `401 AUTH_REQUIRED`. In the app UI, the shell shows an administrator
  sign-in view; the demo playground never asks for a password.
- **The password.** One administrator, identified by a password. The hash
  lives in the `ADMIN_PASSWORD_HASH` environment variable — never plaintext.
  Generate it with `npm run hash-password` (minimum 10 characters; the
  plaintext is never stored or logged). Parameters: scrypt with N=16384,
  r=8, p=1, a 16-byte random salt and a 64-byte key.
- **Hash format — colon-separated on purpose.** The stored value is
  `scrypt:N:r:p:<salt hex>:<hash hex>` (for example
  `scrypt:16384:8:1:740ca889…:1fc29c68…`). `$`-separated formats are avoided
  deliberately: dotenv-expand (used by Next.js and most hosting stacks)
  expands `$` sequences in `.env` values and would silently corrupt a
  `$`-separated hash. Colons are safe everywhere.
- **Sessions.** Login (`POST /api/auth/login`) verifies the password and
  creates a server-side session: an opaque random 48-byte token (hex) issued
  in the `ls_admin_session` cookie, and a row in the `AdminSession` table
  holding **only the SHA-256 hash of the token**, an expiry and a
  `lastSeenAt` timestamp. Verification compares hashes; expired sessions are
  deleted when observed. Default expiry: 7 days (`ADMIN_SESSION_TTL_HOURS`,
  default 168). Logout (`POST /api/auth/logout`) destroys the server-side
  row and clears the cookie.
- **Cookie flags.** `HttpOnly` (no JavaScript access), `SameSite=Lax`,
  `Path=/`, and `Secure` whenever `NODE_ENV=production` — which `next start`
  sets automatically, so self-hosted production gets `Secure` cookies without
  extra configuration. Plain `http://localhost:3000` development works
  because browsers treat localhost as a secure context.
- **Login rate limiting.** 5 failed attempts per IP address per 15-minute
  window lock that IP out of login (`429 RATE_LIMITED`) until the window
  expires; a successful login clears the counter. The counter is **in
  memory, per server instance** — a documented limitation: on serverless
  platforms (Vercel) each instance keeps its own counter, so this raises the
  cost of online brute force rather than eliminating it. Choose a long,
  unguessable password. For hard guarantees, rate-limit at the platform or
  proxy layer.
- **`APP_ACCESS_MODE=open` disables auth entirely** — every route becomes
  public, including real campaign data. It exists as an escape hatch for
  private, trusted networks (an internal VM only your team can reach) and is
  warned about in the docs and in Settings → System. On a public deployment,
  prefer keeping `auth` and adding platform-level protection instead — Vercel
  Authentication / SSO on the project, or Cloudflare Access / a proxy with
  basic auth in front.
- `npm run doctor` and Settings → System report the access-control state
  (mode configured, hash configured) without exposing secrets.

There is no multi-user model, no OAuth, no roles — one administrator is the
product's shape. Anyone needing more should front it with the platform-level
tools above.

## Scanner SSRF protection

The scanner makes outbound requests to URLs that came out of imported CSV
files, which is the classic server-side request forgery (SSRF) surface. Every
URL passes a safety check before any request is made — and again at every
redirect hop:

- **Protocol allowlist.** Only `http:` and `https:`. Anything else
  (`file:`, `ftp:`, internal schemes) is rejected before any connection.
- **Embedded credentials rejected.** `https://user:pass@host/` URLs are not
  scanned.
- **Hostname blocklist.** `localhost`, `*.localhost`, `*.local`,
  `*.internal`, `*.home.arpa`, cloud metadata hostnames
  (`metadata.google.internal`, `metadata`, `instance-data`,
  `ip6-localhost`) and single-label hostnames (no dot, not an IP literal —
  treated as internal) are rejected regardless of what they resolve to.
  IPv6 literal hosts in URLs (bracketed forms like
  `http://[::1]/`) are exempt from the single-label rule and reach the
  IP-range classifier below — an internal IPv6 literal is blocked by range,
  not by accident of syntax.
- **DNS resolution with full address classification.** The hostname is
  resolved, and **every** returned address is classified against unsafe IP
  ranges — by parsing the address, not by string matching. If any address
  falls in an unsafe range, the destination is blocked. The ranges cover
  loopback, RFC 1918 private space, CGNAT shared space (100.64.0.0/10),
  link-local (including the cloud metadata address 169.254.169.254), IETF
  protocol assignments, the TEST-NET documentation ranges, benchmarking
  ranges, multicast and reserved space for IPv4; and unspecified, loopback,
  unique-local, link-local, multicast and documentation ranges for IPv6.
  IPv4-mapped IPv6 addresses (`::ffff:0:0/96`) and NAT64 addresses
  (`64:ff9b::/96`) are unwrapped and the inner IPv4 address is classified
  too.
- **Parsed network tables — and why that matters.** The CIDR rules are
  parsed into `ipaddr.js` network objects **at module load**. Historically
  (before 0.1.1) the ranges were passed to `match()` as raw strings, which
  always threw and was caught — the entire IP-range blocklist was silently a
  no-op. Networks are now parsed once at startup, and a malformed rule fails
  loudly at boot instead of silently at request time. The classification
  itself is exercised by 29 unit tests plus the scanner integration test,
  which proves the cloud-metadata block holds even with the loopback test
  flag enabled.
- **Re-validated at every redirect hop.** Redirects are followed manually
  (below), and the next URL goes through the identical static + DNS + IP
  classification before it is requested. A redirect cannot walk the scanner
  into an internal address.
- **Blocked ≠ requested.** A blocked destination produces an info finding
  ("Destination blocked by scanner safety rules") explaining why. The
  scanner never makes the request.

### `SCANNER_ALLOW_LOOPBACK_TARGETS` — test/dev-only flag

Default **false**. When set to `true`, the SSRF rules relax **only loopback**:
the `localhost`/`*.localhost`/`ip6-localhost` hostnames, `127.0.0.0/8` and
`::1`. It exists so the scanner can reach local fixture servers — the
integration test's fixture server and the manual `npm run fixtures` server
(DEPLOYMENT.md → "Verifying the real scanner locally"). Everything else
stays blocked when the flag is on: cloud metadata (169.254.169.254),
RFC 1918 private ranges, link-local, CGNAT, documentation ranges — the rest
of the rule set is unaffected, and single-label hostnames other than
`localhost` remain blocked even in test mode. It is read from the
environment at call time (not cached), so production can never inherit a
stale build-time value. **It must never be enabled in production.**

## Redirect policy

The HTTP client never follows redirects automatically (`redirect: "manual"`).
Each hop is read from the `Location` header, resolved relative to the current
URL, re-validated through the full SSRF check, and only then requested.
Limits: at most `SCAN_MAX_REDIRECTS` (default 5) hops, and a URL that repeats
ends the chain as a redirect loop. Both are reported as critical findings
with the full hop chain as evidence.

The boundary is exact: a chain of **exactly** `maxRedirects` redirects that
then returns a normal response is a **success** — the scanner allows
`maxRedirects + 1` requests, so the final hop is reachable and inspectable.
`TOO_MANY_REDIRECTS` is reported only when the chain is still redirecting
after the budget is spent. (Before 0.1.1, the boundary case was falsely
reported as `TOO_MANY_REDIRECTS` — fixed, with a regression test.)

## Resource limits

- Per-request timeout: `SCAN_TIMEOUT_MS` (default 10 s), enforced with an
  abort signal. One conservative retry is made for transient connection
  failures and timeouts only.
- Response body cap: `SCAN_MAX_BODY_BYTES` (default 2 MB). The stream is
  cancelled at the cap.
- Per scan: at most `SCAN_MAX_TARGETS` (default 25) destinations, run with
  bounded concurrency (`SCAN_CONCURRENCY`, default 5).
- Whole-scan deadline: `SCAN_MAX_DURATION_MS` (default 55 s) — the scan runs
  inside the API request, and this keeps it below the route's declared 60 s
  function limit. Destinations not reached in time are marked failed with
  `SCAN_WINDOW_EXCEEDED` and the scan completes as `partial` rather than
  being killed silently.
- Per import: at most 5,000 rows; per row, at most 2,147,483,647 minor units
  of spend (rejected gracefully as `SPEND_TOO_LARGE` above the 32-bit
  storage boundary).

## Known limitation: DNS rebinding (TOCTOU)

The safety check resolves DNS and classifies the addresses, then the fetch
resolves DNS again. A malicious nameserver can answer the second resolution
differently (DNS rebinding), returning an internal address between the check
and the request. This is a time-of-check/time-of-use gap that application-level
validation cannot fully close. For strict deployments — especially where the
host can reach internal networks — enforce egress filtering at the network
layer (allow outbound 80/443 only, block RFC 1918 and link-local at the
firewall or NAT level). Standard hosted platforms that only offer public
egress make this class of attack largely moot.

## Secrets handling

- Two credentials exist in the environment: the database connection string
  and `ADMIN_PASSWORD_HASH` (scrypt; the plaintext password is never stored
  or logged).
- Nothing secret is placed in client JavaScript: `NEXT_PUBLIC_*` variables
  hold display strings (names, colours, links) by design.
- The scanner uses **no third-party API keys** — no scan depends on an
  external scanning service, so there is no key to leak.

## One-page public checker (0.1.2)

`NEXT_PUBLIC_PAGE_CHECK_ENABLED` (default **true**) enables the anonymous
one-page evaluation route (`POST /api/public/scan`) behind the homepage's
"Scan one landing page" CTA. Unlike `PUBLIC_SCANNER_ENABLED` (below), this
route is designed to be public and is constrained accordingly:

- **Exactly one public http(s) URL per evaluation** — no bulk, no CSV, no
  history, no reports, no workspace involvement.
- **Every SSRF control applies**: the URL is parsed up front (protocol
  allowlist, embedded-credential rejection), and the fetch itself resolves
  DNS and rejects loopback/private/link-local/metadata ranges, re-validating
  **every redirect hop** — unsafe destinations are never requested.
- **Scanner limits**: the standard request timeout, redirect cap and body
  cap; `maxDuration = 30`.
- **No caller-controlled headers, cookies or credentials are forwarded.**
- **Rate limiting**: 3 evaluations per IP per hour plus a global per-instance
  ceiling. In-memory, per instance — the same documented limitation as the
  login limiter; on serverless, put a platform-level limit in front for
  hard guarantees.
- **Ephemeral by design**: the evaluation writes nothing to the database,
  adds nothing to any workspace, and the evaluated URL is never logged
  (server logs carry only the outcome code and finding count).
- Disable entirely with `NEXT_PUBLIC_PAGE_CHECK_ENABLED=false` (hides the
  CTA and returns an error from the route).

## Public scanning warning

`PUBLIC_SCANNER_ENABLED` (default **false**) is the only switch that lets the
public demo routes run the **real** scanner against arbitrary URLs. With the
default settings the demo is inert: fixtures only, no network requests.

If you enable it, understand what you are operating: a public endpoint that
makes your server request URLs supplied by visitors. Before enabling it on a
public deployment:

1. Put authentication in front of the demo routes (platform-level protection
   — see the access-control section above).
2. Rate-limit them at your platform or proxy.
3. Keep the SCAN_* defaults so the blast radius per request stays bounded.

For a private deployment used only by your team, leave it off — the app
workspace scanner does not need it.

## Data boundaries

- **No telemetry.** The application makes no analytics or error-reporting
  calls of its own.
- **No phone-home.** Nothing in the product checks in with the original
  author's infrastructure. Outbound requests go exactly where your imported
  campaign URLs point (plus your database).

## XSS posture

User-controlled text — campaign names, URLs, finding titles, evidence values
and snippets — is rendered as **text** throughout the UI. React's escaping
applies everywhere; evidence snippets are never injected as HTML. Imported
CSV content cannot execute in the app's UI. (The one
`dangerouslySetInnerHTML` use in the codebase is the unmodified shadcn/ui
chart component's static CSS string — not user-controlled.)

## CSV injection note for exports

The Money Map's copy-to-clipboard produces tab-separated **text**, not a CSV
file, and pasting it into a spreadsheet is the intended workflow. The same
caution applies as with any CSV export: if a cell begins with `=`, `+`, `-`
or `@`, Excel and some other spreadsheet applications may interpret it as a
formula. LandingSentinel stores and echoes imported values verbatim by
design (evidence fidelity), so it does not neutralise such content. When
pasting or opening exported data in Excel, use Data → From Text/CSV (which
treats everything as text) rather than double-clicking a file, and review
cells that start with those characters before allowing recalculation.

## Hardening fixes in this release (0.1.1)

Security- and correctness-relevant fixes made during the commercial-release
hardening (see CHANGELOG.md):

1. **SSRF IP classification was silently inert.** `ipaddr.js` `match()` was
   called with string CIDR bases, which always threw and was swallowed — the
   entire IP-range blocklist did nothing. Networks are now parsed at module
   load; a malformed rule fails loudly at startup. (Hostname and protocol
   rules were always active; the range table was the gap.)
2. **Redirect boundary.** A chain of exactly `maxRedirects` redirects ending
   in 200 was falsely reported as `TOO_MANY_REDIRECTS`; it is now a success.
3. **IPv6 literal hosts** in URLs (bracketed) now reach the IP-range
   classifier instead of the single-label hostname rule.
4. **Money parser:** `"1,700"` (single comma, 3-digit group) was rejected;
   it is now valid — thousands grouping with a first group of 1–3 digits.
5. **PostgreSQL FK cascade:** `ScanTarget.destinationId` is now
   `ON DELETE CASCADE` — workspace deletion and the demo reset previously
   failed on PostgreSQL.
6. **Per-row spend cap:** rows above 2,147,483,647 minor units (int4
   boundary) are rejected gracefully as `SPEND_TOO_LARGE` instead of
   failing the import or the database write.

## Demo-session workspace lifecycle

The public campaign demo (`/demo`) is session-isolated: middleware stamps an
HttpOnly `ls_demo_sid` cookie, and each anonymous visitor gets a private
synthetic workspace (`demo:s:{uuid}`) created and seeded inside one database
transaction — one visitor can never observe another's demo state.

Those anonymous workspaces do not accumulate forever:

- Whenever a demo session workspace is created or accessed, stale demo
  workspaces whose database `createdAt` is older than 24 hours are deleted
  opportunistically (at most one sweep per process per hour).
- The delete predicate matches only the `demo:s:` slug prefix — it can never
  match the buyer's real (`primary`) workspace or any custom workspace slug.
- Deletes cascade through the schema (findings, scans, campaign rows, and so
  on) and are atomic; failures are swallowed and retried on a later access.
- On serverless multi-instance deployments each instance sweeps
  independently, which is sufficient because every instance can only ever
  delete synthetic data matching the same prefix-and-age predicate.

## Public one-page checker (`/scan`)

`POST /api/public/scan` accepts exactly one public http(s) URL per call, is
fully ephemeral (nothing is written to the database; the evaluated URL is
never logged), applies every scanner SSRF control, and is rate-limited in
memory (3 per IP per hour plus a global ceiling). On serverless those
per-instance limits are not a hard distributed guarantee — configure a
platform-level rate rule (Vercel Firewall on `POST /api/public/scan`, keyed
by client IP) where available; see DEPLOYMENT.md §8 for the recommended
scope and the honest limitation for plans without Firewall access.
