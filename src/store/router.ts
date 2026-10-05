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
  | { view: "demo"; panel?: "fixed" | "branding" }
  | { view: "scanOne" }
  | { view: "docs" }
  | { view: "license" }
  | { view: "privacy" }
  | { view: "dashboard" }
  | { view: "import"; scope?: "demo" }
  | { view: "scans" }
  | { view: "scan"; scanId: string; scope?: "demo" }
  | { view: "finding"; findingId: string; scope?: "demo" }
  | { view: "reports" }
  | { view: "report"; reportId: string; scope?: "demo" }
  | { view: "clients" }
  | { view: "settings"; tab: "overview" | "branding" | "scanning" | "system" };

export function parseHash(rawHash: string): Route {
  const hash = rawHash.replace(/^#/, "").replace(/^\/+/, "");
  const parts = hash.split("/").filter(Boolean);

  if (parts.length === 0) return { view: "home" };

  switch (parts[0]) {
    case "demo": {
      // Demo-scoped deep links: #/demo/scans/:id, #/demo/findings/:id,
      // #/demo/reports/:id keep the synthetic workspace through navigation —
      // findings and reports opened from the live demo never hit the real
      // workspace's authentication wall.
      const section = parts[1];
      const id = parts[2];
      if (section === "scans" && id) return { view: "scan", scanId: id, scope: "demo" };
      if (section === "findings" && id) return { view: "finding", findingId: id, scope: "demo" };
      if (section === "reports" && id) return { view: "report", reportId: id, scope: "demo" };
      if (section === "fixed") return { view: "demo", panel: "fixed" };
      if (section === "branding") return { view: "demo", panel: "branding" };
      if (section === "import") return { view: "import", scope: "demo" };
      return { view: "demo" };
    }
    case "scan":
    case "scan-one":
    case "checker":
      return { view: "scanOne" };
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
      return route.panel === "fixed" ? "#/demo/fixed" : route.panel === "branding" ? "#/demo/branding" : "#/demo";
    case "scanOne":
      return "#/scan";
    case "docs":
      return "#/docs";
    case "license":
      return "#/license";
    case "privacy":
      return "#/privacy";
    case "dashboard":
      return "#/app";
    case "import":
      return route.scope === "demo" ? "#/demo/import" : "#/app/import";
    case "scans":
      return "#/app/scans";
    case "scan":
      return route.scope === "demo" ? `#/demo/scans/${route.scanId}` : `#/app/scans/${route.scanId}`;
    case "finding":
      return route.scope === "demo" ? `#/demo/findings/${route.findingId}` : `#/app/findings/${route.findingId}`;
    case "reports":
      return "#/app/reports";
    case "report":
      return route.scope === "demo" ? `#/demo/reports/${route.reportId}` : `#/app/reports/${route.reportId}`;
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

/** Returns the scope used by app views: the demo route and demo-scoped
 * deep links (opened from the live demo) use the demo workspace. */
export function scopeForRoute(route: Route): "demo" | "app" {
  if (route.view === "demo") return "demo";
  if (route.view === "import" && route.scope === "demo") return "demo";
  if (
    (route.view === "scan" || route.view === "finding" || route.view === "report") &&
    route.scope === "demo"
  ) {
    return "demo";
  }
  return "app";
}
