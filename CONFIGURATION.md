# Configuration

Every environment variable LandingSentinel reads. Values shown are examples —
this file contains no real secrets. Set them in `.env.local` for development
and `.env` (or your host's environment settings) for production.

Two groups behave differently:

- **Server-only variables** are read at runtime by the Node server. Changing
  them only requires a restart.
- **`NEXT_PUBLIC_` variables** are inlined into the client JavaScript at
  build time. Changing them requires a rebuild (`npm run build`) — and, on
  Vercel, a redeploy.

## Database and modes (server-only)

| Variable | Required | Default | Example | What it does |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | yes | — | `file:./db/custom.db` | Database location. A SQLite file path for the bundled dev/demo setup (created by `npm run db:push`), or a Postgres connection string for production (`postgresql://user:password@host/dbname?sslmode=require`). Switching to Postgres also requires changing the provider in `prisma/schema.prisma` — see DEPLOYMENT.md. |
| `DEMO_MODE` | no | `false` | `false` | `true` = the app workspace is the seeded synthetic workspace and scans use the fixture scanner (no real URLs are requested). `false` = normal operation on your real campaign data. Buyer default: `false`. |
| `PUBLIC_SCANNER_ENABLED` | no | `false` | `false` | Gates real URL scanning on the public demo routes (`scope=demo`). `false` = demo routes always use synthetic fixtures. Only enable after reading SECURITY.md. Buyer default: `false`. |

## Scanner limits (server-only, positive integers)

These bound what a scan does. The defaults are chosen so a full
25-destination scan completes in well under two minutes and stays within
serverless function-duration limits.

| Variable | Required | Default | Example | What it does |
| --- | --- | --- | --- | --- |
| `SCAN_MAX_TARGETS` | no | `25` | `25` | Maximum destinations per scan, selected spend-first. |
| `SCAN_CONCURRENCY` | no | `5` | `5` | Simultaneous destination requests during a scan. |
| `SCAN_TIMEOUT_MS` | no | `10000` | `10000` | Per-request timeout, enforced with an abort signal. |
| `SCAN_MAX_REDIRECTS` | no | `5` | `5` | Redirect hops followed before the scan stops. |
| `SCAN_MAX_BODY_BYTES` | no | `2097152` | `2097152` | HTML body cap per response (2 MB). The stream is cancelled at the cap. |
| `SCAN_SLOW_RESPONSE_MS` | no | `3000` | `3000` | Responses slower than this produce a slow-response warning. |

A non-numeric or non-positive value is ignored and the default is used.
Import size is bounded separately at 5,000 rows per file (not configurable via
environment).

Recommendation: leave the `SCAN_*` defaults unchanged unless you have read the
function-duration notes in DEPLOYMENT.md.

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

- Maximum import rows per CSV file: 5,000 (constant in the scanner
  configuration).
- Scanner user agent: `LandingSentinel/0.1 (+landing-page-integrity-check)`
  (constant — the destination sites you scan see this string).
- Demo fixture concurrency: 3 (constant, applies only to the fixture engine).
