# Deployment

Zero to a deployed LandingSentinel instance. Read SECURITY.md before putting
a production deployment on the public internet — V1 ships without built-in
authentication, and you are expected to put your own access protection in
front of it.

## Prerequisites

- Node.js 20 or newer (Node 24 recommended)
- npm for installs and commands, plus Bun 1.x — the seed script
  (`npm run db:seed`) and the shipped start script (`npm run start`) execute
  through Bun
- A PostgreSQL database for production (Neon, Supabase, RDS, or any hosted
  Postgres). For local development and demo deployments, SQLite is bundled —
  no database server is required.

## 1. Install

```
git clone <your-copy> landing-sentinel   # or unpack your source package
cd landing-sentinel
npm install
```

## 2. Environment file

```
cp .env.example .env.local      # development
cp .env.example .env            # production
```

Then edit the file. Every variable is documented in CONFIGURATION.md. The
minimum you must set is `DATABASE_URL`. The shipped buyer defaults are
`DEMO_MODE=false` and `PUBLIC_SCANNER_ENABLED=false` — keep them that way for
a production deployment.

## 3. Database provisioning

**Bundled development/demo (SQLite).** Do nothing beyond leaving
`DATABASE_URL=file:./db/custom.db`. The file is created by `db:push`; no
database server is involved.

**Production (PostgreSQL).** LandingSentinel ships with the Prisma datasource
set to `sqlite` so the bundled demo works out of the box. To use Postgres:

1. Provision a database (Neon, Supabase, or any hosted Postgres) and copy its
   connection string.
2. In `prisma/schema.prisma`, change the datasource provider from `"sqlite"`
   to `"postgresql"`.
3. Set `DATABASE_URL` to the Postgres connection string, for example
   `postgresql://user:password@host/dbname?sslmode=require`.
4. Run `npm run db:push` (or `npm run db:migrate`) against the new database —
   see the next section.

The schema itself is provider-portable; no model changes are needed for the
switch.

## 4. Migrations

Two paths, depending on how you want to manage schema history:

- **`npm run db:push`** — syncs the schema directly from
  `prisma/schema.prisma` to the database, with no migration files. This is the
  right command for first setup and for single-deployment installs that do
  not need a migration history.
- **`npm run db:migrate`** — runs `prisma migrate dev`. Use this after you
  change `prisma/schema.prisma` during development: it generates a migration
  file under `prisma/migrations/`, applies it, and regenerates the client.
  If you keep migration files, apply them to further environments with
  `npx prisma migrate deploy`.

First setup on a fresh database is normally just:

```
npm run db:push
```

## 5. Seed (optional but recommended)

```
npm run db:seed
```

This rebuilds the synthetic demo workspace — a fictional client
("Northstar Outfitters"), three imports matching the files in `sample-data/`,
four historical scans and a client report. It is safe to run at any time; it
only touches the demo workspace, never your primary workspace.

## 6. Development server

```
npm run dev
```

Opens on http://localhost:3000 (logs are also written to `dev.log`).

## 7. Production build and start

```
npm run build
npm run start
```

`npm run build` produces a Next.js standalone build in `.next/standalone`
(and copies the static assets into it). `npm run start` runs that standalone
server with `NODE_ENV=production` (through Bun, which is what the shipped
script uses; `node .next/standalone/server.js` works equally well if you
prefer plain Node). Put a reverse proxy with TLS in front of it (Caddy,
nginx, Traefik) for a conventional deployment.

## 8. Vercel

LandingSentinel can be deployed to Vercel. Points that matter:

- **Node runtime.** All API routes — including the scanner routes — already
  declare `export const runtime = "nodejs"` in their source. The scanner uses
  Node APIs (DNS resolution, IP classification) that are not available in the
  edge runtime. No route config changes are needed.
- **Function duration limits.** A scan start (`POST /api/scans`) returns
  immediately with a scan id; the destinations are then processed in the
  background while the UI polls `GET /api/scans/[id]`. A full scan covers up
  to `SCAN_MAX_TARGETS` (default 25) destinations with bounded concurrency
  (`SCAN_CONCURRENCY`, default 5) and per-request timeouts of
  `SCAN_TIMEOUT_MS` (default 10 s) — worst case that is roughly a minute of
  background work. Serverless function-duration limits can cut this short on
  slower plans. **Leave the SCAN_* defaults unchanged** unless you have
  measured what your plan allows; if you do raise them, raise the function
  duration for the API routes accordingly. For predictable heavy scanning, a
  persistent Node host (VPS, container platform) is the simpler choice.
- **Build command:** `npm run build`. **Install command:** `npm install`.
- Set the environment variables from CONFIGURATION.md in the Vercel project
  settings (or a committed `.env` — never commit real secrets). Remember that
  `NEXT_PUBLIC_*` values are inlined at build time, so changing them requires
  a redeploy.
- Postgres for the database (see section 3) — the SQLite file would not
  persist on Vercel.

## 9. Custom domain (optional)

Point your domain at the deployment (Vercel assigns domains automatically; on
a VPS, add a DNS record and terminate TLS at your reverse proxy). No
application change is required.

## 10. Post-deployment health checks

1. Visit `/api/system` — it should return a JSON envelope with
   `ok: true` and the runtime configuration.
2. In the app, open **Settings → System → Run system check** — the same
   diagnostics through the UI.
3. Run the command-line check:

   ```
   npm run doctor
   ```

   Expected output:

   ```
   LandingSentinel system check
   ✓ Node version (24.x)
   ✓ Environment file (.env.local)
   ✓ Database connection
   ✓ Database schema
   ✓ Scanner configuration (SCAN_MAX_TARGETS etc. set or defaults)
   System ready.
   ```

   The script exits with code 1 if any check fails, so it can be used in CI
   or post-deploy hooks.
