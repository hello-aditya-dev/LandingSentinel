/**
 * Environment file loading for standalone scripts and tests.
 *
 * Next.js automatically loads `.env.local` and `.env` for the app, but plain
 * Node processes (seed script, test runner, migration helpers) do not. This
 * loader mirrors the Next.js precedence for those entry points:
 *
 *   process environment  →  .env.local  →  .env
 *
 * Only variables that are not already set are injected — real environment
 * variables always win, which keeps container/CI deployments in control.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_FILES = [".env.local", ".env"] as const;

function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip surrounding quotes (single or double) when they wrap the value.
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

/** Load `.env.local` then `.env` (in that order) without overriding real env. */
export function loadEnvFiles(cwd = process.cwd()): void {
  for (const file of ENV_FILES) {
    const path = resolve(cwd, file);
    if (!existsSync(path)) continue;
    let parsed: Record<string, string>;
    try {
      parsed = parseEnvFile(readFileSync(path, "utf8"));
    } catch {
      continue;
    }
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}
