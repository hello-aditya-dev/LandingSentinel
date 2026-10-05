import { ok, route } from "@/lib/api/envelope";
import { seedDemoWorkspace } from "@/lib/services/demo-seed";

export const runtime = "nodejs";

/**
 * Reset the synthetic demo to its deterministic initial state.
 * Only ever touches the demo workspace — never the primary workspace.
 */
export const POST = route(async () => {
  await seedDemoWorkspace();
  return ok({ reset: true });
});
