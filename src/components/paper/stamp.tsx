"use client";

/**
 * Status stamps — the signature visual device.
 *
 * The preflight stamp looks like a physical inspection stamp on a technical
 * dossier: slight rotation, faint double impression ring, distressed edge at
 * very low intensity, crisp readable type. The stamp animation is a fast
 * physical motion (~320 ms) that respects prefers-reduced-motion (handled in
 * globals.css). Status is never communicated by colour alone: every stamp
 * includes an icon and text.
 */

import { cn } from "@/lib/utils";
import { OctagonX, TriangleAlert, Check } from "lucide-react";


export type PreflightStatus = "DO_NOT_LAUNCH" | "REVIEW_BEFORE_LAUNCH" | "LAUNCH_READY";

const STATUS_TEXT: Record<PreflightStatus, string> = {
  DO_NOT_LAUNCH: "DO NOT LAUNCH",
  REVIEW_BEFORE_LAUNCH: "REVIEW BEFORE LAUNCH",
  LAUNCH_READY: "LAUNCH READY",
};

export function StatusStamp({
  status,
  size = "md",
  animated = false,
  className,
  rotation,
}: {
  status: PreflightStatus;
  size?: "md" | "lg";
  animated?: boolean;
  className?: string;
  rotation?: number;
}) {
  const tone =
    status === "DO_NOT_LAUNCH" ? "stamp-critical" : status === "REVIEW_BEFORE_LAUNCH" ? "stamp-warning" : "stamp-healthy";

  const Icon = status === "DO_NOT_LAUNCH" ? OctagonX : status === "REVIEW_BEFORE_LAUNCH" ? TriangleAlert : Check;

  return (
    <span
      role="img"
      aria-label={`Preflight status: ${STATUS_TEXT[status]}`}
      className={cn("stamp", size === "lg" && "stamp-lg", tone, animated && "stamp-animate", className)}
      style={rotation !== undefined ? { ["--stamp-rot" as string]: `${rotation}deg` } : undefined}
    >
      <Icon size={size === "lg" ? 22 : 16} strokeWidth={2.4} aria-hidden="true" />
      <span>{STATUS_TEXT[status]}</span>
    </span>
  );
}

/** Small inline severity badge for findings — icon + text + colour (never colour alone). */
export function SeverityBadge({
  severity,
  confidence,
  className,
}: {
  severity: "critical" | "warning" | "info" | "healthy";
  confidence?: string;
  className?: string;
}) {
  const config = {
    critical: { icon: OctagonX, cls: "border-critical bg-critical-wash text-critical", label: "CRITICAL" },
    warning: { icon: TriangleAlert, cls: "border-warning bg-warning-wash text-warning", label: "WARNING" },
    info: { icon: Check, cls: "border-ink-3 bg-paper-deep text-ink-2", label: "INFO" },
    healthy: { icon: Check, cls: "border-healthy bg-healthy-wash text-healthy", label: "HEALTHY" },
  }[severity];

  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em]",
        config.cls,
        className
      )}
    >
      <Icon size={12} strokeWidth={2.5} aria-hidden="true" />
      {config.label}
      {confidence ? <span className="font-normal opacity-70">· {confidence.replace(/_/g, " ")}</span> : null}
    </span>
  );
}

/** Status dot + label for compact table cells. */
export function StatusCell({ status }: { status: "critical" | "warning" | "healthy" }) {
  const config = {
    critical: { dot: "bg-critical", text: "text-critical", label: "Critical" },
    warning: { dot: "bg-warning", text: "text-warning", label: "Warning" },
    healthy: { dot: "bg-healthy", text: "text-healthy", label: "Healthy" },
  }[status];
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span aria-hidden="true" className={cn("inline-block h-2 w-2 rounded-full border border-current", config.dot)} />
      <span className={cn("text-[13px] font-medium", config.text)}>{config.label}</span>
    </span>
  );
}
