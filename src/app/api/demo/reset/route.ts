import { cookies } from "next/headers";
import { ok, route } from "@/lib/api/envelope";
import { db } from "@/lib/db";
import { DEMO_SESSION_COOKIE, isValidDemoSessionId } from "@/lib/demo-session";
import { seedDemoSessionWorkspace } from "@/lib/services/demo-seed";

export const runtime = "nodejs";

/**
 * Reset the caller's synthetic demo session to its initial state:
 * the import dataset, unscanned. Only ever touches the caller's own
 * demo:s:{session} workspace — never the primary workspace, never
 * another visitor's session.
 */
export const POST = route(async () => {
  const sid = (await cookies()).get(DEMO_SESSION_COOKIE)?.value;
  if (!isValidDemoSessionId(sid)) {
    return ok({ reset: true, note: "No demo session cookie — nothing to reset." });
  }
  const slug = `demo:s:${sid}`;
  // Cascade deletes every demo row for this session, then re-seed the
  // initial import dataset (no scans — the next preflight is the
  // visitor's own).
  await db.workspace.deleteMany({ where: { slug } });
  const workspace = await db.workspace.create({
    data: { slug, name: "Demo Session (Synthetic)" },
  });
  await seedDemoSessionWorkspace(workspace.id);
  return ok({ reset: true });
});
