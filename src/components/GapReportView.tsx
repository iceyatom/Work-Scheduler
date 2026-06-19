"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";
import type { GapItem } from "@/lib/types";

export const KIND_LABEL: Record<string, string> = {
  MANAGER_ABSENCE: "Manager",
  LATE_NIGHT_BELOW_TARGET: "Late-night",
  LATE_NIGHT_OVER_CAP: "Late-night cap",
  OPEN_EDGE_OVER_CAP: "Open/close hour",
  OPEN_EDGE_UNDERSTAFFED: "Open/close hour",
  BASELINE_BELOW_FLOOR: "Baseline floor",
  BASELINE_BELOW_TARGET: "Baseline",
  RUSH_BELOW_TARGET: "Rush",
  LABOR_BELOW_MIN: "Labor min",
  LABOR_OVER_SOFT_CAP: "Labor soft cap",
  LABOR_OVER_HARD_CAP: "Labor hard cap",
  MINOR_RULE: "Minor rule",
  SHIFT_RULE: "Shift rule",
  AVAILABILITY: "Availability",
  DAYS_OFF: "Days off",
  REST_PERIOD: "Rest period",
};

// Gap report: unmet soft constraints surfaced for manual resolution (spec §7.6).
// Active gaps can be dismissed; dismissed gaps are reviewable/restorable here.
export function GapReportView({
  gaps,
  dismissed = [],
  onDismiss,
  onRestore,
}: {
  gaps: GapItem[];
  dismissed?: GapItem[];
  onDismiss?: (gap: GapItem) => void;
  onRestore?: (gap: GapItem) => void;
}) {
  const blocking = gaps.filter((g) => g.severity === "BLOCKING");
  const warnings = gaps.filter((g) => g.severity === "WARNING");
  const [showDismissed, setShowDismissed] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Badge color={blocking.length ? "red" : "green"}>{blocking.length} blocking</Badge>
        <Badge color={warnings.length ? "amber" : "green"}>{warnings.length} warnings</Badge>
        {dismissed.length > 0 && <Badge color="slate">{dismissed.length} dismissed</Badge>}
      </div>

      {gaps.length === 0 ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-emerald-800">
          ✅ No active gaps — every hard constraint is satisfied and all soft targets are met.
        </div>
      ) : (
        <>
          {blocking.length > 0 && <Section title="Blocking — must be resolved" rows={blocking} tone="red" onDismiss={onDismiss} />}
          {warnings.length > 0 && <Section title="Warnings — soft targets not met" rows={warnings} tone="amber" onDismiss={onDismiss} />}
        </>
      )}

      {dismissed.length > 0 && (
        <div>
          <button onClick={() => setShowDismissed((v) => !v)} className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-800">
            <span className="text-xs">{showDismissed ? "▾" : "▸"}</span> Dismissed ({dismissed.length})
          </button>
          {showDismissed && (
            <ul className="mt-2 space-y-1.5">
              {dismissed.map((g, i) => (
                <li key={i} className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                  <span className="mt-0.5 shrink-0">
                    <Badge color="slate">{KIND_LABEL[g.kind] ?? g.kind}</Badge>
                  </span>
                  <span className="flex-1 line-through decoration-slate-300">{g.message}</span>
                  {onRestore && (
                    <button
                      onClick={() => onRestore(g)}
                      className="shrink-0 self-center text-xs font-medium text-brand underline-offset-2 hover:underline"
                    >
                      Restore
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, rows, tone, onDismiss }: { title: string; rows: GapItem[]; tone: "red" | "amber"; onDismiss?: (gap: GapItem) => void }) {
  return (
    <div>
      <h3 className={tone === "red" ? "mb-2 font-semibold text-red-700" : "mb-2 font-semibold text-amber-700"}>{title}</h3>
      <ul className="space-y-1.5">
        {rows.map((g, i) => (
          <li
            key={i}
            className={
              "flex items-start gap-2 rounded-md border px-3 py-2 text-sm " +
              (tone === "red" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800")
            }
          >
            <span className="mt-0.5 shrink-0">
              <Badge color={tone}>{KIND_LABEL[g.kind] ?? g.kind}</Badge>
            </span>
            <span className="flex-1">{g.message}</span>
            {onDismiss && (
              <button
                onClick={() => onDismiss(g)}
                className="shrink-0 self-center text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
              >
                Dismiss
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
