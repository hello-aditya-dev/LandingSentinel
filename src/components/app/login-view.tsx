"use client";

/**
 * Administrator sign-in (single-admin access control — see SECURITY.md).
 * Shown by the app shell when the real workspace requires authentication.
 * Styled with the existing paper-dossier system; no new visual language.
 */

import { useState } from "react";
import { Sheet, MicroLabel, DossierLine, MarginNote } from "@/components/paper/paper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useLogin, type SessionData } from "@/lib/client/queries";
import { ApiClientError } from "@/lib/client/api";

export function LoginView({ session, scope }: { session: SessionData; scope: "demo" | "app" }) {
  const login = useLogin(scope);
  const [password, setPassword] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || login.isPending) return;
    login.mutate({ password });
  };

  const error =
    login.error instanceof ApiClientError || login.error instanceof Error
      ? login.error.message
      : null;
  const locked = login.error instanceof ApiClientError && login.error.code === "AUTH_CONFIG_MISSING";

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 py-10">
      <Sheet
        label="ACCESS CONTROL"
        title="Administrator sign-in"
        labelAside={<DossierLine items={["REAL CAMPAIGN DATA · PROTECTED"]} />}
      >
        <form onSubmit={submit} className="flex flex-col gap-4 px-4 py-5 sm:px-5">
          <div className="flex items-start gap-3">
            <ShieldCheck size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-2" />
            <p className="text-[13.5px] leading-relaxed text-ink-2">
              This deployment protects real campaign data with single-admin authentication. The
              synthetic demo workspace stays public — sign-in is only required for the workspace
              that holds your imported campaigns.
            </p>
          </div>

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
        Failed attempts are rate-limited. Sessions expire automatically; sign out from the header
        when finished.
      </MarginNote>
    </div>
  );
}
