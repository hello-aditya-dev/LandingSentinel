#!/usr/bin/env node
/**
 * LandingSentinel — Prisma CLI wrapper.
 *
 * The Prisma CLI only reads `.env`, but LandingSentinel documents the
 * Next.js convention (`.env.local` for local configuration). This wrapper
 * loads `.env.local` then `.env` (Next.js precedence, real environment
 * variables always win) before handing over to the Prisma CLI, so
 * `npm run db:migrate` / `db:push` / `db:reset` work with either file.
 *
 * Usage: node scripts/prisma.mjs <prisma command> [args…]
 *   e.g. node scripts/prisma.mjs migrate deploy
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseEnvFile(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    if (key !== "") out[key] = value;
  }
  return out;
}

for (const file of [".env.local", ".env"]) {
  const path = resolve(process.cwd(), file);
  if (!existsFile(path)) continue;
  for (const [key, value] of Object.entries(parseEnvFile(readFile(path)))) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function existsFile(path) {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}

function readFile(path) {
  return readFileSync(path, "utf8");
}

// Run the Prisma CLI entry directly with node (cross-platform: no .bin shim).
const prismaEntry = resolve(process.cwd(), "node_modules/prisma/build/index.js");
const args = process.argv.slice(2);
const result = spawnSync(process.execPath, [prismaEntry, ...args], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
