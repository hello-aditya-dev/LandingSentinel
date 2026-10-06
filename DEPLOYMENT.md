# Deployment

Zero to a deployed LandingSentinel instance. Read SECURITY.md before putting
a production deployment on the public internet — it covers the access-control
model, the SSRF protections and the known limitations.

## Prerequisites

- Node.js 20 or newer (Node 24 recommended)
- npm for installs and commands (`package-lock.json` is committed, so
  `npm install` is the supported, reproducible path)
- A PostgreSQL database. PostgreSQL is the **canonical** database: hosted
  (Neon, Supabase, Amazon RDS) or self-hosted. The Prisma schema ships with
  the `postgresql` provider and the migrations are committed under
  `prisma/migrations/` — **no provider editing is ever needed**. SQLite is not
  supported in the commercial package.

## 1. Install

```
git clone <your-copy> landing-sentinel   # or unpack your source package
cd landing-sentinel
npm install
```

`npm install` also runs `prisma generate` (via `postinstall`), which produces
the database client.

## 2. Environment file

```
cp .env.example .env.local      # development
cp .env.example .env            # self-hosted production
```

Then edit the file. Every variable is documented in CONFIGURATION.md. The
minimum you must set:

- `DATABASE_URL` — your PostgreSQL connection string.
- `ADMIN_PASSWORD_HASH` — the administrator password hash (next section).
  Required for the default `APP_ACCESS_MODE=auth`.

On Vercel (or any host with a dashboard), set the same variables in the
project's environment settings instead.

The shipped buyer defaults are `DEMO_MODE=false` and
`PUBLIC_SCANNER_ENABLED=false` — keep them that way for a production
deployment.

## 3. Database provisioning (PostgreSQL)

Provision a PostgreSQL database and copy its connection string. Typical
examples:

| Host | Connection string shape |
| --- | --- |
| Neon | `postgresql://user:password@ep-xxxx.region.aws.neon.tech/landingsentinel?sslmode=require` |
| Supabase | `postgresql://postgres.project-ref:password@aws-0-region.pooler.supabase.com:5432/postgres` (use the connection string from Project Settings → Database) |
| Amazon RDS | `postgresql://user:password@your-instance.region.rds.amazonaws.com:5432/landingsentinel` |
| Self-hosted | `postgresql://user:password@127.0.0.1:5432/landingsentinel` |

Set it as `DATABASE_URL` in your env file, then apply the committed
migrations:

```
npm run db:migrate
```

`db:migrate` runs `prisma migrate deploy` through a small wrapper that loads
`.env.local` then `.env` (real environment variables still win), so it works
with either file. There is nothing to switch in `prisma/schema.prisma` — it
already declares `provider = "postgresql"`.

For Vercel: run `npm run db:migrate` once from your machine with
`DATABASE_URL` pointing at the production database (or add it to the build
command). Migrations are idempotent — `migrate deploy` only applies what is
missing.

## 4. Seed (optional but recommended)

```
npm run db:seed
```

This rebuilds the synthetic demo workspace — a fictional client
("Northstar Outfitters"), three imports matching the files in `sample-data/`,
four historical scans and a client report. It is safe to run at any time; it
only touches the demo workspace, never your primary workspace.

## 5. Administrator password

```
npm run hash-password
```

The script prompts for a password (minimum 10 characters), confirms it, and
prints an `ADMIN_PASSWORD_HASH=…` line. Put that line in your env file (or
your host's dashboard) and restart the server. With the default
`APP_ACCESS_MODE=auth`, every route operating on the real workspace then
requires sign-in; the synthetic demo workspace stays public. Full model in
SECURITY.md.

If `ADMIN_PASSWORD_HASH` is unset while `APP_ACCESS_MODE=auth`, the real
workspace is locked: the sign-in view and `/api/system` both say so, and the
fix is exactly this step.

## 6. Development server

```
npm run dev
```

Opens on http://localhost:3000 (logs are also written to `dev.log`). Plain
HTTP on localhost is fine: browsers treat localhost as a secure context, so
the session cookie works without TLS.

## 7. Production build and start (self-hosted)

```
npm run build
npm run start
```

`npm run build` is a standard `next build` — it fails on TypeScript errors
(there is no ignore-build-errors switch; `npm run qa` and the build share the
same type contract). `npm run start` runs `next start` on port 3000 with
`NODE_ENV=production`, so the session cookie is marked `Secure` automatically.
Serve it over HTTPS — put a reverse proxy with TLS in front (Caddy, nginx,
Traefik) for a conventional deployment. Browsers only send `Secure` cookies
over HTTPS (localhost excepted), so plain HTTP on a non-localhost host will
break sign-in.

## 8. Vercel

LandingSentinel can be deployed to Vercel. Points that matter:

- **Order of operations for a working deployment.** The demo and the
  authenticated workspace both persist to PostgreSQL — a Vercel deployment
  without a reachable database serves the marketing site and the one-page
  checker, but the campaign demo will fail with a clear configuration
  message until the database step is done. Complete in this order:
  1. Provision PostgreSQL (Neon / Supabase / any reachable server) and copy
     its connection string.
  2. Project → Settings → Environment Variables → add `DATABASE_URL`
     (Production) and `ADMIN_PASSWORD_HASH` (Production, from
     `npm run hash-password`).
  3. **Apply the committed migrations to that database once** from any
     machine with network access to it: `DATABASE_URL="postgres://…" npm
     run db:migrate` (this is `prisma migrate deploy` — additive and safe;
     it never resets data).
  4. Redeploy (or push a commit) so the functions start with the new
     environment, then verify `GET /api/system` — `Database: ok`,
     `Database schema: ok`, `Access control: ok`.
  5. Optional: `DATABASE_URL="postgres://…" npm run db:seed` if you want the
     shared demo workspace pre-seeded (the per-session public demo seeds
     itself automatically).

- **Environment variables** (Project → Settings → Environment Variables):
  - `DATABASE_URL` — your PostgreSQL connection string (Neon and Supabase are
    the common pairings; the SQLite-style file URL would not persist anyway).
  - `ADMIN_PASSWORD_HASH` — generate with `npm run hash-password` locally and
    paste the result.
  - `APP_ACCESS_MODE` — optional; `auth` is the default. Only set it to
    `open` for a private, trusted deployment (see SECURITY.md) — the better
    Vercel alternative to disabling auth is platform-level protection
    (Vercel Authentication / SSO or Cloudflare Access in front).
  - Optional `SCAN_*` limits — see CONFIGURATION.md.
  - `NEXT_PUBLIC_SITE_URL` — optional; the canonical public URL used for
    social-preview metadata (Open Graph / Twitter card image URLs, the
    canonical link and the sitemap). On Vercel the deployment URL is picked
    up automatically when unset; set it when you attach a custom domain.
  - `NEXT_PUBLIC_*` branding values are inlined at build time, so changing
    them requires a redeploy.
- **Public scanner rate limiting at the platform level (recommended).**
  The application already rate-limits `POST /api/public/scan`
  (3 per IP per hour plus a global ceiling, in memory per instance). On
  serverless, per-instance limits are not a hard distributed guarantee, so
  configure Vercel Firewall (Project → Security → Firewall) when your plan
  has it: a rate-limit rule scoped to path `/api/public/scan`, method POST,
  keyed by client IP, with a strict limit (e.g. 10/hour). Do **not** scope
  it to the homepage, static assets, the demo fixture APIs or the
  authenticated scan routes. Vercel Firewall configuration lives in the
  dashboard (it cannot be expressed from this repository), so if your plan
  has no Firewall access, the application-level limiter is the enforced
  control — that limitation is stated here honestly.
- **Node runtime.** All API routes — including the scanner routes — already
  declare `export const runtime = "nodejs"` in their source. The scanner uses
  Node APIs (DNS resolution, IP classification) that are not available in the
  edge runtime. No route config changes are needed.
- **Scans run inside the request.** `POST /api/scans` executes the whole scan
  — up to `SCAN_MAX_TARGETS` destinations — before responding; there is no
  detached background work. The route declares `maxDuration = 60` (the
  maximum available on every Vercel plan), and the whole-scan deadline
  `SCAN_MAX_DURATION_MS` (default 55 000 ms) bounds the run below it:
  destinations not reached in time are marked failed with
  `SCAN_WINDOW_EXCEEDED` and the scan completes as `partial` instead of being
  cut off silently. Progress during the request is observable by polling
  `GET /api/scans/[id]` — each target's state is persisted as it completes.
  On the Hobby plan the 60 s function limit applies; on Pro/Enterprise you
  may raise the route's `maxDuration` and `SCAN_MAX_DURATION_MS` **together**
  if you scan slower destinations. For predictable heavy scanning, a
  persistent Node host (VPS, container platform) is the simpler choice.
- **Build command:** `npm run build`. **Install command:** `npm install`.

## 9. Custom domain (optional)

Point your domain at the deployment (Vercel assigns domains automatically; on
a VPS, add a DNS record and terminate TLS at your reverse proxy). No
application change is required.

## 10. Post-deployment health checks

1. Visit `/api/system` — it should return a JSON envelope with
   `ok: true`, the runtime configuration and a checks array (Node runtime,
   database, schema, scanner, demo mode, public scanner, access control,
   environment).
2. In the app, open **Settings → System → Run system check** — the same
   diagnostics through the UI. The access-control check fails loudly when
   `APP_ACCESS_MODE=auth` is set but `ADMIN_PASSWORD_HASH` is missing.
3. Run the command-line check:

   ```
   npm run doctor
   ```

   It verifies the Node version (≥ 20), the env file, `DATABASE_URL`, the
   database connection, the schema (core tables queryable) and the scanner
   configuration. It exits with code 1 if any check fails, so it can be used
   in CI or post-deploy hooks. (On hosts without env files it accepts
   `DATABASE_URL` from the process environment.)

## 11. Verifying the real scanner locally

You do not need live client URLs to watch the real engine work. The package
ships a deterministic fixture server and a matching CSV:

1. **Start the fixture server** (development only):

   ```
   npm run fixtures          # serves on http://127.0.0.1:4010
   npm run fixtures -- 4111  # custom port
   ```

   It serves a healthy page (with trackers), redirects that preserve or drop
   campaign parameters, a real 404, a real 500, a slow endpoint, a redirect
   loop, tracker-rich and tracker-absent pages, a soft-404, a noindex page,
   and a redirect to the cloud metadata endpoint (which must always stay
   blocked).

2. **Allow loopback targets — test flag, development only.** Add to
   `.env.local` and restart the dev server:

   ```
   SCANNER_ALLOW_LOOPBACK_TARGETS=true
   ```

   The scanner blocks loopback by default. This flag relaxes **only**
   loopback — the `localhost` hostname, `127.0.0.0/8` and `::1`. Cloud
   metadata, private ranges, link-local and every other SSRF rule stay
   enforced. It must never be enabled in production (SECURITY.md).

3. **Import `sample-data/fixture-targets.csv`** through the import wizard
   (14 rows pointing at `http://127.0.0.1:4010/…`, with the campaign
   parameters each case needs).

4. **Run a scan** from the app with the default buyer configuration
   (`DEMO_MODE=false`). You are now watching the real engine: live HTTP,
   manual redirects, tracker detection, content checks. Expected outcome:
   the parameter-dropping redirect, 404, 500, timeout, loop, missing-tracker
   and soft-404 destinations land as critical; the noindex page as a
   warning; the metadata redirect is blocked and reported as an info
   finding — the scan ends stamped DO NOT LAUNCH.

5. **Remove the flag** from `.env.local` when you are done. The same
   verification runs automatically in the scanner integration test
   (`npm run test`) against a `*_test` database — see README.md → Testing.

## 12. Commercial checkout (/buy)

LandingSentinel sells the Agency Commercial Licence directly on its own
`/buy` route — PayPal for international buyers, Razorpay for India. The
full variable reference is in CONFIGURATION.md → "Commercial checkout";
this section is the operational setup.

**Security model (already built in):** every amount is a fixed integer
minor-unit value resolved on the server; the browser never sends money,
status, or product fields; orders are created and captured server-side;
Razorpay signatures and PayPal webhooks are verified server-side; purchase
records only become `paid` through verified provider data, idempotently;
secrets never leave the server; no card data ever touches the deployment.

### 12.1 Configure the prices

```
LANDINGSENTINEL_PRICE_GBP_MINOR=34900      # £349 — canonical, default
LANDINGSENTINEL_PRICE_INR_MINOR=           # your India sticker price (paise)
```

The GBP price is never recalculated. The INR price is a separate fixed
sticker price you select — Razorpay stays unavailable until it is set.

### 12.2 PayPal (international)

1. Create a REST API app in the PayPal Developer Dashboard (start with the
   **sandbox** credentials).
2. Set in the deployment environment:

   ```
   PAYPAL_CLIENT_ID=…
   PAYPAL_CLIENT_SECRET=…
   PAYPAL_ENV=sandbox
   PAYPAL_WEBHOOK_ID=…
   ```

3. In the dashboard, add a **Webhook** for the app and subscribe to at
   least `Payment capture completed` (`PAYMENT.CAPTURE.COMPLETED`) and
   optionally `Checkout order completed`. Point the webhook URL at your
   deployment:

   ```
   https://your-domain.example/api/webhooks/paypal
   ```

4. Copy the resulting webhook id into `PAYPAL_WEBHOOK_ID`.
5. Redeploy (env changes require a redeploy on Vercel). `/api/system`
   should now report `Checkout: PayPal (sandbox) configured`.
6. **Going live:** switch `PAYPAL_ENV=live` and replace the credentials
   with live keys from the same dashboard (Apps & Credentials → Live).
   Re-register the webhook against the live endpoint if the ids differ,
   update `PAYPAL_WEBHOOK_ID`, redeploy, and run one live-mode test before
   announcing.

### 12.3 Razorpay (India)

1. Create a Razorpay account and get the **Test** keys (Settings → API
   Keys).
2. Set in the deployment environment:

   ```
   RAZORPAY_KEY_ID=…
   RAZORPAY_KEY_SECRET=…
   RAZORPAY_WEBHOOK_SECRET=…
   LANDINGSENTINEL_PRICE_INR_MINOR=…
   ```

3. In Settings → Webhooks, add a webhook for the event
   `payment.captured` pointing at:

   ```
   https://your-domain.example/api/webhooks/razorpay
   ```

   Enter a webhook secret and use the same value for
   `RAZORPAY_WEBHOOK_SECRET`.
4. Redeploy. `/api/system` should report Razorpay as configured.
5. **Going live:** replace the test keys with Live keys, update the
   webhook secret to the live webhook's secret, redeploy, and run one
   live-mode test before announcing.

### 12.4 Fulfilment

Purchases appear in the `Purchase` table (`status: pending | paid | failed
| refunded`, `fulfillmentStatus: pending | delivered`). For the first
commercial release, delivery is manual and verified: follow
`docs/SALES-HANDOFF.md` — verify the record is `paid` (server-verified
only, never a buyer screenshot), email the source package with the licence
and QUICKSTART.md, then record `fulfillmentStatus: delivered`. The
commercial source package is never exposed at a public URL.

