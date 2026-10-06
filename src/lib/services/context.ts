/**
 * Workspace context resolution + white-label branding.
 *
 * Workspaces:
 * - "demo"           — the shared synthetic demo workspace (used only by
 *                      DEMO_MODE app scope, i.e. a single-operator local demo).
 * - "demo:s:{sid}"   — per-session demo workspaces for the PUBLIC demo
 *                      scope: every browser session gets its own synthetic
 *                      workspace seeded with the import dataset, so one
 *                      anonymous visitor can never affect another. Stale
 *                      session workspaces are cleaned up opportunistically.
 * - "primary"        — the buyer's real workspace.
 *
 * Scope rules:
 * - Requests with scope=demo always use the caller's session demo workspace
 *   and the fixture scanner (never real URL fetching).
 * - Requests with scope=app use DEMO_MODE to decide: the shared demo
 *   workspace with fixtures, or the primary workspace with the real scanner.
 *
 * Branding precedence (documented in BRANDING.md):
 *   database branding fields (when non-empty) → NEXT_PUBLIC_* env → defaults.
 */

import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { PRODUCT } from "@/config/product";
import { seedDemoSessionWorkspace } from "@/lib/services/demo-seed";
import { DEMO_SESSION_COOKIE, isValidDemoSessionId } from "@/lib/demo-session";

export type Scope = "demo" | "app";
const DEMO_SESSION_PREFIX = "demo:s:";
const DEMO_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export type WorkspaceContext = {
  scope: Scope;
  workspaceId: string;
  workspaceSlug: "demo" | "primary" | "demo-session";
  /** "demo-fixture" or "real" — which scan engine serves this scope. */
  scanEngine: "demo-fixture" | "real";
};

async function ensureDemoSessionWorkspace(sessionId: string) {
  const slug = `${DEMO_SESSION_PREFIX}${sessionId}`;
  const existing = await db.workspace.findUnique({ where: { slug } });
  if (existing) {
    scheduleStaleDemoCleanup();
    return existing;
  }

  // Create + seed inside ONE transaction. The workspace row only becomes
  // visible when the whole synthetic dataset is committed, and the unique
  // slug index serialises parallel first-visit requests (dashboard, scans
  // and branding all firing together): losers block on the insert until the
  // winner commits, fail with a unique violation, and re-read a fully
  // seeded workspace — nobody ever observes a half-seeded demo.
  try {
    const workspace = await db.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: { slug, name: "Demo Session (Synthetic)" },
      });
      await seedDemoSessionWorkspace(workspace.id, tx);
      return workspace;
    });
    scheduleStaleDemoCleanup();
    return workspace;
  } catch {
    // Lost the race (same instance or serverless multi-instance): the
    // winner's transaction has committed by now.
    return db.workspace.findUniqueOrThrow({ where: { slug } });
  }
}

/* ---------------------------------------------------------------- */
/* Stale demo-session cleanup                                        */
/* ---------------------------------------------------------------- */

/**
 * Durable cleanup of anonymous demo workspaces.
 *
 * Demo session workspaces (`demo:s:{uuid}`) are per-visitor synthetic
 * sandboxes. They must not accumulate forever: whenever one is accessed or
 * created, this opportunistically deletes demo-session workspaces whose
 * database `createdAt` is older than the TTL (24h), using database
 * timestamps — never the client clock.
 *
 * Safety: the `slug startsWith "demo:s:"` predicate can never match the
 * buyer's real workspaces (`primary` or any custom slug); deleteMany is
 * atomic; failures are swallowed (cleanup is best-effort and will retry on
 * the next access); and an in-memory throttle keeps it to at most one sweep
 * per process per hour instead of a delete on every request. On serverless
 * multi-instance deployments each instance sweeps independently.
 */
const DEMO_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
let lastCleanupAt = 0;

function scheduleStaleDemoCleanup(): void {
  const now = Date.now();
  if (now - lastCleanupAt < DEMO_CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;

  const cutoff = new Date(now - DEMO_SESSION_TTL_MS);
  void db.workspace
    .deleteMany({
      where: {
        slug: { startsWith: DEMO_SESSION_PREFIX },
        createdAt: { lt: cutoff },
      },
    })
    .catch(() => {
      // Best-effort: never let cleanup break a demo request. The throttle
      // timestamp is reset so a transient failure retries within the hour.
    });
}

export async function resolveContext(scope: Scope): Promise<WorkspaceContext> {
  // Public demo scope: the caller's own session workspace. The session id
  // comes from the ls_demo_sid cookie assigned by middleware, so every
  // anonymous visitor's demo state is isolated.
  if (scope === "demo") {
    const sid = (await cookies()).get(DEMO_SESSION_COOKIE)?.value;
    if (isValidDemoSessionId(sid)) {
      const workspace = await ensureDemoSessionWorkspace(sid);
      return {
        scope,
        workspaceId: workspace.id,
        workspaceSlug: "demo-session",
        scanEngine: PRODUCT.publicScannerEnabled ? "real" : "demo-fixture",
      };
    }
    // No session cookie (middleware bypassed / non-browser caller): the
    // legacy shared demo workspace keeps the demo functional.
  }

  const slug: "demo" | "primary" =
    scope === "demo" ? "demo" : PRODUCT.demoMode ? "demo" : "primary";

  let workspace = await db.workspace.findUnique({ where: { slug } });
  if (!workspace) {
    workspace = await db.workspace.create({
      data: {
        slug,
        name: slug === "demo" ? "Demo Workspace (Synthetic)" : "Primary Workspace",
      },
    });
    if (slug === "demo") {
      // Demo workspace gets the synthetic client immediately.
      await db.client.create({
        data: { workspaceId: workspace.id, name: "Northstar Outfitters — Synthetic Demo" },
      });
    }
  }

  // Demo scope always uses fixtures. App scope uses the real engine unless
  // the deployment runs in demo mode. Real URL scanning for the PUBLIC demo
  // scope is gated behind PUBLIC_SCANNER_ENABLED (default: false).
  const scanEngine: "demo-fixture" | "real" =
    scope === "demo" ? (PRODUCT.publicScannerEnabled ? "real" : "demo-fixture") : PRODUCT.demoMode ? "demo-fixture" : "real";

  return { scope, workspaceId: workspace.id, workspaceSlug: slug, scanEngine };
}

/* ---------------------------------------------------------------- */

export type Branding = {
  productName: string;
  agencyName: string;
  logoUrl: string | null;
  accentColor: string;
  supportEmail: string | null;
  website: string | null;
  reportFooter: string | null;
  reportContactName: string | null;
};

const DEFAULT_BRANDING: Branding = {
  productName: PRODUCT.name,
  agencyName: "",
  logoUrl: null,
  accentColor: "#A7372D",
  supportEmail: PRODUCT.supportEmail || null,
  website: null,
  reportFooter: null,
  reportContactName: null,
};

/** Resolve effective branding for a workspace (DB → env → defaults). */
export async function resolveBranding(workspaceId: string): Promise<Branding> {
  const row = await db.branding.findUnique({ where: { workspaceId } });

  const envAgency = process.env.NEXT_PUBLIC_AGENCY_NAME || "";
  const envAccent = process.env.NEXT_PUBLIC_ACCENT_COLOR || "";
  const envSupport = PRODUCT.supportEmail;

  const merged: Branding = {
    productName: row?.productName?.trim() || DEFAULT_BRANDING.productName,
    agencyName: row?.agencyName?.trim() || envAgency.trim() || DEFAULT_BRANDING.agencyName,
    logoUrl: row?.logoUrl?.trim() || null,
    accentColor: row?.accentColor?.trim() || envAccent.trim() || DEFAULT_BRANDING.accentColor,
    supportEmail: row?.supportEmail?.trim() || envSupport || null,
    website: row?.website?.trim() || null,
    reportFooter: row?.reportFooter?.trim() || null,
    reportContactName: row?.reportContactName?.trim() || null,
  };
  return merged;
}

/** Ensure a branding row exists (used by the settings UI). */
export async function ensureBrandingRow(workspaceId: string) {
  const existing = await db.branding.findUnique({ where: { workspaceId } });
  if (existing) return existing;
  return db.branding.create({ data: { workspaceId } });
}
