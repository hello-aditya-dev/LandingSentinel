# LandingSentinel Quick Start

From download to a signed-in workspace in eight steps. No architecture
reading required — every command here is the verified buyer path. If
something misbehaves, see TROUBLESHOOTING.md; for the full story on any
step, see DEPLOYMENT.md.

## Requirements

- Node.js 20.9 or newer (Node 24 recommended) — the minimum Next.js 16
  declares for itself, and what `npm install` checks against.
- PostgreSQL 13 or newer — hosted (Neon, Supabase, Amazon RDS) or
  self-hosted. PostgreSQL is the canonical database; SQLite is not
  supported in the commercial package.
- npm 10 or newer (`package-lock.json` is committed, so `npm install` is
  the supported, reproducible path).
- Hosting: any Node host works; Vercel is the recommended and best-tested
  target (Step 8).

## Step 1 — Install

```
npm install
```

This also runs `prisma generate` (via `postinstall`), which produces the
database client.

## Step 2 — Environment

```
cp .env.example .env.local
```

Then edit `.env.local` and set the two required variables:

- `DATABASE_URL` — your PostgreSQL connection string
  (`postgresql://user:password@host:5432/landingsentinel`).
- `ADMIN_PASSWORD_HASH` — the administrator password hash you generate in
  Step 3.

That is all the quick start needs. Every optional variable (access mode,
scanner limits, white-label branding, marketing links) is documented in
CONFIGURATION.md. Never paste secret values into files that get committed
or shared — `.env.local` is git-ignored for that reason.

## Step 3 — Create the admin password

```
npm run hash-password
```

The script prompts for a password (minimum 10 characters), asks you to
confirm it, and prints an `ADMIN_PASSWORD_HASH=…` line. It also accepts the
password as an argument — `npm run hash-password -- "my passphrase"` (quote
it) — but prefer the interactive prompt when others can see your screen or
shell history. Copy the whole printed line into `.env.local` (or your
host's dashboard).

The output format is `scrypt:N:r:p:<salt hex>:<hash hex>` — exactly what
the authentication code expects. The plaintext password is never stored or
logged.

## Step 4 — Database

```
npm run db:migrate
```

Applies the committed Prisma migrations to your database — additive and
idempotent; it only applies what is missing and never resets data.

```
npm run db:seed
```

Optional but recommended: rebuilds the synthetic demo workspace — a
fictional client ("Northstar Outfitters"), three imports matching the files
in `sample-data/`, four historical scans and a client report. It only ever
touches the demo workspace, never your real one.

## Step 5 — Verify

```
npm run qa
npm run build
```

`qa` runs lint + typecheck + the full test suite. The scanner integration
suite provisions its own `<database>_test` database on the same PostgreSQL
server automatically — your data database is never touched. `build` is the
production build; it fails on TypeScript errors, so both passing means the
package is intact.

## Step 6 — Start

```
npm run start
```

The app serves on http://localhost:3000. (For day-to-day development use
`npm run dev` instead; `start` runs the production build.)

## Step 7 — Login

Open http://localhost:3000/login and sign in with the password you chose
in Step 3. Your workspace — imports, scans, findings, reports — is at
http://localhost:3000/app. The synthetic demo workspace stays public; only
the real workspace asks for the password.

## Step 8 — Deploy to Vercel

The minimal path (full instructions, including platform-level rate
limiting, are in DEPLOYMENT.md):

1. Import your Git repository in Vercel (install `npm install`, build
   `npm run build` — the defaults work).
2. In Project → Settings → Environment Variables, add the same two
   variables: `DATABASE_URL` and `ADMIN_PASSWORD_HASH` (Production).
3. Create a PostgreSQL database (Neon or Supabase are the common pairings)
   and use its connection string as `DATABASE_URL`.
4. Apply the migrations once, from any machine with network access to that
   database: `DATABASE_URL="postgres://…" npm run db:migrate`.
5. Redeploy so the functions start with the new environment, then check
   `GET /api/system`.

## Final check

Verify the deployment's configuration through the built-in diagnostics:
open **/app/settings/system** in the app (Settings → System → Run system
check) or fetch **/api/system** directly. You want `Database: ok`,
`Database schema: ok` and `Access control: ok` — anything else names the
exact step that fixes it (see TROUBLESHOOTING.md).
