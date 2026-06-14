"use client";

import { useState } from "react";
import clsx from "clsx";
import {
  BASELINE_FLOOR_STAFF,
  BASELINE_TARGET_STAFF,
  DAY_NAMES,
  LATE_NIGHT_CUTOFF_MIN,
  LATE_NIGHT_MAX_STAFF,
  RUSH_TARGET_STAFF,
  RUSH_WINDOWS,
  SLOTS_PER_DAY,
  SLOT_MINUTES,
  STORE_CLOSE_MIN,
  STORE_OPEN_MIN,
} from "@/lib/constants";
import { formatMinutesShort } from "@/lib/time";
import { coverageForDay, type EmployeeLite, type ShiftLite } from "@/lib/validation";
import type { ScheduleDetail } from "@/lib/view-types";

const TOTAL = STORE_CLOSE_MIN - STORE_OPEN_MIN;
const pct = (min: number) => ((min - STORE_OPEN_MIN) / TOTAL) * 100;

function slotStatus(day: number, slotStartMin: number, count: number): "ok" | "warn" | "bad" {
  const slotEnd = slotStartMin + SLOT_MINUTES;
  if (slotStartMin >= LATE_NIGHT_CUTOFF_MIN[day]) return count > LATE_NIGHT_MAX_STAFF ? "bad" : "ok";
  const inRush = RUSH_WINDOWS.some((w) => slotStartMin >= w.startMin && slotEnd <= w.endMin);
  if (inRush) return count >= RUSH_TARGET_STAFF ? "ok" : count >= BASELINE_FLOOR_STAFF ? "warn" : "bad";
  if (count >= BASELINE_TARGET_STAFF) return "ok";
  if (count >= BASELINE_FLOOR_STAFF) return "warn";
  return "bad";
}

// Daily horizontal timeline across store hours (spec §7.2). Read-oriented view
// for spotting over/under-coverage, including the rush windows.
export function TimelineView({ detail }: { detail: ScheduleDetail }) {
  const [day, setDay] = useState(0);
  const empById = new Map<string, EmployeeLite>(detail.employees.map((e) => [e.id, e]));
  const shifts: ShiftLite[] = detail.assignments.map((a) => ({
    employeeId: a.employeeId,
    dayOfWeek: a.dayOfWeek,
    startMin: a.startMin,
    endMin: a.endMin,
    breakStartMin: a.breakStartMin,
    paidMinutes: a.paidMinutes,
  }));

  const dayAssignments = detail.assignments.filter((a) => a.dayOfWeek === day).sort((a, b) => a.startMin - b.startMin);
  const rowEmployeeIds = Array.from(new Set(dayAssignments.map((a) => a.employeeId)));
  const { staff, managers } = coverageForDay(shifts, empById, day);
  const cutoff = LATE_NIGHT_CUTOFF_MIN[day];

  const hourTicks: number[] = [];
  for (let m = STORE_OPEN_MIN; m <= STORE_CLOSE_MIN; m += 60) hourTicks.push(m);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1">
        {DAY_NAMES.map((d, i) => (
          <button
            key={d}
            onClick={() => setDay(i)}
            className={clsx("rounded-md px-3 py-1.5 text-sm font-medium", i === day ? "bg-brand text-white" : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200")}
          >
            {d.slice(0, 3)}
          </button>
        ))}
      </div>

      <div className="min-w-[820px] overflow-x-auto scroll-thin">
        {/* Axis */}
        <div className="relative ml-40 h-6 border-b border-slate-200">
          {hourTicks.map((m) => (
            <div key={m} className="absolute top-0 -translate-x-1/2 text-[10px] text-slate-400" style={{ left: `${pct(m)}%` }}>
              {formatMinutesShort(m)}
            </div>
          ))}
        </div>

        {/* Employee rows */}
        <div className="relative">
          {rowEmployeeIds.length === 0 && <p className="ml-40 py-6 text-sm text-slate-500">No shifts scheduled on {DAY_NAMES[day]}.</p>}
          {rowEmployeeIds.map((empId) => {
            const emp = empById.get(empId);
            const rowShifts = dayAssignments.filter((a) => a.employeeId === empId);
            return (
              <div key={empId} className="flex items-center border-b border-slate-50">
                <div className="w-40 shrink-0 truncate py-2 pr-2 text-sm text-slate-700">
                  {emp?.name}
                  {emp?.isManager && <span className="ml-1 text-brand">●</span>}
                </div>
                <div className="relative h-8 flex-1">
                  {/* shaded context bands */}
                  {RUSH_WINDOWS.map((w) => (
                    <div key={w.label} className="absolute inset-y-0 bg-brand-light/50" style={{ left: `${pct(w.startMin)}%`, width: `${pct(w.endMin) - pct(w.startMin)}%` }} />
                  ))}
                  <div className="absolute inset-y-0 bg-slate-200/40" style={{ left: `${pct(cutoff)}%`, width: `${100 - pct(cutoff)}%` }} />
                  {/* shift blocks */}
                  {rowShifts.map((a) => (
                    <div
                      key={a.id}
                      className={clsx("absolute inset-y-1 rounded text-[10px] text-white", a.locked ? "bg-brand-dark" : "bg-emerald-600")}
                      style={{ left: `${pct(a.startMin)}%`, width: `${pct(a.endMin) - pct(a.startMin)}%` }}
                      title={`${formatMinutesShort(a.startMin)}–${formatMinutesShort(a.endMin)}`}
                    >
                      <span className="absolute inset-0 flex items-center justify-center truncate px-1">
                        {formatMinutesShort(a.startMin)}–{formatMinutesShort(a.endMin)}
                      </span>
                      {a.breakStartMin != null && (
                        <div
                          className="absolute inset-y-0 bg-white/40"
                          style={{
                            left: `${((a.breakStartMin - a.startMin) / (a.endMin - a.startMin)) * 100}%`,
                            width: `${(30 / (a.endMin - a.startMin)) * 100}%`,
                          }}
                          title="Unpaid break"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Coverage strip */}
        <div className="mt-3 flex items-end">
          <div className="w-40 shrink-0 pr-2 text-xs font-medium text-slate-500">Coverage (staff)</div>
          <div className="relative flex h-16 flex-1 items-end">
            {Array.from({ length: SLOTS_PER_DAY }).map((_, s) => {
              const slotStart = STORE_OPEN_MIN + s * SLOT_MINUTES;
              const count = staff[s];
              const status = slotStatus(day, slotStart, count);
              const color = status === "ok" ? "bg-emerald-500" : status === "warn" ? "bg-amber-400" : "bg-red-500";
              return (
                <div
                  key={s}
                  className={clsx("flex-1", color, count === 0 && "bg-slate-100")}
                  style={{ height: `${Math.min(count, 6) * 16}%` }}
                  title={`${formatMinutesShort(slotStart)} · ${count} staff${managers[s] ? "" : " · no manager"}`}
                />
              );
            })}
          </div>
        </div>
        {/* Manager strip */}
        <div className="mt-1 flex items-center">
          <div className="w-40 shrink-0 pr-2 text-xs font-medium text-slate-500">Manager present</div>
          <div className="relative flex h-3 flex-1">
            {Array.from({ length: SLOTS_PER_DAY }).map((_, s) => (
              <div key={s} className={clsx("flex-1", managers[s] > 0 ? "bg-brand" : staff[s] > 0 ? "bg-red-400" : "bg-slate-100")} title={managers[s] > 0 ? "manager on site" : "no manager"} />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-brand-light" /> Rush window (target {RUSH_TARGET_STAFF})</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-slate-200" /> Late-night (≤{LATE_NIGHT_MAX_STAFF} after {formatMinutesShort(cutoff)})</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-emerald-500" /> meets target</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-amber-400" /> below target</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-red-500" /> below floor / over cap</span>
      </div>
    </div>
  );
}
