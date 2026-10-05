#!/usr/bin/env node
/**
 * LandingSentinel system check (`npm run doctor`).
 *
 * Plain Node script — no dependencies beyond @prisma/client (already
 * installed). Verifies that the deployment can run: Node version,
 * environment file, database connection, database schema and scanner
 * configuration. Exits with code 1 when any check fails.
 *
 * See DEPLOYMENT.md → "Post-deployment health checks".
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

/* -------------------------------------------------------------- */
/* Tiny .env parser (no dotenv dependency).                        */
/* Same precedence order as Next.js:                               */
/*   process environment → .env.local → .env                       */
/* -------------------------------------------------------------- */

function parseEnvFile(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const withoutExport = line.startsWith("export ") ? line.slice(7) : line;
    const eq = withoutExport.indexOf("=");
    if (eq === -1) continue;
    const key = withoutExport.slice(0, eq).trim();
    let value = withoutExport.slice(eq + 1).trim();
    // Strip matching surrounding quotes (single or double).
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function loadEnv(root) {
  const candidates = [".env.local", ".env"];
  const found = [];
  const merged = {};
  // Load in reverse precedence so later files overwrite earlier ones.
  for (const name of [...candidates].reverse()) {
    const path = join(root, name);
    if (!existsSync(path)) continue;
    found.push(name);
    Object.assign(merged, parseEnvFile(readFileSync(path, "utf8")));
  }
  // Values already present in the real environment win over files.
  for (const [key, value] of Object.entries(merged)) {
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = value;
    }
  }
  return { found };
}

/* -------------------------------------------------------------- */
/* Checks                                                          */
/* -------------------------------------------------------------- */

const results = []; // { ok, label, detail }

function check(ok, label, detail) {
  results.push({ ok, label, detail });
  const mark = ok ? "✓" : "✗";
  const suffix = detail ? ` — ${detail}` : "";
  console.log(`${mark} ${label}${suffix}`);
}

const root = process.cwd();

console.log("LandingSentinel system check");

// 1. Node version (>= 20).
const [major] = process.versions.node.split(".").map(Number);
check(
  major >= 20,
  `Node version (${major}.x)`,
  major >= 20 ? undefined : "LandingSentinel requires Node 20 or newer."
);

// 2. Environment file.
const { found } = loadEnv(root);
const envFileLabel = found.length > 0 ? found.join(", ") : null;
if (envFileLabel) {
  check(true, `Environment file (${envFileLabel})`);
} else if (process.env.DATABASE_URL) {
  check(true, "Environment file (none — DATABASE_URL set in process environment)");
} else {
  check(false, "Environment file", "No .env or .env.local found. Copy .env.example to .env.local first.");
}

// 3. DATABASE_URL.
const databaseUrl = process.env.DATABASE_URL;
check(
  Boolean(databaseUrl),
  "DATABASE_URL",
  databaseUrl ? undefined : "DATABASE_URL is not set. It is required for the Prisma client."
);

// 4. Database connection (only meaningful with a DATABASE_URL).
let prisma = null;
if (databaseUrl) {
  prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    check(true, "Database connection");
  } catch (err) {
    check(false, "Database connection", String(err?.message ?? err).split("\n")[0]);
    await prisma.$disconnect().catch(() => {});
    prisma = null;
  }
} else {
  check(false, "Database connection", "Skipped: DATABASE_URL is not set.");
}

// 5. Database schema — core tables queryable, with row counts.
if (prisma) {
  try {
    const [workspaces, scans, findings] = await Promise.all([
      prisma.workspace.count(),
      prisma.scan.count(),
      prisma.finding.count(),
    ]);
    check(
      true,
      "Database schema",
      `Workspace ${workspaces} · Scan ${scans} · Finding ${findings}`
    );
  } catch (err) {
    check(
      false,
      "Database schema",
      `${String(err?.message ?? err).split("\n")[0]} — run \`npm run db:push\` (first setup) or \`npm run db:migrate\`.`
    );
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
} else {
  check(false, "Database schema", "Skipped: no database connection.");
}

// 6. Scanner configuration — every SCAN_* value must be unset (default)
//    or a positive integer.
const SCAN_VARS = [
  "SCAN_MAX_TARGETS",
  "SCAN_CONCURRENCY",
  "SCAN_TIMEOUT_MS",
  "SCAN_MAX_REDIRECTS",
  "SCAN_MAX_BODY_BYTES",
  "SCAN_SLOW_RESPONSE_MS",
];
const bad = [];
let setCount = 0;
for (const name of SCAN_VARS) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") continue;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) bad.push(name);
  else setCount += 1;
}
check(
  bad.length === 0,
  "Scanner configuration (SCAN_MAX_TARGETS etc. set or defaults)",
  bad.length > 0
    ? `Not a positive integer: ${bad.join(", ")}`
    : `${setCount} of ${SCAN_VARS.length} set, ${SCAN_VARS.length - setCount} at defaults`
);

/* -------------------------------------------------------------- */
/* Summary                                                         */
/* -------------------------------------------------------------- */

const failed = results.filter((r) => !r.ok);
if (failed.length === 0) {
  console.log("System ready.");
  process.exit(0);
} else {
  console.log(`System not ready — ${failed.length} check${failed.length === 1 ? "" : "s"} failed. See DEPLOYMENT.md.`);
  process.exit(1);
}
