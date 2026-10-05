"use client";

/**
 * Administrator sign-in (single-admin access control — see SECURITY.md).
 * Shown by the app shell when the real workspace requires authentication.
 * Styled with the existing paper-dossier system; no new visual language.
 */

import { useState } from "react";
import { Sheet, MicroLabel, DossierLine, MarginNote } from "@/components/paper/paper";
import { SentinelMark } from "@/components/paper/sentinel-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyRound } from "lucide-react";
import { useLogin, type SessionData } from "@/lib/client/queries";
import { ApiClientError } from "@/lib/client/api";
import { PRODUCT } from "@/config/product";

export function LoginView({ session, scope }: { session: SessionData; scope: "demo" | "app" }) {
  const login = useLogin(scope);
  const [password, setPassword] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || login.isPending) return;
    login.mutate({ password });
  };

  const wrongPassword =
    login.error instanceof ApiClientError && login.error.code === "AUTH_INVALID_CREDENTIALS";
  const error = wrongPassword
    ? "The password is incorrect."
    : login.error instanceof Error && !(login.error instanceof ApiClientError)
      ? login.error.message
      : login.error instanceof ApiClientError && login.error.code !== "AUTH_INVALID_CREDENTIALS"
        ? login.error.message
        : null;
  const locked = login.error instanceof ApiClientError && login.error.code === "AUTH_CONFIG_MISSING";

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 py-10">
      <Sheet
        label="CONTROL ACCESS"
        title="Administrator sign-in"
        labelAside={<DossierLine items={["REAL CAMPAIGN DATA · PROTECTED"]} />}
      >
        <div className="flex items-center gap-2.5 border-b border-hairline px-4 py-3.5 sm:px-5">
          <SentinelMark size={20} />
          <span className="font-display text-[15px] font-bold leading-none tracking-tight">
            {PRODUCT.name}
          </span>
          <span className="micro-label ml-auto text-ink-3">SINGLE-ADMIN</span>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4 px-4 py-5 sm:px-5">
          <p className="text-[13.5px] leading-relaxed text-ink-2">
            Sign in to access campaign scans and reports.
          </p>

          {locked ? (
            <MarginNote>
              Administrator access is not configured on the server. Set <span className="font-mono">ADMIN_PASSWORD_HASH</span>{" "}
              (generate one with <span className="font-mono">npm run hash-password</span>), then restart.
            </MarginNote>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="admin-password" className="micro-label">
              ADMINISTRATOR PASSWORD
            </label>
            <Input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={login.isPending}
              className="font-mono"
              placeholder="••••••••••••"
              aria-describedby={error ? "login-error" : undefined}
              aria-invalid={error ? true : undefined}
            />
          </div>

          {error ? (
            <p id="login-error" role="alert" className="text-[12.5px] leading-relaxed text-critical">
              {error}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-3 border-t border-hairline pt-4">
            <MicroLabel>HTTP-ONLY SESSION · {session.mode === "auth" ? "APP_ACCESS_MODE=AUTH" : "OPEN"}</MicroLabel>
            <Button type="submit" size="sm" disabled={login.isPending || !password} className="gap-2">
              <KeyRound size={14} aria-hidden="true" />
              {login.isPending ? "Verifying…" : "Sign in"}
            </Button>
          </div>
        </form>
      </Sheet>

      <MarginNote>
        The synthetic demo workspace stays public — sign-in is only required for the workspace
        that holds your imported campaigns. Failed attempts are rate-limited; sessions expire
        automatically.
      </MarginNote>
    </div>
  );
}
