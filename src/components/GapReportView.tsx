"use client";

import { Badge } from "@/components/ui";
import type { GapItem } from "@/lib/types";

const KIND_LABEL: Record<string, string> = {
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
export function GapReportView({ gaps }: { gaps: GapItem[] }) {
  const blocking = gaps.filter((g) => g.severity === "BLOCKING");
  const warnings = gaps.filter((g) => g.severity === "WARNING");

  if (gaps.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-emerald-800">
        ✅ No gaps — every hard constraint is satisfied and all soft targets are met.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <Badge color={blocking.length ? "red" : "green"}>{blocking.length} blocking</Badge>
        <Badge color={warnings.length ? "amber" : "green"}>{warnings.length} warnings</Badge>
      </div>

      {blocking.length > 0 && (
        <Section title="Blocking — must be resolved" rows={blocking} tone="red" />
      )}
      {warnings.length > 0 && (
        <Section title="Warnings — soft targets not met" rows={warnings} tone="amber" />
      )}
    </div>
  );
}

function Section({ title, rows, tone }: { title: string; rows: GapItem[]; tone: "red" | "amber" }) {
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
            <span>{g.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
