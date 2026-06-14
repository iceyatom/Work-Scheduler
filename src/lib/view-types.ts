// Client-side shapes returned by the API (subset of the Prisma rows).

import type { EmployeeLite } from "./validation";
import type { GapItem } from "./types";

export interface AssignmentRow {
  id: string;
  scheduleId: string;
  employeeId: string;
  dayOfWeek: number;
  startMin: number;
  endMin: number;
  breakStartMin: number | null;
  paidMinutes: number;
  locked: boolean;
  source: "SOLVER" | "MANUAL" | "HARDSET";
}

export interface ScheduleRow {
  id: string;
  name: string;
  weekStart: string;
  status: "DRAFT" | "PUBLISHED";
  generatedFrom: "BLANK" | "RESOLVE";
  solverStatus: string | null;
  objectiveValue: number | null;
  solveMs: number | null;
  gaps: GapItem[] | null;
  createdAt: string;
}

export interface ScheduleDetail {
  schedule: ScheduleRow;
  assignments: AssignmentRow[];
  employees: (EmployeeLite & { employmentType: string; active: boolean })[];
}

export interface ScheduleSummary extends ScheduleRow {
  _count?: { assignments: number };
}
