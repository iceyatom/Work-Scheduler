"use client";

/* Unified stroke-icon set (24px viewBox, 1.75 stroke, round caps/joins) — the
   same line style as the Nav menu and export button. Used across the landing
   page, tutorial page, and real app UI so nothing falls back to emoji.
   Default size tracks the surrounding font-size (1em) so an icon dropped
   inline in text sizes itself automatically; pass className to override. */

interface IconProps {
  className?: string;
}

function iconProps({ className = "h-[1em] w-[1em]" }: IconProps) {
  return {
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
  };
}

export function SolverIcon(props: IconProps = {}) {
  return (
    <svg {...iconProps(props)}>
      <line x1="5" y1="4" x2="5" y2="20" />
      <circle cx="5" cy="9" r="2" fill="currentColor" stroke="none" />
      <line x1="12" y1="4" x2="12" y2="20" />
      <circle cx="12" cy="15" r="2" fill="currentColor" stroke="none" />
      <line x1="19" y1="4" x2="19" y2="20" />
      <circle cx="19" cy="7" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ManagersIcon(props: IconProps = {}) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" />
      <circle cx="17.5" cy="7" r="2.4" />
      <path d="M15.8 13.2c2.7.5 4.4 2.7 4.4 5.4" />
    </svg>
  );
}

export function ValidationIcon(props: IconProps = {}) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

export function ReportIcon(props: IconProps = {}) {
  return (
    <svg {...iconProps(props)}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      <path d="M8.5 11.5l2 2 4-4.5" />
      <path d="M9 17h6" />
    </svg>
  );
}

/** Full end-to-end workflow: a path connecting a start and end waypoint. */
export function RouteIcon(props: IconProps = {}) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="4.5" cy="18" r="2" />
      <path d="M6.5 18h3a4 4 0 0 0 4-4V9a4 4 0 0 1 4-4h1.5" />
      <circle cx="19.5" cy="5" r="2" />
    </svg>
  );
}

/** Generate: a bolt. */
export function ZapIcon(props: IconProps = {}) {
  return (
    <svg {...iconProps(props)}>
      <path d="M13 2 4.5 14h5.5l-1 8 9-12h-5.5l1-8z" />
    </svg>
  );
}

/** Gap report: a flag on a pole. */
export function FlagIcon(props: IconProps = {}) {
  return (
    <svg {...iconProps(props)}>
      <path d="M5 21V3.5" />
      <path d="M5 4.5h13l-3 4 3 4H5" />
    </svg>
  );
}

/** Personnel changes & re-solve: a refresh cycle. */
export function RefreshIcon(props: IconProps = {}) {
  return (
    <svg {...iconProps(props)}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20.5 3.5v5h-5" />
    </svg>
  );
}

/** Print & export: an arrow down into a tray. */
export function ExportIcon(props: IconProps = {}) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 3v12" />
      <path d="M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4.5 16.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

/** Hard-set / locked shift indicator: a closed padlock. */
export function LockIcon(props: IconProps = {}) {
  return (
    <svg {...iconProps(props)}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/** Print action: a desktop printer. */
export function PrinterIcon(props: IconProps = {}) {
  return (
    <svg {...iconProps(props)}>
      <path d="M7 8V4h10v4" />
      <rect x="4" y="8" width="16" height="8" rx="2" />
      <path d="M7 16v4h10v-4" />
    </svg>
  );
}
