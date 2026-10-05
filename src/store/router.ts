"use client";

/**
 * Hash-based view router.
 *
 * The deployable product ships as a single public route ("/") with in-app
 * navigation via the URL hash, so every product area is reachable without
 * additional server routes. Route names mirror the information architecture.
 */

import { create } from "zustand";

export type Route =
  | { view: "home" }
  | { view: "demo" }
  | { view: "docs" }
  | { view: "license" }
  | { view: "privacy" }
  | { view: "dashboard" }
  | { view: "import" }
  | { view: "scans" }
  | { view: "scan"; scanId: string }
  | { view: "finding"; findingId: string }
  | { view: "reports" }
  | { view: "report"; reportId: string }
  | { view: "clients" }
  | { view: "settings"; tab: "overview" | "branding" | "scanning" | "system" };

export function parseHash(rawHash: string): Route {
  const hash = rawHash.replace(/^#/, "").replace(/^\/+/, "");
  const parts = hash.split("/").filter(Boolean);

  if (parts.length === 0) return { view: "home" };

  switch (parts[0]) {
    case "demo":
      return { view: "demo" };
    case "docs":
      return { view: "docs" };
    case "license":
      return { view: "license" };
    case "privacy":
      return { view: "privacy" };
    case "app": {
      const section = parts[1] ?? "dashboard";
      switch (section) {
        case "import":
          return { view: "import" };
        case "scans":
          if (parts[2]) return { view: "scan", scanId: parts[2] };
          return { view: "scans" };
        case "findings":
          if (parts[2]) return { view: "finding", findingId: parts[2] };
          return { view: "scans" };
        case "reports":
          if (parts[2]) return { view: "report", reportId: parts[2] };
          return { view: "reports" };
        case "clients":
          return { view: "clients" };
        case "settings": {
          const tab = parts[2];
          if (tab === "branding" || tab === "scanning" || tab === "system") {
            return { view: "settings", tab };
          }
          return { view: "settings", tab: "overview" };
        }
        default:
          return { view: "dashboard" };
      }
    }
    default:
      return { view: "home" };
  }
}

export function routeToHash(route: Route): string {
  switch (route.view) {
    case "home":
      return "#/";
    case "demo":
      return "#/demo";
    case "docs":
      return "#/docs";
    case "license":
      return "#/license";
    case "privacy":
      return "#/privacy";
    case "dashboard":
      return "#/app";
    case "import":
      return "#/app/import";
    case "scans":
      return "#/app/scans";
    case "scan":
      return `#/app/scans/${route.scanId}`;
    case "finding":
      return `#/app/findings/${route.findingId}`;
    case "reports":
      return "#/app/reports";
    case "report":
      return `#/app/reports/${route.reportId}`;
    case "clients":
      return "#/app/clients";
    case "settings":
      return `#/app/settings/${route.tab === "overview" ? "" : route.tab}`;
  }
}

type RouterState = {
  route: Route;
  navigate: (route: Route) => void;
  syncFromLocation: () => void;
};

export const useRouter = create<RouterState>((set) => ({
  route: { view: "home" },
  navigate: (route) => {
    const hash = routeToHash(route);
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    } else {
      set({ route });
    }
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  },
  syncFromLocation: () => {
    set({ route: parseHash(window.location.hash) });
  },
}));

/** Returns the scope used by app views: the demo route uses demo scope. */
export function scopeForRoute(route: Route): "demo" | "app" {
  return route.view === "demo" ? "demo" : "app";
}
