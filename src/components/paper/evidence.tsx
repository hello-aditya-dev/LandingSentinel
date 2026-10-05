"use client";

/**
 * Money + evidence rendering primitives.
 * All financial values travel as integer minor units; formatting happens
 * here with Intl.NumberFormat.
 */

import { formatMoney, formatMoneyExact } from "@/lib/money/money";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";

export function Money({
  minor,
  currency,
  className,
  exact,
}: {
  minor: number;
  currency: string;
  className?: string;
  exact?: boolean;
}) {
  const value = exact ? formatMoneyExact(minor, currency) : formatMoney(minor, currency);
  return <span className={cn("num font-mono tabular-nums", className)}>{value}</span>;
}

/** Big dossier metric: micro-label above a large mono figure. */
export function MetricFigure({
  label,
  minor,
  currency,
  tone = "ink",
  note,
}: {
  label: string;
  minor: number;
  currency: string;
  tone?: "ink" | "critical" | "warning" | "healthy";
  note?: string;
}) {
  const toneCls = {
    ink: "text-ink",
    critical: "text-critical",
    warning: "text-warning",
    healthy: "text-healthy",
  }[tone];
  return (
    <div className="flex flex-col gap-1">
      <span className="micro-label">{label}</span>
      <span className={cn("num font-mono text-2xl font-semibold tabular-nums leading-none sm:text-[28px]", toneCls)}>
        {formatMoney(minor, currency)}
      </span>
      {note ? <span className="text-xs leading-snug text-ink-3">{note}</span> : null}
    </div>
  );
}

/** Copy-to-clipboard button with an accessible label and toast feedback. */
export function CopyButton({ text, label, className }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={label ?? "Copy to clipboard"}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center border border-hairline bg-paper-raised text-ink-3 transition-colors hover:border-hairline-strong hover:text-ink",
        copied && "border-healthy text-healthy",
        className
      )}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          toast({ title: "Copied to clipboard", description: label ? undefined : text.slice(0, 120) });
          setTimeout(() => setCopied(false), 1600);
        } catch {
          toast({ title: "Copy failed", description: "Your browser blocked clipboard access." });
        }
      }}
    >
      <Copy size={12} aria-hidden="true" />
    </button>
  );
}

/** One machine-readable evidence row, rendered as text (never HTML). */
export type EvidenceItemView = {
  type: string;
  label: string;
  value?: string;
  meta?: Record<string, string | number | boolean | null | undefined>;
  snippet?: string;
};

export function EvidenceRow({ item }: { item: EvidenceItemView }) {
  const metaText = item.meta
    ? Object.entries(item.meta)
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join(" · ")
    : null;

  return (
    <div className="border-b border-hairline px-4 py-2.5 last:border-b-0 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="micro-label">{item.label}</span>
        <span className="micro-label text-evidence">{item.type}</span>
      </div>
      {item.value ? (
        <p className="url-wrap mt-1 font-mono text-[12.5px] leading-relaxed text-ink">{item.value}</p>
      ) : null}
      {item.snippet ? (
        <blockquote className="mt-1.5 border-l-2 border-evidence bg-evidence-wash px-3 py-1.5 font-mono text-[11.5px] leading-relaxed text-ink-2">
          {item.snippet}
        </blockquote>
      ) : null}
      {metaText ? <p className="mt-1 font-mono text-[11px] text-ink-3">{metaText}</p> : null}
    </div>
  );
}

export function EvidenceBlock({ items, emptyText }: { items: EvidenceItemView[]; emptyText?: string }) {
  if (items.length === 0) {
    return <p className="px-4 py-3 text-[13px] text-ink-3 sm:px-5">{emptyText ?? "No evidence recorded."}</p>;
  }
  return (
    <div>
      {items.map((item, i) => (
        <EvidenceRow key={i} item={item} />
      ))}
    </div>
  );
}

/** Visual redirect chain: hop cards joined by arrows. */
export function RedirectChain({
  hops,
  finalStatus,
  finalUrl,
}: {
  hops: { sequence: number; fromUrl: string; toUrl: string; statusCode: number; durationMs: number | null }[];
  finalStatus: number | null;
  finalUrl: string | null;
}) {
  if (hops.length === 0) {
    return (
      <p className="px-4 py-3 text-[13px] text-ink-3 sm:px-5">
        No redirects — the destination responded directly.
      </p>
    );
  }
  const nodes: ReactNode[] = [];
  hops.forEach((hop, i) => {
    if (i === 0) {
      nodes.push(
        <ChainNode key={`from-${i}`} url={hop.fromUrl} badge="Requested" />
      );
    }
    nodes.push(<ChainArrow key={`arrow-${i}`} statusCode={hop.statusCode} durationMs={hop.durationMs} />);
    const isLast = i === hops.length - 1;
    nodes.push(
      <ChainNode
        key={`to-${i}`}
        url={hop.toUrl}
        badge={isLast ? `Final · HTTP ${finalStatus ?? "?"}` : undefined}
      />
    );
  });
  return (
    <div className="flex flex-col gap-1.5 px-4 py-4 sm:px-5">
      <div className="flex flex-col items-stretch gap-1.5">{nodes}</div>
      {finalUrl && hops.length > 0 ? null : null}
    </div>
  );
}

function ChainNode({ url, badge }: { url: string; badge?: string }) {
  return (
    <div className="paper-pressed flex items-center justify-between gap-2 px-3 py-2">
      <span className="url-wrap font-mono text-[12px] text-ink">{url}</span>
      {badge ? <span className="micro-label shrink-0">{badge}</span> : null}
    </div>
  );
}

function ChainArrow({ statusCode, durationMs }: { statusCode: number; durationMs: number | null }) {
  return (
    <div className="flex items-center gap-2 pl-4 font-mono text-[11px] text-ink-2" aria-hidden="true">
      <span className="flex flex-col items-center">
        <span className="text-hairline-strong">↓</span>
      </span>
      <span className="num rounded-none border border-hairline bg-paper-deep px-1.5 py-0.5 text-[10px] font-semibold">
        HTTP {statusCode}
      </span>
      {durationMs !== null && durationMs !== undefined ? (
        <span className="num text-[10px] text-ink-3">{durationMs} ms</span>
      ) : null}
    </div>
  );
}
