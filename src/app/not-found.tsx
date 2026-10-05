import Link from "next/link";
import { SentinelMark } from "@/components/paper/sentinel-mark";
import { MicroLabel } from "@/components/paper/paper";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col bg-paper text-ink">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-4 py-16 sm:px-6">
        <div className="flex items-center gap-3">
          <SentinelMark size={26} />
          <span className="font-display text-[18px] font-bold leading-none tracking-tight">LandingSentinel</span>
        </div>

        <section className="paper-sheet print-sheet px-5 py-6 sm:px-6">
          <div className="flex items-baseline justify-between gap-3 border-b border-hairline pb-3">
            <MicroLabel>404 / DESTINATION NOT FOUND</MicroLabel>
            <span aria-hidden="true" className="reg-mark select-none text-ink-3">
              +
            </span>
          </div>

          <h1 className="font-display mt-5 text-2xl font-bold leading-tight tracking-tight">
            This page is not part of the current LandingSentinel workspace.
          </h1>
          <p className="mt-3 max-w-md text-[13.5px] leading-relaxed text-ink-2">
            The URL does not resolve to a known destination. If you followed a link from a
            campaign or a report, the underlying page may have been moved or retired.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-hairline pt-5">
            <Link
              href="/"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-[2px] border border-ink bg-ink px-4 text-[13px] font-medium text-paper transition-colors hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-[0.5px]"
            >
              Return home
            </Link>
            <Link
              href="/#/demo"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-[2px] border border-hairline-strong bg-paper px-4 text-[13px] font-medium text-ink transition-colors hover:bg-paper-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-[0.5px]"
            >
              Open live demo
            </Link>
          </div>
        </section>

        <p className="micro-label text-ink-3">LANDINGSENTINEL · PAID-MEDIA PREFLIGHT</p>
      </div>
    </main>
  );
}
