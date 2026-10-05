/**
 * Workspace context resolution + white-label branding.
 *
 * Two workspaces exist:
 * - "demo"    — the seeded synthetic sales demo (Northstar Outfitters).
 * - "primary" — the buyer's real workspace.
 *
 * Scope rules:
 * - Requests with scope=demo always use the demo workspace and the fixture
 *   scanner (never real URL fetching).
 * - Requests with scope=app use DEMO_MODE to decide: demo workspace with
 *   fixtures, or the primary workspace with the real scanner.
 *
 * Branding precedence (documented in BRANDING.md):
 *   database branding fields (when non-empty) → NEXT_PUBLIC_* env → defaults.
 */

import { db } from "@/lib/db";
import { PRODUCT } from "@/config/product";

export type Scope = "demo" | "app";

export type WorkspaceContext = {
  scope: Scope;
  workspaceId: string;
  workspaceSlug: "demo" | "primary";
  /** "demo-fixture" or "real" — which scan engine serves this scope. */
  scanEngine: "demo-fixture" | "real";
};

export async function resolveContext(scope: Scope): Promise<WorkspaceContext> {
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
