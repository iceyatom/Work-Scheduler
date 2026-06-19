"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";
import { Badge } from "@/components/ui";
import { KIND_LABEL } from "@/components/GapReportView";
import { DAY_NAMES } from "@/lib/constants";
import type { GapItem } from "@/lib/types";

// Per-day issue panel shown above the grid editor when a day's error count is
// clicked. Lists that day's gaps; sized to show ~3 rows before it scrolls.
//
// When `onSelect` is supplied (the timeline view) each row is clickable and the
// `activeIndex` row is ring-highlighted — used to highlight the matching time
// slots on the timeline.
export function DayGapsPanel({
  day,
  gaps,
  onClose,
  activeIndex = null,
  onSelect,
  onDismiss,
}: {
  day: number;
  gaps: GapItem[];
  onClose: () => void;
  activeIndex?: number | null;
  onSelect?: (index: number) => void;
  onDismiss?: (gap: GapItem) => void;
}) {
  const blocking = gaps.filter((g) => g.severity === "BLOCKING").length;
  const warning = gaps.length - blocking;

  // Cap the list to exactly three rows tall (whatever the actual row heights
  // are), so a 4th+ issue scrolls. Fixed-pixel max-heights can't do this because
  // a row is one or two lines depending on message length.
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const ul = listRef.current;
    if (!ul) return;
    const items = ul.querySelectorAll<HTMLLIElement>(":scope > li");
    if (items.length > 3) {
      const padBottom = parseFloat(getComputedStyle(ul).paddingBottom) || 0;
      const height = items[2].getBoundingClientRect().bottom - ul.getBoundingClientRect().top + padBottom;
      ul.style.maxHeight = `${Math.ceil(height)}px`;
    } else {
      ul.style.maxHeight = "";
    }
  }, [gaps]);

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
          {onSelect && gaps.length > 0 && <span className="text-xs text-slate-400">— click an issue to highlight it</span>}
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close issues panel">
          ✕
        </button>
      </div>

      {gaps.length === 0 ? (
        <p className="px-4 py-3 text-sm text-emerald-700">✅ No issues for {DAY_NAMES[day]}.</p>
      ) : (
        // Three rows tall, then scrolls (precise cap applied via listRef effect).
        <ul ref={listRef} className="max-h-[13.5rem] space-y-1.5 overflow-y-auto scroll-thin p-3">
          {gaps.map((g, i) => {
            const tone = g.severity === "BLOCKING" ? "red" : "amber";
            const containerClass = clsx(
              "flex items-start gap-2 rounded-md border px-3 py-2 text-sm transition",
              g.severity === "BLOCKING" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800",
              onSelect && "hover:brightness-95",
              activeIndex === i && (g.severity === "BLOCKING" ? "ring-2 ring-red-500" : "ring-2 ring-amber-500"),
            );
            const inner = (
              <>
                <span className="mt-0.5 shrink-0">
                  <Badge color={tone}>{KIND_LABEL[g.kind] ?? g.kind}</Badge>
                </span>
                <span>{g.message}</span>
              </>
            );
            return (
              <li key={i} className={containerClass}>
                {onSelect ? (
                  <button type="button" onClick={() => onSelect(i)} className="flex flex-1 items-start gap-2 text-left">
                    {inner}
                  </button>
                ) : (
                  <div className="flex flex-1 items-start gap-2">{inner}</div>
                )}
                {onDismiss && (
                  <button
                    type="button"
                    onClick={() => onDismiss(g)}
                    className="shrink-0 self-center text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
                  >
                    Dismiss
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
