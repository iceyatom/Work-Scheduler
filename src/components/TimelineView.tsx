"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  BASELINE_FLOOR_STAFF,
  BASELINE_TARGET_STAFF,
  DAY_NAMES,
  LATE_NIGHT_CUTOFF_MIN,
  LATE_NIGHT_MIN_STAFF,
  OPEN_EDGE_MAX_CREW,
  OPEN_EDGE_MAX_MANAGERS,
  OPEN_EDGE_WINDOW_MIN,
  REGULAR_SHIFT_MIN_MIN,
  RUSH_TARGET_STAFF,
  RUSH_WINDOWS,
  SLOTS_PER_DAY,
  SLOT_MINUTES,
  STORE_CLOSE_MIN,
  STORE_OPEN_MIN,
} from "@/lib/constants";
import { formatMinutesShort, snapToSlot } from "@/lib/time";
import { coverageForDay, deriveShift, validateShift, type EmployeeLite, type ShiftLite } from "@/lib/validation";
import type { AssignmentRow, ScheduleDetail } from "@/lib/view-types";

const TOTAL = STORE_CLOSE_MIN - STORE_OPEN_MIN;
const pct = (min: number) => ((min - STORE_OPEN_MIN) / TOTAL) * 100;
const EDGE_TARGET_STAFF = OPEN_EDGE_MAX_MANAGERS + OPEN_EDGE_MAX_CREW;

type DragMode = "move" | "start" | "end";

interface DragState {
  assignmentId: string;
  mode: DragMode;
  originX: number;
  laneLeft: number;
  laneWidth: number;
  originalStart: number;
  originalEnd: number;
  nextStart: number;
  nextEnd: number;
}

function slotStatus(day: number, slotStartMin: number, count: number): "ok" | "warn" | "bad" {
  const slotEnd = slotStartMin + SLOT_MINUTES;
  if (isOpenEdge(slotStartMin)) {
    if (count === EDGE_TARGET_STAFF) return "ok";
    return count > EDGE_TARGET_STAFF ? "bad" : "warn";
  }
  if (slotStartMin >= LATE_NIGHT_CUTOFF_MIN[day]) return count >= LATE_NIGHT_MIN_STAFF ? "ok" : "warn";
  const inRush = RUSH_WINDOWS.some((w) => slotStartMin >= w.startMin && slotEnd <= w.endMin);
  if (inRush) return count >= RUSH_TARGET_STAFF ? "ok" : count >= BASELINE_FLOOR_STAFF ? "warn" : "bad";
  if (count >= BASELINE_TARGET_STAFF) return "ok";
  if (count >= BASELINE_FLOOR_STAFF) return "warn";
  return "bad";
}

function isOpenEdge(slotStartMin: number): boolean {
  return slotStartMin < STORE_OPEN_MIN + OPEN_EDGE_WINDOW_MIN || slotStartMin >= STORE_CLOSE_MIN - OPEN_EDGE_WINDOW_MIN;
}

// Target active-staff for a slot, mirroring slotStatus' reference points. Drawn
// as the red target line over the coverage bars.
function slotTarget(day: number, slotStartMin: number): number {
  if (isOpenEdge(slotStartMin)) return EDGE_TARGET_STAFF;
  if (slotStartMin >= LATE_NIGHT_CUTOFF_MIN[day]) return LATE_NIGHT_MIN_STAFF;
  const slotEnd = slotStartMin + SLOT_MINUTES;
  const inRush = RUSH_WINDOWS.some((w) => slotStartMin >= w.startMin && slotEnd <= w.endMin);
  if (inRush) return RUSH_TARGET_STAFF;
  return BASELINE_TARGET_STAFF;
}

function SlotGrid({ className }: { className?: string }) {
  return (
    <div className={clsx("pointer-events-none absolute inset-0", className)}>
      {Array.from({ length: SLOTS_PER_DAY + 1 }).map((_, i) => (
        <span
          key={i}
          className={clsx("absolute inset-y-0 border-l", i % 4 === 0 ? "border-slate-300/80" : "border-slate-300/45")}
          style={{ left: `${(i / SLOTS_PER_DAY) * 100}%` }}
        />
      ))}
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function minuteFromClientX(clientX: number, drag: DragState): number {
  if (drag.laneWidth <= 0) return drag.originalStart;
  const ratio = clamp((clientX - drag.laneLeft) / drag.laneWidth, 0, 1);
  return clamp(snapToSlot(STORE_OPEN_MIN + ratio * TOTAL), STORE_OPEN_MIN, STORE_CLOSE_MIN);
}

function dragPreview(drag: DragState, clientX: number): DragState {
  const duration = drag.originalEnd - drag.originalStart;
  if (drag.mode === "move") {
    const delta = snapToSlot(((clientX - drag.originX) / Math.max(1, drag.laneWidth)) * TOTAL);
    const nextStart = clamp(drag.originalStart + delta, STORE_OPEN_MIN, STORE_CLOSE_MIN - duration);
    return { ...drag, nextStart, nextEnd: nextStart + duration };
  }

  const minute = minuteFromClientX(clientX, drag);
  if (drag.mode === "start") {
    return {
      ...drag,
      nextStart: clamp(minute, STORE_OPEN_MIN, drag.originalEnd - REGULAR_SHIFT_MIN_MIN),
      nextEnd: drag.originalEnd,
    };
  }
  return {
    ...drag,
    nextStart: drag.originalStart,
    nextEnd: clamp(minute, drag.originalStart + REGULAR_SHIFT_MIN_MIN, STORE_CLOSE_MIN),
  };
}

export function TimelineView({
  detail,
  onShiftChange,
}: {
  detail: ScheduleDetail;
  onShiftChange?: (assignment: AssignmentRow, startMin: number, endMin: number) => Promise<void>;
}) {
  const [day, setDay] = useState(0);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const empById = useMemo(() => new Map<string, EmployeeLite>(detail.employees.map((e) => [e.id, e])), [detail.employees]);
  const shifts: ShiftLite[] = detail.assignments.map((a) => ({
    employeeId: a.employeeId,
    dayOfWeek: a.dayOfWeek,
    startMin: a.startMin,
    endMin: a.endMin,
    breakStarts: a.breakStarts,
    paidMinutes: a.paidMinutes,
  }));

  const dayAssignments = detail.assignments.filter((a) => a.dayOfWeek === day).sort((a, b) => a.startMin - b.startMin);
  const rowEmployeeIds = Array.from(new Set(dayAssignments.map((a) => a.employeeId)));
  const { staff, managerPresent } = coverageForDay(shifts, empById, day);
  const cutoff = LATE_NIGHT_CUTOFF_MIN[day];

  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  const commitDrag = useCallback(
    async (finalDrag: DragState) => {
      const assignment = detail.assignments.find((a) => a.id === finalDrag.assignmentId);
      if (!assignment || !onShiftChange) return;
      if (assignment.startMin === finalDrag.nextStart && assignment.endMin === finalDrag.nextEnd) return;

      const employee = empById.get(assignment.employeeId);
      if (!employee) return;
      const blocking = validateShift(employee, assignment.dayOfWeek, finalDrag.nextStart, finalDrag.nextEnd).filter((v) => v.severity === "BLOCKING");
      if (blocking.length > 0) {
        setEditError(blocking.map((v) => v.message).join(" "));
        return;
      }

      setEditError(null);
      setSavingId(assignment.id);
      try {
        await onShiftChange(assignment, finalDrag.nextStart, finalDrag.nextEnd);
      } catch (e) {
        setEditError((e as Error).message);
      } finally {
        setSavingId(null);
      }
    },
    [detail.assignments, empById, onShiftChange],
  );

  useEffect(() => {
    if (!drag?.assignmentId) return;

    function onPointerMove(e: PointerEvent) {
      const cur = dragRef.current;
      if (!cur) return;
      setDrag(dragPreview(cur, e.clientX));
    }

    function onPointerUp(e: PointerEvent) {
      const cur = dragRef.current;
      if (!cur) return;
      const finalDrag = dragPreview(cur, e.clientX);
      dragRef.current = null;
      setDrag(null);
      void commitDrag(finalDrag);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
    window.addEventListener("pointercancel", onPointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [commitDrag, drag?.assignmentId]);

  function beginDrag(e: React.PointerEvent<HTMLElement>, assignment: AssignmentRow, mode: DragMode) {
    if (!onShiftChange || e.button !== 0) return;
    const lane = e.currentTarget.closest("[data-shift-lane]") as HTMLElement | null;
    if (!lane) return;
    const rect = lane.getBoundingClientRect();
    e.preventDefault();
    e.stopPropagation();
    setEditError(null);
    setDrag({
      assignmentId: assignment.id,
      mode,
      originX: e.clientX,
      laneLeft: rect.left,
      laneWidth: rect.width,
      originalStart: assignment.startMin,
      originalEnd: assignment.endMin,
      nextStart: assignment.startMin,
      nextEnd: assignment.endMin,
    });
  }

  const hourTicks: number[] = [];
  for (let m = STORE_OPEN_MIN; m <= STORE_CLOSE_MIN; m += 60) hourTicks.push(m);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1">
        {DAY_NAMES.map((d, i) => (
          <button
            key={d}
            onClick={() => setDay(i)}
            className={clsx("rounded-md px-3 py-1.5 text-sm font-medium", i === day ? "bg-brand text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100")}
          >
            {d.slice(0, 3)}
          </button>
        ))}
      </div>

      {editError && <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</div>}

      <div className="min-w-[820px] overflow-x-auto scroll-thin">
        <div className="relative ml-40 h-6 border-b border-slate-200">
          {hourTicks.map((m) => (
            <div key={m} className="absolute top-0 -translate-x-1/2 text-[10px] text-slate-400" style={{ left: `${pct(m)}%` }}>
              {formatMinutesShort(m)}
            </div>
          ))}
        </div>

        <div className="relative">
          {rowEmployeeIds.length === 0 && <p className="ml-40 py-6 text-sm text-slate-500">No shifts scheduled on {DAY_NAMES[day]}.</p>}
          {rowEmployeeIds.map((empId) => {
            const emp = empById.get(empId);
            const rowShifts = dayAssignments.filter((a) => a.employeeId === empId);
            return (
              <div key={empId} className="flex items-center border-b border-slate-50">
                <div className="w-40 shrink-0 truncate py-2 pr-2 text-sm text-slate-700">
                  {emp?.name}
                  {emp?.isManager && <span className="ml-1 text-brand">*</span>}
                </div>
                <div className="relative h-8 flex-1" data-shift-lane>
                  {RUSH_WINDOWS.map((w) => (
                    <div key={w.label} className="absolute inset-y-0 bg-brand-light/50" style={{ left: `${pct(w.startMin)}%`, width: `${pct(w.endMin) - pct(w.startMin)}%` }} />
                  ))}
                  <div className="absolute inset-y-0 bg-slate-200/40" style={{ left: `${pct(cutoff)}%`, width: `${100 - pct(cutoff)}%` }} />
                  <SlotGrid className="z-0" />
                  {rowShifts.map((a) => {
                    const preview = drag?.assignmentId === a.id ? { startMin: drag.nextStart, endMin: drag.nextEnd } : null;
                    const startMin = preview?.startMin ?? a.startMin;
                    const endMin = preview?.endMin ?? a.endMin;
                    const duration = endMin - startMin;
                    const breaks = preview ? deriveShift(startMin, endMin).breakStarts : a.breakStarts;
                    const isSaving = savingId === a.id;
                    return (
                      <div
                        key={a.id}
                        onPointerDown={(e) => beginDrag(e, a, "move")}
                        className={clsx(
                          "absolute inset-y-1 z-10 touch-none select-none rounded text-[10px] text-white shadow-sm",
                          onShiftChange && "cursor-grab active:cursor-grabbing",
                          a.locked ? "bg-brand-dark" : "bg-emerald-600",
                          preview && "ring-2 ring-slate-900/20",
                          isSaving && "opacity-70",
                        )}
                        style={{ left: `${pct(startMin)}%`, width: `${pct(endMin) - pct(startMin)}%` }}
                        title={`${formatMinutesShort(startMin)}-${formatMinutesShort(endMin)}`}
                      >
                        {onShiftChange && (
                          <>
                            <button
                              type="button"
                              aria-label="Adjust start time"
                              onPointerDown={(e) => beginDrag(e, a, "start")}
                              className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize rounded-l bg-white/20 hover:bg-white/35"
                            />
                            <button
                              type="button"
                              aria-label="Adjust end time"
                              onPointerDown={(e) => beginDrag(e, a, "end")}
                              className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize rounded-r bg-white/20 hover:bg-white/35"
                            />
                          </>
                        )}
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center truncate px-3">
                          {isSaving ? "Saving..." : `${formatMinutesShort(startMin)}-${formatMinutesShort(endMin)}`}
                        </span>
                        {breaks.map((b) => (
                          <div
                            key={b}
                            className="pointer-events-none absolute inset-y-0 bg-white/40"
                            style={{
                              left: `${((b - startMin) / duration) * 100}%`,
                              width: `${(30 / duration) * 100}%`,
                            }}
                            title="Unpaid 30-min break"
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex items-end">
          <div className="w-40 shrink-0 pr-2 text-xs font-medium text-slate-500">Coverage (staff)</div>
          <div className="relative flex h-16 flex-1 items-end">
            <SlotGrid className="z-0" />
            {Array.from({ length: SLOTS_PER_DAY }).map((_, s) => {
              const slotStart = STORE_OPEN_MIN + s * SLOT_MINUTES;
              const count = staff[s];
              const status = slotStatus(day, slotStart, count);
              const color = status === "ok" ? "bg-emerald-500" : status === "warn" ? "bg-amber-400" : "bg-red-500";
              return (
                <div
                  key={s}
                  className={clsx("relative z-10 flex-1 border-l", s % 4 === 0 ? "border-slate-500/35" : "border-white/60", color, count === 0 && "bg-slate-100")}
                  style={{ height: `${Math.min(count, 6) * 16}%` }}
                  title={`${formatMinutesShort(slotStart)} - ${count} staff (target ${slotTarget(day, slotStart)})${managerPresent[s] ? "" : " - no manager"}`}
                />
              );
            })}
            {/* Target line: a red stepped outline of each slot's staffing target,
                drawn at the same 16%-per-staff scale as the bars. */}
            <div className="pointer-events-none absolute inset-0 z-20 flex">
              {Array.from({ length: SLOTS_PER_DAY }).map((_, s) => {
                const slotStart = STORE_OPEN_MIN + s * SLOT_MINUTES;
                const target = slotTarget(day, slotStart);
                return (
                  <div key={s} className="relative flex-1">
                    <span className="absolute inset-x-0 border-t-2 border-red-500/80" style={{ bottom: `${Math.min(target, 6) * 16}%` }} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-1 flex items-center">
          <div className="w-40 shrink-0 pr-2 text-xs font-medium text-slate-500">Manager present</div>
          <div className="relative flex h-3 flex-1">
            <SlotGrid className="z-0" />
            {Array.from({ length: SLOTS_PER_DAY }).map((_, s) => (
              <div
                key={s}
                className={clsx("relative z-10 flex-1 border-l", s % 4 === 0 ? "border-slate-500/35" : "border-white/60", managerPresent[s] > 0 ? "bg-brand" : staff[s] > 0 ? "bg-red-400" : "bg-slate-100")}
                title={managerPresent[s] > 0 ? "manager on site" : "no manager"}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-brand-light" /> Rush window (target {RUSH_TARGET_STAFF})</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-slate-200" /> Late-night ({LATE_NIGHT_MIN_STAFF}+ after {formatMinutesShort(cutoff)})</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-emerald-500" /> meets target</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-amber-400" /> below target</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-red-500" /> below floor / edge over cap</span>
        <span className="flex items-center gap-1"><span className="inline-block h-0 w-3 border-t-2 border-red-500/80" /> staffing target</span>
      </div>
    </div>
  );
}
