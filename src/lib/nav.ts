"use client";

/**
 * Typed navigation over the Next.js App Router.
 *
 * The product uses real routes (`/demo`, `/scan`, `/app/scans/…`): every
 * product area is a server-rendered App Router page. This module keeps the
 * typed view-descriptor API the components already speak (view + params) and
 * translates it to real URLs through `next/navigation` — there is no
 * client-side hash router anywhere in the product.
 *
 * `parseHash` is retained ONLY as a legacy-link forwarder: old `/#/demo`
 * bookmarks are translated to `/demo` once on load (see hash-compat.tsx).
 */

import { useRouter } from "next/navigation";

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

/** Translate a typed route descriptor into its real URL. */
export function routeToPath(route: Route): string {
  switch (route.view) {
    case "home":
      return "/";
    case "demo":
      return route.panel === "fixed" ? "/demo/fixed" : route.panel === "branding" ? "/demo/branding" : "/demo";
    case "scanOne":
      return "/scan";
    case "docs":
      return "/docs";
    case "license":
      return "/license";
    case "privacy":
      return "/privacy";
    case "dashboard":
      return "/app";
    case "import":
      return route.scope === "demo" ? "/demo/import" : "/app/import";
    case "scans":
      return "/app/scans";
    case "scan":
      return route.scope === "demo" ? `/demo/scans/${route.scanId}` : `/app/scans/${route.scanId}`;
    case "finding":
      return route.scope === "demo" ? `/demo/findings/${route.findingId}` : `/app/findings/${route.findingId}`;
    case "reports":
      return "/app/reports";
    case "report":
      return route.scope === "demo" ? `/demo/reports/${route.reportId}` : `/app/reports/${route.reportId}`;
    case "clients":
      return "/app/clients";
    case "settings":
      return route.tab === "overview" ? "/app/settings" : `/app/settings/${route.tab}`;
  }
}

/**
 * Parse a legacy hash URL (`/#/demo`, `/#/app/scans/abc`, …) into a typed
 * route. Used exclusively by the one-time legacy forwarder — new code must
 * navigate with real paths.
 */
export function parseHash(rawHash: string): Route {
  const hash = rawHash.replace(/^#/, "").replace(/^\/+/, "");
  const parts = hash.split("/").filter(Boolean);

  if (parts.length === 0) return { view: "home" };

  switch (parts[0]) {
    case "demo": {
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
          if (parts[2]) {
            if (parts[3] === "findings" && parts[4]) return { view: "finding", findingId: parts[4] };
            return { view: "scan", scanId: parts[2] };
          }
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

/**
 * The navigation hook the product views use. Pushes a real URL through the
 * Next.js router (history API — back/forward/reload all work natively).
 */
export function useAppNavigate(): (route: Route) => void {
  const router = useRouter();
  return (route: Route) => {
    router.push(routeToPath(route));
  };
}
