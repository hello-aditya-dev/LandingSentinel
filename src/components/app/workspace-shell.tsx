"use client";

/**
 * Workspace shell: the product chrome (header, side navigation, footer) that
 * wraps every authenticated `/app/*` route and the demo-scoped detail routes
 * (`/demo/scans/…`, `/demo/findings/…`, `/demo/reports/…`, `/demo/import`).
 *
 * Replaces the former in-page AppFrame: the shell mounts once per route
 * layout and stays mounted across same-scope navigations, so branding and
 * session state do not refetch on every view change.
 *
 * Access control: when the deployment requires administrator sign-in, an
 * unauthenticated visit to a real-workspace route redirects to `/login`
 * (carrying the originally requested path) instead of rendering protected
 * views. The demo scope stays public — synthetic data only.
 */

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "./app-shell";
import { useBranding, useDashboard, useSession, useLogout } from "@/lib/client/queries";
import { LoginView } from "./login-view";
import { ApiClientError } from "@/lib/client/api";
import { FileUp, Radar, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppNavigate } from "@/lib/nav";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, MarginNote } from "@/components/paper/paper";

export function WorkspaceShell({
  scope,
  children,
}: {
  scope: "demo" | "app";
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const navigate = useAppNavigate();

  const { data: brandingData } = useBranding(scope);
  const { data: dashboard } = useDashboard(scope);
  const { data: session, isLoading: sessionLoading, isError: sessionError, error: sessionErrorObj } = useSession(scope);
  const logout = useLogout(scope);

  // Session expiry mid-view: any API call that returns AUTH_REQUIRED fires
  // this event (see lib/client/api.ts). Drop every cached protected query —
  // no stale protected information stays in memory — then redirect to the
  // sign-in route, carrying the current path so signing in returns here.
  useEffect(() => {
    const onAuthRequired = () => {
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "session" });
      queryClient.invalidateQueries({ queryKey: ["session"] });
    };
    window.addEventListener("landingsentinel:auth-required", onAuthRequired);
    return () => window.removeEventListener("landingsentinel:auth-required", onAuthRequired);
  }, [queryClient]);

  const branding = brandingData?.branding;
  const demo = dashboard?.scanEngine === "demo-fixture";
  const productName = branding?.productName ?? "LandingSentinel";

  // Access control: real-workspace views require an admin session when the
  // deployment runs APP_ACCESS_MODE=auth (default). The demo scope is public.
  const needsSignIn = Boolean(session?.authRequired && !session.authenticated);

  useEffect(() => {
    if (needsSignIn && pathname) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [needsSignIn, pathname, router]);

  return (
    <AppShell
      clientName={dashboard?.client?.name ?? null}
      lastScanAt={dashboard?.latestScan?.completedAt ?? null}
      demo={demo}
      productName={productName}
      headerActions={
        <div className="flex items-center gap-2">
          {session?.authRequired && session.authenticated ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              className="hidden gap-2 sm:inline-flex"
              title="End the administrator session"
            >
              <LogOut size={14} aria-hidden="true" /> {logout.isPending ? "Signing out…" : "Sign out"}
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => navigate({ view: "import" })} className="hidden gap-2 sm:inline-flex">
            <FileUp size={14} aria-hidden="true" /> Import
          </Button>
          <Button size="sm" onClick={() => navigate({ view: "dashboard" })} className="gap-2">
            <Radar size={14} aria-hidden="true" /> Run scan
          </Button>
        </div>
      }
    >
      <div style={branding ? ({ ["--brand-accent" as string]: branding.accentColor } as React.CSSProperties) : undefined}>
        {scope === "app" && sessionError ? (
          // The deployment cannot resolve its workspace state at all (for
          // example a missing/unreachable database): say so honestly instead
          // of rendering protected views whose queries would all fail.
          <Sheet label="WORKSPACE UNAVAILABLE" title="The workspace cannot be reached">
            <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
              <p className="text-[13.5px] leading-relaxed text-ink-2">
                {sessionErrorObj instanceof ApiClientError
                  ? sessionErrorObj.message
                  : "The server could not complete this request."}
              </p>
              <MarginNote>
                Run `GET /api/system` for the deployment's configuration diagnostics, or see
                DEPLOYMENT.md for the setup order (environment variables, migration, redeploy).
              </MarginNote>
            </div>
          </Sheet>
        ) : scope === "app" && needsSignIn && session ? (
          // Redirecting to /login — never render protected views while
          // unauthenticated. A brief neutral skeleton bridges the moment.
          <div className="flex flex-col gap-4" aria-busy="true">
            <Skeleton className="h-24 rounded-[2px] bg-paper-deep" />
            <Skeleton className="h-10 rounded-[2px] bg-paper-deep" />
            <Skeleton className="h-64 rounded-[2px] bg-paper-deep" />
          </div>
        ) : sessionLoading && scope === "app" ? (
          <div className="flex flex-col gap-4" aria-busy="true">
            <Skeleton className="h-24 rounded-[2px] bg-paper-deep" />
            <Skeleton className="h-64 rounded-[2px] bg-paper-deep" />
          </div>
        ) : (
          children
        )}
      </div>
    </AppShell>
  );
}

/** Standalone sign-in route body (/login): renders the existing LoginView. */
export function LoginRoute() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-xl flex-col gap-5 py-10" aria-busy="true">
          <Skeleton className="h-64 rounded-[2px] bg-paper-deep" />
        </div>
      }
    >
      <LoginRouteInner />
    </Suspense>
  );
}

function LoginRouteInner() {
  const { data: session, isLoading, isError, error } = useSession("app");
  const router = useRouter();
  const next = useNextParam();

  // Already signed in (or the deployment does not require sign-in): go to
  // the workspace, or back to the route the user originally requested.
  // `next` is already sanitized (same-origin path only) by useNextParam.
  useEffect(() => {
    if (!session) return;
    if (!session.authRequired || session.authenticated) {
      router.replace(next ?? "/app");
    }
  }, [session, router, next]);

  if (isError) {
    // The deployment cannot resolve its access-control state (for example
    // a missing/unreachable database): show the actionable reason instead
    // of an endless skeleton.
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5 py-10">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="micro-label w-fit transition-colors hover:text-ink"
        >
          ← LANDINGSENTINEL
        </button>
        <Sheet label="SIGN-IN UNAVAILABLE" title="Sign-in cannot be reached">
          <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
            <p className="text-[13.5px] leading-relaxed text-ink-2">
              {error instanceof ApiClientError ? error.message : "The server could not complete this request."}
            </p>
            <MarginNote>
              Run `GET /api/system` for the deployment's configuration diagnostics, or see
              DEPLOYMENT.md for the setup order (environment variables, migration, redeploy).
            </MarginNote>
          </div>
        </Sheet>
      </div>
    );
  }

  if (isLoading || !session) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5 py-10" aria-busy="true">
        <Skeleton className="h-64 rounded-[2px] bg-paper-deep" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 py-10">
      <button
        type="button"
        onClick={() => router.push("/")}
        className="micro-label w-fit transition-colors hover:text-ink"
      >
        ← LANDINGSENTINEL
      </button>
      <LoginView session={session} scope="app" />
    </div>
  );
}

function useNextParam(): string | null {
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  return next && safeNext(next) ? next : null;
}

function safeNext(next: string): string | null {
  // Only same-origin absolute paths — never protocol-relative or full URLs.
  return next.startsWith("/") && !next.startsWith("//") ? next : null;
}
