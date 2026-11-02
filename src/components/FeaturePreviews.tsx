"use client";

import clsx from "clsx";

/* Animated mini "app windows" for the landing feature cards. Pure CSS
   keyframes (pv-* classes in globals.css) on a shared 8s loop; every element
   only varies its animation-delay. Reduced-motion users get a frozen final
   frame (also handled in globals.css). */

function WindowFrame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:bg-slate-100/50">
      <div className="flex items-center gap-1.5 border-b border-slate-200 bg-surface px-3 py-1.5">
        <span className="h-2 w-2 rounded-full bg-red-400/80" />
        <span className="h-2 w-2 rounded-full bg-amber-400/80" />
        <span className="h-2 w-2 rounded-full bg-emerald-400/80" />
        <span className="ml-2 truncate text-[10px] font-medium text-slate-400">{label}</span>
      </div>
      <div className="relative h-40 overflow-hidden p-3">{children}</div>
    </div>
  );
}

const cascade = (i: number) => ({ animationDelay: `${i * 0.32}s` });

/* 1 — Solver: shifts cascade into a 7-day grid behind a sweeping search beam. */
export function SolverPreview() {
  // [day column][blocks: [top%, height%, colorClass]]
  const days: [number, number, string][][] = [
    [[4, 34, "bg-brand"], [46, 40, "bg-emerald-500/80"]],
    [[10, 42, "bg-emerald-500/80"], [58, 30, "bg-sky-500/70"]],
    [[4, 30, "bg-sky-500/70"], [40, 44, "bg-brand"]],
    [[16, 40, "bg-emerald-500/80"], [62, 28, "bg-brand"]],
    [[4, 38, "bg-brand"], [48, 36, "bg-emerald-500/80"]],
    [[10, 30, "bg-sky-500/70"], [46, 42, "bg-emerald-500/80"]],
    [[6, 44, "bg-emerald-500/80"], [56, 32, "bg-sky-500/70"]],
  ];
  let n = 0;
  return (
    <WindowFrame label="solver — placing shifts">
      <div className="pv-sweep pointer-events-none absolute inset-y-2 w-8 rounded-full bg-brand/15 blur-sm" />
      <div className="grid h-full grid-cols-7 gap-1.5">
        {days.map((blocks, d) => (
          <div key={d} className="relative rounded bg-slate-200/60">
            {blocks.map(([top, h, cls], b) => (
              <div
                key={b}
                className={clsx("pv-cascade absolute inset-x-0.5 rounded-sm", cls)}
                style={{ top: `${top}%`, height: `${h}%`, ...cascade(n++ % 14) }}
              />
            ))}
          </div>
        ))}
      </div>
    </WindowFrame>
  );
}

/* 2 — Managers first: violet manager rows land first, crew fill in after. */
export function ManagersFirstPreview() {
  const rows: { w: number; l: number; mgr?: boolean; d: number }[] = [
    { w: 58, l: 2, mgr: true, d: 0 },
    { w: 54, l: 42, mgr: true, d: 1 },
    { w: 40, l: 8, d: 5 },
    { w: 36, l: 50, d: 6 },
    { w: 34, l: 24, d: 7 },
    { w: 44, l: 12, d: 8 },
  ];
  return (
    <WindowFrame label="phase 1: managers · phase 2: crew">
      <div className="flex h-full flex-col justify-between py-0.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className={clsx(
                "grid h-3.5 w-8 shrink-0 place-items-center rounded-sm text-[8px] font-bold",
                r.mgr ? "bg-brand-light text-brand-dark" : "bg-slate-200 text-slate-400",
              )}
            >
              {r.mgr ? "MGR" : "crew"}
            </span>
            <div className="relative h-2.5 flex-1 rounded-full bg-slate-200/60">
              <div
                className={clsx("pv-cascade absolute inset-y-0 rounded-full", r.mgr ? "bg-brand" : "bg-emerald-500/80")}
                style={{ left: `${r.l}%`, width: `${r.w}%`, ...cascade(r.d) }}
              />
            </div>
          </div>
        ))}
      </div>
    </WindowFrame>
  );
}

/* 3 — Live validation: a dragged shift crosses close time, warns, snaps back. */
export function ValidationPreview() {
  return (
    <WindowFrame label="grid editor — live validation">
      <div className="flex h-full flex-col justify-center gap-3">
        {/* context rows */}
        <div className="relative h-3 rounded-full bg-slate-200/60">
          <div className="absolute inset-y-0 left-[6%] w-[48%] rounded-full bg-emerald-500/70" />
        </div>
        {/* the animated row; the tinted band on the right is "after close" */}
        <div className="relative h-5 rounded-full bg-slate-200/60">
          <div className="absolute inset-y-0 right-0 w-[22%] rounded-r-full bg-red-100" />
          <div className="pv-stretch absolute inset-y-0 left-[4%] rounded-full bg-brand" />
        </div>
        <div className="relative h-3 rounded-full bg-slate-200/60">
          <div className="absolute inset-y-0 left-[30%] w-[42%] rounded-full bg-emerald-500/70" />
        </div>

        {/* callouts */}
        <div className="relative h-6">
          <span className="pv-warn absolute left-[28%] inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700">
            ⚠ shift ends after close
          </span>
          <span className="pv-ok absolute left-[28%] inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
            ✓ all rules satisfied
          </span>
        </div>
      </div>
    </WindowFrame>
  );
}

/* 4 — Gap report resolves, then the Tracks export appears. */
export function GapExportPreview() {
  const gaps = [
    { label: "Mon 11:00 rush — need 1 more", d: 0 },
    { label: "Wed 20:00 — no manager on site", d: 1 },
    { label: "Fri close — 2nd late-night crew", d: 2 },
  ];
  return (
    <WindowFrame label="gap report → tracks export">
      <div className="flex h-full flex-col justify-between">
        <div className="space-y-2">
          {gaps.map((g, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md border border-slate-200 bg-surface px-2 py-1.5">
              <span className="relative h-2.5 w-2.5 shrink-0">
                <span className="pv-dot-bad absolute inset-0 rounded-full bg-red-500" style={{ animationDelay: `${g.d * 0.5}s` }} />
                <span className="pv-dot-good absolute inset-0 rounded-full bg-emerald-500" style={{ animationDelay: `${g.d * 0.5}s` }} />
              </span>
              <span className="truncate text-[10px] text-slate-600">{g.label}</span>
            </div>
          ))}
        </div>
        <div className="pv-late flex items-center justify-center gap-1.5 rounded-md bg-brand-light px-2 py-1.5 text-[11px] font-semibold text-brand-dark">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="M7 10l5 5 5-5" />
            <path d="M12 15V3" />
          </svg>
          schedule_week27.csv — ready for Tracks
        </div>
      </div>
    </WindowFrame>
  );
}
