"use client";

import { DAY_NAMES } from "@/lib/constants";
import { formatMinutesShort, hoursFromMin } from "@/lib/time";
import { dailyPaidMinutes, dateForDay, indexAssignments, totalPaidMinutes, weeklyPaidMinutes } from "@/lib/schedule-helpers";
import type { ScheduleDetail } from "@/lib/view-types";

// Weekly tabular report matching the "Weekly Labor Schedule With Daily Total"
// layout (spec §7.3). Printable / PDF-exportable via the browser print dialog.
export function PrintableReport({ detail }: { detail: ScheduleDetail }) {
  const { schedule, assignments, employees } = detail;
  const index = indexAssignments(assignments);
  const scheduledIds = new Set(assignments.map((a) => a.employeeId));
  const rows = employees.filter((e) => scheduledIds.has(e.id));

  return (
    <div className="print-area">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-slate-900">Weekly Labor Schedule — With Daily Total</h2>
        <p className="text-sm text-slate-500">
          {schedule.name} · Week of {dateForDay(schedule.weekStart, 0)} – {dateForDay(schedule.weekStart, 6)}
        </p>
      </div>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-300 px-2 py-1.5 text-left">Employee</th>
            {DAY_NAMES.map((d, i) => (
              <th key={d} className="border border-slate-300 px-2 py-1.5 text-center">
                <div>{d.slice(0, 3)}</div>
                <div className="font-normal text-slate-400">{dateForDay(schedule.weekStart, i).slice(5)}</div>
              </th>
            ))}
            <th className="border border-slate-300 px-2 py-1.5 text-right">Weekly</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((emp) => (
            <tr key={emp.id}>
              <td className="border border-slate-300 px-2 py-1.5 font-medium">
                {emp.name}
                {emp.isManager ? " (M)" : ""}
              </td>
              {DAY_NAMES.map((_, day) => {
                const cell = index.get(`${emp.id}:${day}`) ?? [];
                return (
                  <td key={day} className="border border-slate-300 px-2 py-1.5 text-center align-top">
                    {cell.length === 0 ? (
                      <span className="text-slate-300">—</span>
                    ) : (
                      cell.map((a) => (
                        <div key={a.id} className="tabular-nums">
                          <div>
                            {formatMinutesShort(a.startMin)}–{formatMinutesShort(a.endMin)}
                          </div>
                          <div className="text-[10px] text-slate-400">{hoursFromMin(a.paidMinutes)}h</div>
                        </div>
                      ))
                    )}
                  </td>
                );
              })}
              <td className="border border-slate-300 px-2 py-1.5 text-right font-semibold tabular-nums">{hoursFromMin(weeklyPaidMinutes(assignments, emp.id))}h</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-100 font-semibold">
            <td className="border border-slate-300 px-2 py-1.5">Daily total</td>
            {DAY_NAMES.map((_, day) => (
              <td key={day} className="border border-slate-300 px-2 py-1.5 text-center tabular-nums">
                {hoursFromMin(dailyPaidMinutes(assignments, day))}h
              </td>
            ))}
            <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums">{hoursFromMin(totalPaidMinutes(assignments))}h</td>
          </tr>
        </tfoot>
      </table>
      <p className="mt-2 text-[10px] text-slate-400">(M) = manager · times shown are scheduled start–end · hours are paid hours (unpaid 30-min lunch removed for shifts over 5h).</p>
    </div>
  );
}
