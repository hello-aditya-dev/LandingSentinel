"use client";

import Link from "next/link";
import { SentinelMark } from "@/components/paper/sentinel-mark";
import { MicroLabel } from "@/components/paper/paper";

/**
 * Route-level error boundary — an unexpected application failure lands on a
 * calm paper surface instead of a raw crash screen. API-level failures
 * (scans, imports, reports) are handled by their own envelopes and never
 * reach this boundary; this catches genuine client-side exceptions.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen flex-col bg-paper text-ink">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-4 py-16 sm:px-6">
        <div className="flex items-center gap-3">
          <SentinelMark size={26} />
          <span className="font-display text-[18px] font-bold leading-none tracking-tight">LandingSentinel</span>
        </div>

        <section className="paper-sheet print-sheet px-5 py-6 sm:px-6">
          <div className="flex items-baseline justify-between gap-3 border-b border-hairline pb-3">
            <MicroLabel>APPLICATION / INTERRUPTED</MicroLabel>
            <span aria-hidden="true" className="reg-mark select-none text-ink-3">
              +
            </span>
          </div>

          <h1 className="font-display mt-5 text-2xl font-bold leading-tight tracking-tight">
            The application could not complete this request.
          </h1>
          <p className="mt-3 max-w-md text-[13.5px] leading-relaxed text-ink-2">
            The current view stopped unexpectedly. Any scans, imports and reports that were
            already saved are unaffected — persistent state lives on the server.
          </p>

          {error.digest ? (
            <p className="mt-3 font-mono text-[11.5px] text-ink-3">
              Reference: {error.digest}
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-hairline pt-5">
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-[2px] border border-ink bg-ink px-4 text-[13px] font-medium text-paper transition-colors hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-[0.5px]"
            >
              Try again
            </button>
            <Link
              href="/"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-[2px] border border-hairline-strong bg-paper px-4 text-[13px] font-medium text-ink transition-colors hover:bg-paper-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-[0.5px]"
            >
              Return home
            </Link>
          </div>
        </section>

        <p className="micro-label text-ink-3">RETRY IS SAFE · SAVED STATE IS PRESERVED</p>
      </div>
    </main>
  );
}
