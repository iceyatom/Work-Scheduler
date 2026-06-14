// Shared types for the solver protocol and the gap report. These mirror the
// Pydantic models in solver/models.py — keep the two in sync.

import type { StoreConfig } from "./constants";

export type EmploymentType = "FULL_TIME" | "PART_TIME";

export interface SolverAvailability {
  dayOfWeek: number;
  startMin: number;
  endMin: number;
}

export interface SolverHardSet {
  dayOfWeek: number;
  startMin: number;
  endMin: number;
}

export interface SolverEmployee {
  id: string;
  name: string;
  employmentType: EmploymentType;
  isManager: boolean;
  isGM: boolean;
  isMinor: boolean;
  performance: number;
  minHoursPerWeek: number | null;
  maxHoursPerWeek: number | null;
  availability: SolverAvailability[];
  hardSets: SolverHardSet[];
}

export interface SolverAssignment {
  employeeId: string;
  dayOfWeek: number;
  startMin: number;
  endMin: number;
  breakStartMin: number | null;
  paidMinutes: number;
  locked: boolean;
  source: "SOLVER" | "MANUAL" | "HARDSET";
}

export interface SolveRequest {
  mode: "GENERATE" | "RESOLVE";
  config: StoreConfig;
  timeLimitSeconds: number;
  employees: SolverEmployee[];
  /** For RESOLVE: the prior schedule's assignments to perturb minimally. */
  existingAssignments?: SolverAssignment[];
}

// --- Gap report (spec §7.6) -----------------------------------------------

export type GapKind =
  | "MANAGER_ABSENCE"
  | "LATE_NIGHT_OVER_CAP"
  | "BASELINE_BELOW_FLOOR"
  | "BASELINE_BELOW_TARGET"
  | "RUSH_BELOW_TARGET"
  | "LABOR_BELOW_MIN"
  | "LABOR_OVER_SOFT_CAP"
  | "LABOR_OVER_HARD_CAP"
  | "MINOR_RULE"
  | "SHIFT_RULE"
  | "AVAILABILITY"
  | "DAYS_OFF";

export type GapSeverity = "BLOCKING" | "WARNING";

export interface GapItem {
  kind: GapKind;
  severity: GapSeverity;
  dayOfWeek: number | null;
  startMin: number | null;
  endMin: number | null;
  message: string;
  /** Optional extra context, e.g. { have: 2, need: 3, employeeId }. */
  detail?: Record<string, unknown>;
}

export interface SolveResponse {
  status: string; // OPTIMAL / FEASIBLE / INFEASIBLE / ...
  objectiveValue: number | null;
  solveMs: number;
  assignments: SolverAssignment[];
  gaps: GapItem[];
}
