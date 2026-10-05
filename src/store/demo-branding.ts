"use client";

/**
 * Browser-local branding override for the public demo report.
 *
 * The white-label playground edits this store instead of saving to a
 * server: demo branding changes stay in the visitor's browser, are never
 * persisted, and disappear on reload — exactly what the demo copy
 * promises. The demo-scoped report view merges the override over the
 * report's branding snapshot.
 */

import { create } from "zustand";

export type DemoBrandingOverride = {
  agencyName: string;
  productName: string;
  accentColor: string;
  reportFooter: string;
};

type DemoBrandingState = {
  override: DemoBrandingOverride | null;
  setOverride: (override: DemoBrandingOverride) => void;
  clearOverride: () => void;
};

export const useDemoBranding = create<DemoBrandingState>((set) => ({
  override: null,
  setOverride: (override) => set({ override }),
  clearOverride: () => set({ override: null }),
}));
