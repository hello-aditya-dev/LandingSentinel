#!/usr/bin/env node
/**
 * LandingSentinel — administrator password hashing utility.
 *
 * Usage:
 *   npm run hash-password                    # interactive prompt
 *   npm run hash-password -- "my passphrase"  # argument (quote it!)
 *
 * Prints an ADMIN_PASSWORD_HASH value for .env.local / your host's
 * environment variables. Format: scrypt:N:r:p:<salt hex>:<hash hex>
 * (scrypt, 64-byte key; colon-separated on purpose — "$" separators would
 * be expanded away by dotenv-based env loaders). The plaintext password is
 * never stored or logged.
 */
import { randomBytes, scryptSync } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const N = 16384,
  r = 8,
  p = 1,
  keylen = 64;

async function readPassword() {
  const arg = process.argv[2];
  if (arg !== undefined) return arg;

  const rl = createInterface({ input: stdin, output: stdout });
  // Note: input is echoed in the terminal. For shell history hygiene prefer
  // the interactive prompt (no argv) when others can see your screen.
  const answer = await rl.question("Administrator password (min 10 characters): ");
  const confirm = await rl.question("Confirm password: ");
  rl.close();
  if (answer !== confirm) {
    console.error("Passwords do not match.");
    process.exit(1);
  }
  return answer;
}

const password = await readPassword();

if (typeof password !== "string" || password.length < 10) {
  console.error("The password must be at least 10 characters long.");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = scryptSync(password, salt, keylen, { N, r, p });

console.log("");
console.log("Add this to your environment (e.g. .env.local or your host's dashboard):");
console.log("");
// Colon-separated on purpose: "$" separators would be expanded away by
// dotenv-based env loaders (Next.js, Vercel, Docker Compose).
console.log(`ADMIN_PASSWORD_HASH=scrypt:${N}:${r}:${p}:${salt.toString("hex")}:${hash.toString("hex")}`);
console.log("");
console.log("Then restart the server. APP_ACCESS_MODE=auth (default) will require this");
console.log("password for every route that touches real campaign data.");
