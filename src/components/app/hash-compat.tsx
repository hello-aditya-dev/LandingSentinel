"use client";

/**
 * Legacy hash-URL forwarder.
 *
 * Older links point at `/#/demo`, `/#/scan`, `/#/app/…` from the single-page
 * era. On load, any such hash is translated to its real route with one
 * replace — old links keep working, and no second routing system exists.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { parseHash, routeToPath } from "@/lib/nav";

export function HashCompat() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith("#/")) return;
    const path = routeToPath(parseHash(hash));
    if (path !== "/") {
      router.replace(path);
    }
    // A bare "#/" on the homepage is already the right place.
  }, [router]);

  return null;
}
