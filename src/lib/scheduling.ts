// ---------------------------------------------------------------------------
// Orchestration layer: builds solver requests from the database, calls the
// Python CP-SAT service, applies queued personnel changes for incremental
// re-solve, and persists schedules + gap reports (spec §8, F-1 & F-2).
// ---------------------------------------------------------------------------

import type { Prisma, PersonnelChange } from "@prisma/client";
import { prisma } from "./prisma";
import { storeConfig } from "./constants";
import { computeGapReport, deriveShift, type EmployeeLite, type ShiftLite } from "./validation";
import { isoDate } from "./time";
import type {
  GapItem,
  SolveRequest,
  SolveResponse,
  SolverAssignment,
  SolverEmployee,
  SolverHardSet,
} from "./types";

const SOLVER_URL = process.env.SOLVER_URL ?? "http://localhost:8000";
const SOLVER_TIME_LIMIT = Number(process.env.SOLVER_TIME_LIMIT_SECONDS ?? 15);

type EmployeeFull = Prisma.EmployeeGetPayload<{
  include: { availability: true; hardSets: true };
}>;

const employeeInclude = { availability: true, hardSets: true } as const;

// --- Hard-set resolution (templates + one-week overrides, spec §5) ---------

function resolveHardSets(hardSets: EmployeeFull["hardSets"], weekStartISO: string): SolverHardSet[] {
  const byDay = new Map<number, SolverHardSet>();
  // Templates (weekStart == null) apply every week.
  for (const h of hardSets) {
    if (h.weekStart == null) byDay.set(h.dayOfWeek, { dayOfWeek: h.dayOfWeek, startMin: h.startMin, endMin: h.endMin });
  }
  // One-week overrides for the target week replace the template for that day.
  for (const h of hardSets) {
    if (h.weekStart != null && isoDate(new Date(h.weekStart)) === weekStartISO) {
      byDay.set(h.dayOfWeek, { dayOfWeek: h.dayOfWeek, startMin: h.startMin, endMin: h.endMin });
    }
  }
  return [...byDay.values()];
}

export function toSolverEmployee(emp: EmployeeFull, weekStartISO: string): SolverEmployee {
  return {
    id: emp.id,
    name: emp.name,
    employmentType: emp.employmentType,
    // GM implies manager.
    isManager: emp.isManager || emp.isGM,
    isGM: emp.isGM,
    isMinor: emp.isMinor,
    performance: emp.performance,
    minHoursPerWeek: emp.minHoursPerWeek,
    maxHoursPerWeek: emp.maxHoursPerWeek,
    availability: emp.availability.map((a) => ({ dayOfWeek: a.dayOfWeek, startMin: a.startMin, endMin: a.endMin })),
    hardSets: resolveHardSets(emp.hardSets, weekStartISO),
  };
}

// --- Queued personnel changes (spec §6) ------------------------------------

type ChangeRow = PersonnelChange;

/** Remove an off-window from a day's availability, splitting windows as needed. */
function trimAvailability(emp: SolverEmployee, dayOfWeek: number, offStart: number, offEnd: number) {
  const next: SolverEmployee["availability"] = [];
  for (const w of emp.availability) {
    if (w.dayOfWeek !== dayOfWeek || offEnd <= w.startMin || offStart >= w.endMin) {
      next.push(w);
      continue;
    }
    if (w.startMin < offStart) next.push({ dayOfWeek, startMin: w.startMin, endMin: offStart });
    if (w.endMin > offEnd) next.push({ dayOfWeek, startMin: offEnd, endMin: w.endMin });
  }
  emp.availability = next;
}

/** Apply queued changes to the solver inputs. Returns the surviving employees
 *  and the set of employee ids removed from scheduling. */
export function applyChanges(
  employees: SolverEmployee[],
  changes: ChangeRow[],
): { employees: SolverEmployee[]; removedIds: Set<string> } {
  const removedIds = new Set<string>();
  for (const c of changes) {
    if (c.type === "TERMINATION" || c.type === "SUSPENSION" || c.type === "LEAVE_OF_ABSENCE") removedIds.add(c.employeeId);
  }
  const surviving = employees.filter((e) => !removedIds.has(e.id));
  const byId = new Map(surviving.map((e) => [e.id, e]));

  for (const c of changes) {
    const emp = byId.get(c.employeeId);
    if (!emp) continue;
    if (c.type === "DAY_OFF" && c.dayOfWeek != null) {
      if (c.startMin != null && c.endMin != null) {
        trimAvailability(emp, c.dayOfWeek, c.startMin, c.endMin); // partial day off
      } else {
        emp.availability = emp.availability.filter((a) => a.dayOfWeek !== c.dayOfWeek); // whole day off
      }
    } else if (c.type === "AVAILABILITY_CHANGE") {
      const payload = (c.payload ?? {}) as { windows?: { dayOfWeek: number; startMin: number; endMin: number }[] };
      if (payload.windows && payload.windows.length) emp.availability = payload.windows;
    }
  }
  return { employees: surviving, removedIds };
}

// --- Solver call -----------------------------------------------------------

async function callSolver(request: SolveRequest): Promise<SolveResponse> {
  let res: Response;
  try {
    res = await fetch(`${SOLVER_URL}/solve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      cache: "no-store",
    });
  } catch (e) {
    throw new Error(`Could not reach the solver service at ${SOLVER_URL}. Is the docker 'solver' container running? (${(e as Error).message})`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Solver returned ${res.status}: ${text.slice(0, 500)}`);
  }
  return (await res.json()) as SolveResponse;
}

// --- Persistence -----------------------------------------------------------

async function persistSchedule(opts: {
  name: string;
  weekStartISO: string;
  generatedFrom: "BLANK" | "RESOLVE";
  jobType: "GENERATE" | "RESOLVE";
  request: SolveRequest;
  response: SolveResponse;
}) {
  const { name, weekStartISO, generatedFrom, jobType, request, response } = opts;
  const weekStart = new Date(weekStartISO + "T00:00:00.000Z");

  return prisma.$transaction(async (tx) => {
    const job = await tx.job.create({
      data: { type: jobType, status: "RUNNING", request: request as unknown as Prisma.InputJsonValue },
    });

    const schedule = await tx.schedule.create({
      data: {
        name,
        weekStart,
        generatedFrom,
        solverStatus: response.status,
        objectiveValue: response.objectiveValue ?? null,
        solveMs: response.solveMs,
        gaps: response.gaps as unknown as Prisma.InputJsonValue,
        meta: { employeeCount: request.employees.length, mode: request.mode } as Prisma.InputJsonValue,
        assignments: {
          create: response.assignments.map((a) => ({
            employeeId: a.employeeId,
            dayOfWeek: a.dayOfWeek,
            startMin: a.startMin,
            endMin: a.endMin,
            breakStarts: a.breakStarts,
            paidMinutes: a.paidMinutes,
            locked: a.locked,
            source: a.source,
          })),
        },
      },
      include: { assignments: true },
    });

    await tx.job.update({ where: { id: job.id }, data: { status: "DONE", scheduleId: schedule.id, result: { gaps: response.gaps.length } as Prisma.InputJsonValue } });
    return schedule;
  });
}

// --- F-1: generate from blank ----------------------------------------------

export async function generateSchedule(opts: { name: string; weekStartISO: string }) {
  const employees = await prisma.employee.findMany({ where: { active: true }, include: employeeInclude });
  const solverEmployees = employees.map((e) => toSolverEmployee(e, opts.weekStartISO));

  const request: SolveRequest = {
    mode: "GENERATE",
    config: storeConfig(),
    timeLimitSeconds: SOLVER_TIME_LIMIT,
    employees: solverEmployees,
  };
  const response = await callSolver(request);
  return persistSchedule({
    name: opts.name,
    weekStartISO: opts.weekStartISO,
    generatedFrom: "BLANK",
    jobType: "GENERATE",
    request,
    response,
  });
}

// --- F-2: incremental re-solve from queued changes -------------------------

export async function resolveSchedule(opts: { scheduleId: string; name?: string }) {
  const prior = await prisma.schedule.findUnique({ where: { id: opts.scheduleId }, include: { assignments: true } });
  if (!prior) throw new Error("Schedule not found");
  const weekStartISO = isoDate(new Date(prior.weekStart));

  const employees = await prisma.employee.findMany({ where: { active: true }, include: employeeInclude });
  const changes = await prisma.personnelChange.findMany({ where: { status: "QUEUED" } });

  let solverEmployees = employees.map((e) => toSolverEmployee(e, weekStartISO));
  const { employees: survivingEmployees, removedIds } = applyChanges(solverEmployees, changes);

  const existingAssignments: SolverAssignment[] = prior.assignments
    .filter((a) => !removedIds.has(a.employeeId))
    .map((a) => ({
      employeeId: a.employeeId,
      dayOfWeek: a.dayOfWeek,
      startMin: a.startMin,
      endMin: a.endMin,
      breakStarts: a.breakStarts,
      paidMinutes: a.paidMinutes,
      locked: a.locked,
      source: a.source,
    }));

  const request: SolveRequest = {
    mode: "RESOLVE",
    config: storeConfig(),
    timeLimitSeconds: SOLVER_TIME_LIMIT,
    employees: survivingEmployees,
    existingAssignments,
  };
  const response = await callSolver(request);

  const schedule = await persistSchedule({
    name: opts.name ?? `${prior.name} (re-solved)`,
    weekStartISO,
    generatedFrom: "RESOLVE",
    jobType: "RESOLVE",
    request,
    response,
  });

  // Mark the applied changes & flip employee status for terminations.
  await prisma.$transaction([
    prisma.personnelChange.updateMany({ where: { status: "QUEUED" }, data: { status: "APPLIED" } }),
    prisma.employee.updateMany({ where: { id: { in: [...removedIds] } }, data: { active: false } }),
  ]);

  return schedule;
}

// --- Gap recompute after a manual edit (slider/grid) -----------------------

/** Recompute the gap report from the schedule's current assignments and persist
 *  it. Used after a manual edit in the grid/slider so the gap report stays live
 *  without a solver round-trip. */
export async function recomputeGaps(scheduleId: string): Promise<GapItem[]> {
  const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId }, include: { assignments: true } });
  if (!schedule) throw new Error("Schedule not found");

  const employees = await prisma.employee.findMany({ include: { availability: true } });
  const empLite: EmployeeLite[] = employees.map((e) => ({
    id: e.id,
    name: e.name,
    isManager: e.isManager,
    isGM: e.isGM,
    isMinor: e.isMinor,
    availability: e.availability.map((a) => ({ dayOfWeek: a.dayOfWeek, startMin: a.startMin, endMin: a.endMin })),
  }));
  const shifts: ShiftLite[] = schedule.assignments.map((a) => ({
    employeeId: a.employeeId,
    dayOfWeek: a.dayOfWeek,
    startMin: a.startMin,
    endMin: a.endMin,
    breakStarts: a.breakStarts,
    paidMinutes: a.paidMinutes,
  }));

  const gaps = computeGapReport(empLite, shifts);
  await prisma.schedule.update({ where: { id: scheduleId }, data: { gaps: gaps as unknown as Prisma.InputJsonValue } });
  return gaps;
}

export type GapList = GapItem[];

export { deriveShift };
