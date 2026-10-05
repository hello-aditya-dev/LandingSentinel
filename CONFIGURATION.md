# Configuration

Every environment variable LandingSentinel reads. Values shown are examples —
this file contains no real secrets. Set them in `.env.local` for development
and `.env` (or your host's environment settings) for production.

## File precedence

LandingSentinel follows the Next.js convention everywhere — the app itself,
the `db:*` wrapper script, the seed script and the test runner all resolve
variables in this order:

```
real environment variables  →  .env.local  →  .env
```

Only variables that are not already set are injected from the files, so
container/CI/hosts environment settings always stay in control. `.env.local`
is the recommended place for local development (it is git-ignored);
`.env.example` documents every variable and ships in the repository.

Two groups behave differently:

- **Server-only variables** are read at runtime by the Node server. Changing
  them only requires a restart.
- **`NEXT_PUBLIC_` variables** are inlined into the client JavaScript at
  build time. Changing them requires a rebuild (`npm run build`) — and, on
  Vercel, a redeploy.

## Database and modes (server-only)

| Variable | Required | Default | Example | What it does |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | yes | — | `postgresql://user:password@host:5432/landingsentinel` | PostgreSQL connection string (Neon, Supabase, RDS or self-hosted; `?sslmode=require` where applicable). PostgreSQL is the canonical database — the schema ships with the `postgresql` provider and committed migrations. SQLite is not supported in the commercial package. |
| `DEMO_MODE` | no | `false` | `false` | `true` = the app workspace is the seeded synthetic workspace and scans use the fixture scanner (no real URLs are requested). `false` = normal operation on your real campaign data. Buyer default: `false`. |
| `PUBLIC_SCANNER_ENABLED` | no | `false` | `false` | Gates real URL scanning on the public demo routes (`scope=demo`). `false` = demo routes always use synthetic fixtures. Only enable after reading SECURITY.md. Buyer default: `false`. |

## Access control (server-only)

| Variable | Required | Default | Example | What it does |
| --- | --- | --- | --- | --- |
| `APP_ACCESS_MODE` | no | `auth` | `auth` | `auth` = every route operating on the primary (real) workspace requires an administrator session; the synthetic demo workspace stays public. `open` = auth disabled entirely — escape hatch for private/trusted networks only (warned about in SECURITY.md and in Settings). Any value other than exactly `open` falls back to `auth`. |
| `ADMIN_PASSWORD_HASH` | with `auth` (the default) | empty | `scrypt:16384:8:1:<salt hex>:<hash hex>` | Administrator password hash, generated with `npm run hash-password` (minimum 10 characters; scrypt N=16384, r=8, p=1, 64-byte key, 16-byte salt). Colon-separated **on purpose**: `$` separators in `.env` values are expanded away by dotenv-expand (used by Next.js and most hosting stacks). The plaintext password is never stored or logged. With `auth` mode and no hash configured, the real workspace is locked and `/api/system` reports the fix. |
| `ADMIN_SESSION_TTL_HOURS` | no | `168` (7 days) | `72` | How long an administrator session lasts. Sessions are opaque random tokens in an HttpOnly cookie; the database stores only the SHA-256 hash. |

## Scanner limits (server-only, positive integers)

These bound what a scan does. The defaults are chosen so a full 25-destination
scan fits inside the 60 s serverless function limit the scan route declares.

| Variable | Required | Default | Example | What it does |
| --- | --- | --- | --- | --- |
| `SCAN_MAX_TARGETS` | no | `25` | `25` | Maximum destinations per scan, selected spend-first. |
| `SCAN_CONCURRENCY` | no | `5` | `5` | Simultaneous destination requests during a scan. |
| `SCAN_TIMEOUT_MS` | no | `10000` | `10000` | Per-request timeout, enforced with an abort signal. |
| `SCAN_MAX_REDIRECTS` | no | `5` | `5` | Redirect hops followed before the scan stops. A chain of exactly this many redirects that ends in a normal response is a success. |
| `SCAN_MAX_BODY_BYTES` | no | `2097152` | `2097152` | HTML body cap per response (2 MB). The stream is cancelled at the cap. |
| `SCAN_SLOW_RESPONSE_MS` | no | `3000` | `3000` | Responses slower than this produce a slow-response warning. |
| `SCAN_MAX_DURATION_MS` | no | `55000` | `55000` | Whole-scan deadline. The scan runs inside the API request (serverless-safe); this keeps it below the route's declared 60 s `maxDuration`. Destinations not reached in time are marked failed with `SCAN_WINDOW_EXCEEDED` and the scan completes as `partial`. On hosts with longer function limits, raise this **together with** the route limit. |

A non-numeric or non-positive value is ignored and the default is used.

## Loopback test flag — TEST / DEVELOPMENT ONLY

| Variable | Required | Default | Example | What it does |
| --- | --- | --- | --- | --- |
| `SCANNER_ALLOW_LOOPBACK_TARGETS` | no | `false` | `true` | **Test/development only — never enable in production.** Relaxes **only** loopback targets: the `localhost` hostname, `127.0.0.0/8` and `::1`. Everything else stays blocked — cloud metadata (`169.254.169.254`), RFC 1918 private ranges, link-local, CGNAT, documentation ranges and the rest of the SSRF rule set. Used by the scanner integration test to reach the local fixture server, and by hand via `npm run fixtures` (see DEPLOYMENT.md → "Verifying the real scanner locally"). Read from the environment at call time, so production can never inherit a stale build-time value. |

## White-label fallbacks (NEXT_PUBLIC_ — inlined at build time)

These are fallbacks only. Database branding saved in
Settings → White-label branding takes precedence — see BRANDING.md for the
full precedence rules.

| Variable | Required | Default | Example | What it does |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_PRODUCT_NAME` | no | `LandingSentinel` | `Preflight` | Fallback product name shown before database branding is saved. |
| `NEXT_PUBLIC_AGENCY_NAME` | no | empty | `Meridian Performance Group` | Fallback agency name. |
| `NEXT_PUBLIC_ACCENT_COLOR` | no | `#A7372D` | `#1F4E79` | Fallback accent colour (6-digit hex). |

## Marketing site (NEXT_PUBLIC_ — inlined at build time)

| Variable | Required | Default | Example | What it does |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_CHECKOUT_URL` | no | empty | `https://buy.example.com/landing-sentinel` | Payment link for the marketing site's Buy button. When unset, the button is hidden and replaced by a plain note — no payment provider is hard-wired, the product degrades gracefully. |
| `NEXT_PUBLIC_PORTFOLIO_URL` | no | empty | `https://example.com` | Optional portfolio link shown in the marketing footer ("Built by …"). |

## Support contact (server-only)

| Variable | Required | Default | Example | What it does |
| --- | --- | --- | --- | --- |
| `SUPPORT_EMAIL` | no | empty | `support@your-agency.example` | Fallback support email for branding and reports when none is set in the database. |

## Related knobs that are NOT environment variables

- **Import cap:** at most 5,000 rows per CSV file (constant, not
  configurable).
- **Per-row spend cap:** a single campaign row may carry at most
  2,147,483,647 minor units (£21,474,836.47) — the 32-bit integer storage
  boundary. Rows above it are rejected gracefully with the `SPEND_TOO_LARGE`
  reason and surfaced for review; they do not fail the import.
- **Scanner user agent:** `LandingSentinel/0.1 (+landing-page-integrity-check)`
  (constant — the destination sites you scan see this string).
- **Demo fixture concurrency:** 3 (constant, applies only to the fixture
  engine).
