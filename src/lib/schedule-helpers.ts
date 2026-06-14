// Pure helpers shared by the grid, timeline and report views.

import type { AssignmentRow } from "./view-types";

/** Index assignments by `${employeeId}:${dayOfWeek}` (usually 0 or 1 per cell). */
export function indexAssignments(assignments: AssignmentRow[]): Map<string, AssignmentRow[]> {
  const map = new Map<string, AssignmentRow[]>();
  for (const a of assignments) {
    const key = `${a.employeeId}:${a.dayOfWeek}`;
    const arr = map.get(key);
    if (arr) arr.push(a);
    else map.set(key, [a]);
  }
  return map;
}

export function weeklyPaidMinutes(assignments: AssignmentRow[], employeeId: string): number {
  return assignments.filter((a) => a.employeeId === employeeId).reduce((s, a) => s + a.paidMinutes, 0);
}

export function dailyPaidMinutes(assignments: AssignmentRow[], dayOfWeek: number): number {
  return assignments.filter((a) => a.dayOfWeek === dayOfWeek).reduce((s, a) => s + a.paidMinutes, 0);
}

export function totalPaidMinutes(assignments: AssignmentRow[]): number {
  return assignments.reduce((s, a) => s + a.paidMinutes, 0);
}

/** Date (yyyy-mm-dd) for a given day index within the week starting weekStartISO. */
export function dateForDay(weekStartISO: string, dayOfWeek: number): string {
  const d = new Date(weekStartISO.slice(0, 10) + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + dayOfWeek);
  return d.toISOString().slice(0, 10);
}
