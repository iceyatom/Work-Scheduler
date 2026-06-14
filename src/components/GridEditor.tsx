"use client";

import clsx from "clsx";
import { DAY_NAMES } from "@/lib/constants";
import { formatMinutesShort, hoursFromMin } from "@/lib/time";
import { dailyPaidMinutes, indexAssignments, weeklyPaidMinutes } from "@/lib/schedule-helpers";
import { Badge } from "@/components/ui";
import type { AssignmentRow, ScheduleDetail } from "@/lib/view-types";

// Weekly employee × day matrix — the primary editing surface (spec §7.1).
export function GridEditor({
  detail,
  onCellClick,
}: {
  detail: ScheduleDetail;
  onCellClick: (employeeId: string, dayOfWeek: number, assignment: AssignmentRow | null) => void;
}) {
  const { employees, assignments } = detail;
  const index = indexAssignments(assignments);
  // Only show employees who have a shift OR are active (keeps the grid useful).
  const scheduledIds = new Set(assignments.map((a) => a.employeeId));
  const rows = employees.filter((e) => e.active || scheduledIds.has(e.id));

  return (
    <div className="overflow-x-auto scroll-thin">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-600">Employee</th>
            {DAY_NAMES.map((d) => (
              <th key={d} className="min-w-[110px] border-l border-slate-100 bg-slate-50 px-2 py-2 text-center font-semibold text-slate-600">
                {d.slice(0, 3)}
              </th>
            ))}
            <th className="border-l border-slate-200 bg-slate-50 px-3 py-2 text-right font-semibold text-slate-600">Weekly</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((emp) => {
            const weekly = weeklyPaidMinutes(assignments, emp.id);
            return (
              <tr key={emp.id} className="border-t border-slate-100">
                <td className="sticky left-0 z-10 bg-white px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-slate-900">{emp.name}</span>
                    {emp.isGM ? <Badge color="purple">GM</Badge> : emp.isManager && <Badge color="purple">Mgr</Badge>}
                    {emp.isMinor && <Badge color="amber">Minor</Badge>}
                    {!emp.active && <Badge color="red">Inactive</Badge>}
                  </div>
                </td>
                {DAY_NAMES.map((_, day) => {
                  const cell = index.get(`${emp.id}:${day}`) ?? [];
                  const a = cell[0] ?? null;
                  return (
                    <td key={day} className="border-l border-slate-100 p-1 text-center align-top">
                      <button
                        onClick={() => onCellClick(emp.id, day, a)}
                        className={clsx(
                          "h-full w-full rounded-md px-1 py-1.5 text-xs transition-colors",
                          a
                            ? a.locked
                              ? "bg-brand-light text-brand-dark hover:bg-brand-light/80"
                              : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                            : "text-slate-300 hover:bg-slate-50 hover:text-slate-500",
                        )}
                        title={a?.locked ? "Hard-set / locked shift" : a ? "Click to edit" : "Click to add a shift"}
                      >
                        {a ? (
                          <span className="flex flex-col leading-tight">
                            <span className="font-medium tabular-nums">
                              {formatMinutesShort(a.startMin)}–{formatMinutesShort(a.endMin)}
                            </span>
                            <span className="text-[10px] opacity-70">
                              {hoursFromMin(a.paidMinutes)}h{a.locked ? " · 🔒" : ""}
                            </span>
                            {cell.length > 1 && <span className="text-[10px] text-amber-600">+{cell.length - 1} more</span>}
                          </span>
                        ) : (
                          "+"
                        )}
                      </button>
                    </td>
                  );
                })}
                <td className="border-l border-slate-200 px-3 py-2 text-right font-medium tabular-nums text-slate-700">{hoursFromMin(weekly)}h</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 bg-slate-50 font-medium">
            <td className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-slate-600">Daily total</td>
            {DAY_NAMES.map((_, day) => {
              const mins = dailyPaidMinutes(assignments, day);
              const h = hoursFromMin(mins);
              // 70 min / 75 soft / 80 hard daily targets (spec §2).
              const color = mins === 0 ? "text-slate-400" : h < 70 ? "text-amber-700" : h > 80 ? "text-red-600" : h > 75 ? "text-amber-700" : "text-emerald-700";
              return (
                <td key={day} className={clsx("border-l border-slate-100 px-2 py-2 text-center tabular-nums", color)}>
                  {h}h
                </td>
              );
            })}
            <td className="border-l border-slate-200 px-3 py-2 text-right tabular-nums text-slate-700">
              {hoursFromMin(assignments.reduce((s, a) => s + a.paidMinutes, 0))}h
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="mt-3 text-xs text-slate-500">
        Click any cell to add or edit a shift in the slider editor. <span className="text-brand-dark">Purple</span> = hard-set/locked,{" "}
        <span className="text-emerald-700">green</span> = scheduled. Daily totals turn amber outside the 70–75h band and red over the 80h hard cap.
      </p>
    </div>
  );
}
