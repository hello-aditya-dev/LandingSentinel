/**
 * CLI entry: bun run db:seed
 * Seeds the synthetic demo workspace (see src/lib/services/demo-seed.ts).
 */
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
