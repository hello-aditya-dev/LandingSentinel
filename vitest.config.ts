import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Forks pool, one worker, no file parallelism: every file runs in a fresh
    // child process in deterministic order — env changes and module-level
    // config can never leak between suites.
    pool: "forks",
    maxWorkers: 1,
    fileParallelism: false,
    setupFiles: ["tests/setup/env.ts"],
    testTimeout: 120_000,
    hookTimeout: 240_000,
    reporters: ["default"],
  },
});
