"use client";

/**
 * Paper dossier primitives — the shared visual vocabulary.
 * Sheets, micro-labels, registration marks, section headings.
 */

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function MicroLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("micro-label", className)}>{children}</span>;
}

export function RegMark({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("reg-mark select-none", className)}>
      +
    </span>
  );
}

/**
 * A raised sheet of paper — evidence panel, report section, index card.
 */
export function Sheet({
  children,
  className,
  label,
  labelAside,
  title,
  titleAside,
  as: Tag = "section",
  pressed,
}: {
  children?: ReactNode;
  className?: string;
  label?: ReactNode;
  labelAside?: ReactNode;
  title?: ReactNode;
  titleAside?: ReactNode;
  as?: "section" | "article" | "aside" | "div";
  pressed?: boolean;
}) {
  return (
    <Tag className={cn(pressed ? "paper-pressed" : "paper-sheet", "print-sheet", className)}>
      {(label || title) && (
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline px-4 py-2.5 sm:px-5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {label ? <MicroLabel>{label}</MicroLabel> : null}
            {title ? (
              <h2 className="font-display text-[15px] font-semibold leading-tight text-ink sm:text-base">{title}</h2>
            ) : null}
          </div>
          {labelAside ?? titleAside ? (
            <div className="text-xs text-ink-2">{labelAside ?? titleAside}</div>
          ) : null}
        </header>
      )}
      {children}
    </Tag>
  );
}

/** A small annotation line — margin note. */
export function MarginNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("border-l-2 border-hairline-strong pl-3 text-[13px] leading-relaxed text-ink-2", className)}>
      {children}
    </p>
  );
}

/** Dossier reference line, e.g. "SCAN / 041 · 2 Oct 2026, 14:32". */
export function DossierLine({ items, className }: { items: (string | null | undefined)[]; className?: string }) {
  const clean = items.filter((i): i is string => Boolean(i));
  return (
    <div className={cn("micro-label flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
      {clean.map((item, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden="true">·</span>}
          <span>{item}</span>
        </span>
      ))}
    </div>
  );
}

export function HairlineDivider({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-hairline", className)} />;
}

/** Ruled ledger row wrapper. */
export function LedgerRow({ children, className, interactive }: { children: ReactNode; className?: string; interactive?: boolean }) {
  return (
    <div className={cn("ledger-row", interactive && "cursor-pointer", className)}>{children}</div>
  );
}
