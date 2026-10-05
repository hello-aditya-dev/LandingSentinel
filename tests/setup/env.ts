/**
 * Test environment.
 *
 * Loads the developer's env files (Next.js precedence) and then applies
 * deterministic overrides for the test process. Applied before any product
 * module is imported, so module-level config (PRODUCT) sees these values.
 */

import { loadEnvFiles } from "@/lib/env-load";

loadEnvFiles();

// Deterministic test configuration — mirrors buyer defaults where possible.
process.env.DEMO_MODE = "false";
process.env.PUBLIC_SCANNER_ENABLED = "false";
// Strict SSRF defaults for the unit suites. The scanner integration suite
// enables the loopback test flag explicitly (and restores it afterwards).
delete process.env.SCANNER_ALLOW_LOOPBACK_TARGETS;
// Faster timeouts so the slow-endpoint integration case times out quickly
// (the fixture sleeps 6s; the 2.5s timeout exercises the timeout + retry
// path deterministically regardless of the developer's .env values).
process.env.SCAN_TIMEOUT_MS = "2500";
