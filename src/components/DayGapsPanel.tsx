"use client";

import clsx from "clsx";
import { Badge } from "@/components/ui";
import { KIND_LABEL } from "@/components/GapReportView";
import { DAY_NAMES } from "@/lib/constants";
import type { GapItem } from "@/lib/types";

// Per-day issue panel shown above the grid editor when a day's error count is
// clicked. Lists that day's gaps; sized to show ~3 rows before it scrolls.
export function DayGapsPanel({ day, gaps, onClose }: { day: number; gaps: GapItem[]; onClose: () => void }) {
  const blocking = gaps.filter((g) => g.severity === "BLOCKING").length;
  const warning = gaps.length - blocking;

  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-800">{DAY_NAMES[day]} — issues</h3>
          {blocking > 0 && <Badge color="red">{blocking} blocking</Badge>}
          {warning > 0 && (
            <Badge color="amber">
              {warning} warning{warning > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close issues panel">
          ✕
        </button>
      </div>

      {gaps.length === 0 ? (
        <p className="px-4 py-3 text-sm text-emerald-700">✅ No issues for {DAY_NAMES[day]}.</p>
      ) : (
        // ~3 rows tall, then scrolls.
        <ul className="max-h-[13.5rem] space-y-1.5 overflow-y-auto scroll-thin p-3">
          {gaps.map((g, i) => (
            <li
              key={i}
              className={clsx(
                "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
                g.severity === "BLOCKING" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800",
              )}
            >
              <span className="mt-0.5 shrink-0">
                <Badge color={g.severity === "BLOCKING" ? "red" : "amber"}>{KIND_LABEL[g.kind] ?? g.kind}</Badge>
              </span>
              <span>{g.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
