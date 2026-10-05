/**
 * CLI entry: npm run db:seed
 * Seeds the synthetic demo workspace (see src/lib/services/demo-seed.ts).
 *
 * Works under both `npm run db:seed` (tsx) and `bun run db:seed` — the env
 * loader mirrors what Next.js would load (.env.local then .env).
 */
import "@/lib/env-load";
import { seedDemoWorkspace } from "@/lib/services/demo-seed";
import { db } from "@/lib/db";

seedDemoWorkspace()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (err) => {
    console.error("Seed failed:", err);
    await db.$disconnect();
    process.exit(1);
  });
