/**
 * SentinelMark — the LandingSentinel product mark.
 *
 * An inspection sheet of campaign paper with one folded corner, an
 * inspection-registration cross, and a critical-red sentinel marker.
 * Geometry is identical to src/app/icon.svg (the favicon source), so the
 * browser tab, the app shell, the sign-in screen, the marketing header and
 * the report masthead all share one identity.
 *
 * Vector-only, print-safe (pure inline SVG), and legible from 16px upward.
 */
export function SentinelMark({
  className,
  size = 20,
  title,
}: {
  className?: string;
  size?: number;
  title?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role={title ? undefined : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M40 3 H11 Q3 3 3 11 V53 Q3 61 11 61 H53 Q61 61 61 53 V24 L40 3 Z"
        fill="var(--paper-raised, #faf8f2)"
        stroke="var(--ink, #181714)"
        strokeWidth="4"
      />
      <path
        d="M40 3 V18 Q40 24 46 24 H61 Z"
        fill="var(--paper-deep, #ece7db)"
        stroke="var(--ink, #181714)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M30 28 V52 M18 40 H42"
        stroke="var(--ink, #181714)"
        strokeWidth="6"
        strokeLinecap="square"
        fill="none"
      />
      <rect x="25" y="35" width="10" height="10" fill="var(--critical, #a7372d)" />
    </svg>
  );
}
